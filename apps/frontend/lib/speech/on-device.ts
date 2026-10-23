/**
 * The main-thread half of on-device speech: the microphone, and the worker
 * that listens to it (./on-device.worker.ts, which explains the models).
 *
 * The microphone runs at whatever rate the phone likes — 44.1 or 48 kHz — and
 * is brought down to the 16 kHz the models expect here, not by asking the
 * AudioContext for 16 kHz: Firefox refuses to connect a microphone to a
 * context at a different rate, and the resampling is a few lines.
 */

export type OnDeviceEvent =
  | { type: "progress"; loaded: number; total: number }
  | { type: "ready" }
  | { type: "error"; message: string }
  | { type: "speech" }
  | { type: "transcribing" }
  | { type: "transcript"; text: string }
  | { type: "silence" };

export type OnDeviceMode = "talk" | "handsfree";

const TARGET_RATE = 16000;

/** Everything on-device listening needs from the browser. */
export function onDeviceSupported(): boolean {
  if (typeof window === "undefined") return false;
  return (
    typeof Worker !== "undefined" &&
    typeof WebAssembly !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    (typeof AudioContext !== "undefined" ||
      typeof (window as unknown as { webkitAudioContext?: unknown }).webkitAudioContext !== "undefined")
  );
}

/**
 * Down to 16 kHz by averaging, carrying the fractional position across chunks
 * so the seams between them do not click. Averaging is also the low-pass, and
 * for speech that is enough.
 */
export class Downsampler {
  private readonly ratio: number;
  private position = 0;
  private carry: number[] = [];

  constructor(inputRate: number) {
    this.ratio = inputRate / TARGET_RATE;
  }

  process(input: Float32Array): Float32Array {
    if (this.ratio === 1) return input.slice();
    const source = this.carry.length > 0 ? Float32Array.from([...this.carry, ...input]) : input;
    const out: number[] = [];
    let position = this.position;
    while (position + this.ratio <= source.length) {
      const start = Math.floor(position);
      const end = Math.floor(position + this.ratio);
      let sum = 0;
      for (let i = start; i < end; i++) sum += source[i];
      out.push(sum / Math.max(1, end - start));
      position += this.ratio;
    }
    const keepFrom = Math.floor(position);
    this.carry = Array.from(source.subarray(keepFrom));
    this.position = position - keepFrom;
    return Float32Array.from(out);
  }
}

/** Posts the raw microphone frames out of the audio thread, in batches. */
const WORKLET_SOURCE = `
class Tap extends AudioWorkletProcessor {
  constructor() { super(); this.buffer = []; this.length = 0; }
  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (channel) {
      this.buffer.push(channel.slice());
      this.length += channel.length;
      if (this.length >= 2048) {
        const out = new Float32Array(this.length);
        let offset = 0;
        for (const part of this.buffer) { out.set(part, offset); offset += part.length; }
        this.port.postMessage(out, [out.buffer]);
        this.buffer = []; this.length = 0;
      }
    }
    return true;
  }
}
registerProcessor("wta-mic-tap", Tap);
`;

/**
 * One per page. Loading the models is the expensive part and happens once;
 * the microphone is opened and closed around each use, so the phone's
 * "recording" indicator is only on while the scorer is actually listening.
 */
export class OnDeviceSpeech {
  private worker: Worker | null = null;
  private ready = false;
  private loadPromise: Promise<void> | null = null;
  private stream: MediaStream | null = null;
  private context: AudioContext | null = null;
  private node: AudioNode | null = null;
  private listeners = new Set<(event: OnDeviceEvent) => void>();

  subscribe(listener: (event: OnDeviceEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  get isReady(): boolean {
    return this.ready;
  }

  private emit(event: OnDeviceEvent) {
    for (const listener of this.listeners) listener(event);
  }

  private ensureWorker(): Worker {
    if (this.worker) return this.worker;
    const worker = new Worker(new URL("./on-device.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event: MessageEvent<OnDeviceEvent>) => {
      if (event.data.type === "ready") this.ready = true;
      this.emit(event.data);
    };
    worker.onerror = (event) => {
      this.emit({ type: "error", message: event.message || "The speech worker stopped." });
    };
    this.worker = worker;
    return worker;
  }

  /** Download (first time) and start the models. Resolves when ready. */
  load(): Promise<void> {
    if (this.ready) return Promise.resolve();
    if (this.loadPromise) return this.loadPromise;
    const worker = this.ensureWorker();
    this.loadPromise = new Promise<void>((resolve, reject) => {
      const off = this.subscribe((event) => {
        if (event.type === "ready") {
          off();
          resolve();
        } else if (event.type === "error") {
          off();
          this.loadPromise = null;
          reject(new Error(event.message));
        }
      });
    });
    worker.postMessage({ type: "load" });
    return this.loadPromise;
  }

  /** Open the microphone and listen. The models must be loaded. */
  async start(mode: OnDeviceMode): Promise<void> {
    const worker = this.ensureWorker();
    await this.closeMic();
    worker.postMessage({ type: "mode", mode });

    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        // The room is loud; let the phone take the edge off before Silero
        // decides what is speech.
        noiseSuppression: true,
        autoGainControl: true,
      },
    });

    const Context =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const context = new Context();
    this.context = context;
    if (context.state === "suspended") await context.resume();

    const source = context.createMediaStreamSource(this.stream);
    const downsampler = new Downsampler(context.sampleRate);
    const send = (chunk: Float32Array) => {
      const samples = downsampler.process(chunk);
      if (samples.length > 0) worker.postMessage({ type: "audio", samples }, [samples.buffer]);
    };

    if (context.audioWorklet) {
      const url = URL.createObjectURL(new Blob([WORKLET_SOURCE], { type: "application/javascript" }));
      try {
        await context.audioWorklet.addModule(url);
      } finally {
        URL.revokeObjectURL(url);
      }
      const tap = new AudioWorkletNode(context, "wta-mic-tap");
      tap.port.onmessage = (event: MessageEvent<Float32Array>) => send(event.data);
      source.connect(tap);
      this.node = tap;
    } else {
      // Older Safari. Deprecated, but it is what those phones have.
      const processor = context.createScriptProcessor(4096, 1, 1);
      processor.onaudioprocess = (event) => send(event.inputBuffer.getChannelData(0).slice());
      source.connect(processor);
      processor.connect(context.destination);
      this.node = processor;
    }
  }

  /** Talk mode: the scorer tapped again, so the sentence is over. */
  flush() {
    this.worker?.postMessage({ type: "flush" });
  }

  async stop(): Promise<void> {
    this.worker?.postMessage({ type: "mode", mode: "off" });
    await this.closeMic();
  }

  private async closeMic() {
    try {
      this.node?.disconnect();
    } catch {
      // Already disconnected.
    }
    this.node = null;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    const context = this.context;
    this.context = null;
    if (context && context.state !== "closed") {
      try {
        await context.close();
      } catch {
        // Closing a closed context.
      }
    }
  }
}

let shared: OnDeviceSpeech | null = null;

/** The page's one instance, so the models are loaded once per visit. */
export function onDeviceSpeech(): OnDeviceSpeech {
  if (!shared) shared = new OnDeviceSpeech();
  return shared;
}
