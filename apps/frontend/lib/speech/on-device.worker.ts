/**
 * Speech to text on the phone itself, in a Web Worker.
 *
 * WHAT THIS IS
 * The two halves of Handy that matter, without Handy: Silero VAD to tell
 * speech from the room, and a Whisper-class model to write it down — here
 * Moonshine, which Useful Sensors built for exactly this (short live
 * commands on small devices; its cost grows with the length of the audio,
 * where Whisper always pays for thirty seconds). Both run through ONNX
 * Runtime in WebAssembly via transformers.js, so nothing is sent anywhere and
 * it keeps working when the bar's wifi does not.
 *
 * WHY NOT DEEPSPEECH
 * Mozilla discontinued it and archived the repository in June 2025; the last
 * models are from 2020, it never had a supported browser build, and its
 * accuracy in a noisy room is well behind Moonshine and Whisper. Its one good
 * idea — a scorer that knows the words it expects — is kept, in a different
 * place: lib/voice-command.ts only accepts a small vocabulary and the two names
 * at the table, and matches them forgivingly.
 *
 * COST
 * About 27 MB of model and 2 MB of VAD, fetched from huggingface.co the first
 * time and kept in the browser's Cache API after that, plus ONNX Runtime's
 * WebAssembly from jsDelivr, also cached. Loaded only when someone asks for
 * on-device listening.
 *
 * PROTOCOL (main thread <-> worker)
 *   in:  { type: "load" }
 *        { type: "mode", mode: "off" | "talk" | "handsfree" }
 *        { type: "audio", samples: Float32Array }   16 kHz mono
 *        { type: "flush" }                          end the sentence now
 *   out: { type: "progress", loaded, total }
 *        { type: "ready" } | { type: "error", message }
 *        { type: "speech" }                         someone started talking
 *        { type: "transcribing" }
 *        { type: "transcript", text }
 *        { type: "silence" }                        talk mode heard nothing
 */

import { AutoModel, Tensor, env, pipeline, type ProgressInfo } from "@huggingface/transformers";

const SAMPLE_RATE = 16000;
/** Silero's frame at 16 kHz. */
const FRAME = 512;
const SPEECH_THRESHOLD = 0.5;
/** Below this a frame counts as silence; between the two, it carries on. */
const EXIT_THRESHOLD = 0.35;
/** A pause this long ends a sentence. Long enough for "Asha… two balls". */
const END_SILENCE_MS = 700;
/** Kept from before speech was detected, so the first word is not clipped. */
const PRE_ROLL_MS = 300;
/** Shorter than this is a cough or a clack of balls. */
const MIN_SPEECH_MS = 250;
/** A score is a sentence, not a speech. */
const MAX_UTTERANCE_MS = 8000;
/** Talk mode gives up after this long with nothing said. */
const TALK_TIMEOUT_MS = 7000;

const ASR_MODEL = "onnx-community/moonshine-tiny-ONNX";
/** Moonshine tiny at q8 (encoder + merged decoder) plus Silero, in bytes. */
const EXPECTED_BYTES = 29_500_000;
const VAD_MODEL = "onnx-community/silero-vad";

const ms = (samples: number) => (samples / SAMPLE_RATE) * 1000;
const samplesFor = (milliseconds: number) => Math.round((milliseconds / 1000) * SAMPLE_RATE);

type Mode = "off" | "talk" | "handsfree";

type Incoming =
  | { type: "load" }
  | { type: "mode"; mode: Mode }
  | { type: "audio"; samples: Float32Array }
  | { type: "flush" };

const post = (message: unknown) => (self as unknown as Worker).postMessage(message);

env.allowLocalModels = false;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let transcriber: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let vad: any = null;
let vadState: Tensor | null = null;
let vadRate: Tensor | null = null;
let loading: Promise<void> | null = null;

let mode: Mode = "off";
let modeStartedAt = 0;
/** Audio waiting for a whole Silero frame. */
let pending = new Float32Array(0);
/** The last PRE_ROLL_MS before speech. */
let preRoll: Float32Array[] = [];
let preRollSamples = 0;
/** The sentence being said. */
let speech: Float32Array[] = [];
let speechSamples = 0;
let inSpeech = false;
let silentSamples = 0;
let busy: Promise<void> = Promise.resolve();
let heardInTalk = false;

function resetVadState() {
  vadState = new Tensor("float32", new Float32Array(2 * 1 * 128), [2, 1, 128]);
}

function resetBuffers() {
  pending = new Float32Array(0);
  preRoll = [];
  preRollSamples = 0;
  speech = [];
  speechSamples = 0;
  inSpeech = false;
  silentSamples = 0;
  resetVadState();
}

async function load(): Promise<void> {
  if (transcriber && vad) return;
  if (loading) return loading;

  // Two downloads, reported as one bar. Files announce their size only as
  // they start, so the total is at least what the two models weigh, and the
  // bar does not run backwards when the second one begins.
  const files = new Map<string, { loaded: number; total: number }>();
  const progress = (info: ProgressInfo) => {
    if (info.status !== "progress") return;
    files.set(`${info.name}/${info.file}`, { loaded: info.loaded, total: info.total });
    let loaded = 0;
    let total = 0;
    for (const file of files.values()) {
      loaded += file.loaded;
      total += file.total;
    }
    post({ type: "progress", loaded, total: Math.max(total, EXPECTED_BYTES) });
  };

  loading = (async () => {
    vad = await AutoModel.from_pretrained(VAD_MODEL, {
      // Silero ships no config.json; it is a single custom ONNX graph.
      config: { model_type: "custom" } as never,
      dtype: "fp32",
      device: "wasm",
      progress_callback: progress,
    });
    vadRate = new Tensor("int64", [BigInt(SAMPLE_RATE)], []);
    resetVadState();

    transcriber = await pipeline("automatic-speech-recognition", ASR_MODEL, {
      dtype: "q8",
      device: "wasm",
      progress_callback: progress,
    });

    // One silent pass, so the first real sentence does not pay for warm-up.
    await transcriber(new Float32Array(SAMPLE_RATE / 2), { max_new_tokens: 4 });
  })();

  try {
    await loading;
    post({ type: "ready" });
  } catch (error) {
    transcriber = null;
    vad = null;
    loading = null;
    post({
      type: "error",
      message:
        error instanceof Error && /fetch|network|Failed to load/i.test(error.message)
          ? "Couldn't download the speech model. It needs a connection the first time only."
          : `The speech model would not start: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}

function concat(chunks: Float32Array[], length: number): Float32Array {
  const out = new Float32Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

async function isSpeech(frame: Float32Array): Promise<number> {
  const input = new Tensor("float32", frame, [1, frame.length]);
  const { stateN, output } = await vad({ input, sr: vadRate, state: vadState });
  vadState = stateN;
  return (output.data as Float32Array)[0];
}

async function transcribe(audio: Float32Array) {
  if (ms(audio.length) < MIN_SPEECH_MS) return;
  post({ type: "transcribing" });
  // Moonshine runs on if not stopped; a command is a few tokens a second.
  const maxTokens = Math.ceil((audio.length / SAMPLE_RATE) * 6.5) + 6;
  const result = await transcriber(audio, { max_new_tokens: maxTokens });
  const text = (Array.isArray(result) ? result[0]?.text : result?.text) ?? "";
  post({ type: "transcript", text: String(text).trim() });
}

/** End the sentence: send what was said to the model. */
async function endUtterance() {
  const audio = concat(speech, speechSamples);
  speech = [];
  speechSamples = 0;
  inSpeech = false;
  silentSamples = 0;
  preRoll = [];
  preRollSamples = 0;
  resetVadState();
  await transcribe(audio);
}

async function processFrame(frame: Float32Array) {
  const probability = await isSpeech(frame);

  if (!inSpeech) {
    preRoll.push(frame);
    preRollSamples += frame.length;
    while (preRollSamples - preRoll[0].length >= samplesFor(PRE_ROLL_MS)) {
      preRollSamples -= preRoll.shift()!.length;
    }
    if (probability >= SPEECH_THRESHOLD) {
      inSpeech = true;
      heardInTalk = true;
      speech = preRoll;
      speechSamples = preRollSamples;
      preRoll = [];
      preRollSamples = 0;
      silentSamples = 0;
      post({ type: "speech" });
    } else if (mode === "talk" && !heardInTalk && Date.now() - modeStartedAt > TALK_TIMEOUT_MS) {
      mode = "off";
      post({ type: "silence" });
    }
    return;
  }

  speech.push(frame);
  speechSamples += frame.length;
  silentSamples = probability < EXIT_THRESHOLD ? silentSamples + frame.length : 0;

  if (ms(silentSamples) >= END_SILENCE_MS || ms(speechSamples) >= MAX_UTTERANCE_MS) {
    await endUtterance();
    // Still listening, in both modes. The page decides when a Talk is over —
    // after "Bob note the points" it is not, and stopping here dropped the
    // score said straight after it. The silence clock starts again.
    if (mode === "talk") {
      heardInTalk = false;
      modeStartedAt = Date.now();
    }
  }
}

function onAudio(samples: Float32Array) {
  if (mode === "off" || !vad || !transcriber) return;
  const joined = new Float32Array(pending.length + samples.length);
  joined.set(pending);
  joined.set(samples, pending.length);

  const frames: Float32Array[] = [];
  let offset = 0;
  for (; offset + FRAME <= joined.length; offset += FRAME) {
    frames.push(joined.slice(offset, offset + FRAME));
  }
  pending = joined.slice(offset);

  // In order, one at a time: Silero carries state from frame to frame.
  busy = busy
    .then(async () => {
      for (const frame of frames) {
        if (mode === "off") return;
        await processFrame(frame);
      }
    })
    .catch((error) => {
      post({ type: "error", message: `Listening failed: ${error instanceof Error ? error.message : String(error)}` });
    });
}

self.onmessage = (event: MessageEvent<Incoming>) => {
  const message = event.data;
  switch (message.type) {
    case "load":
      void load();
      break;
    case "mode":
      busy = busy.then(() => {
        mode = message.mode;
        modeStartedAt = Date.now();
        heardInTalk = false;
        resetBuffers();
      });
      break;
    case "audio":
      onAudio(message.samples);
      break;
    case "flush":
      busy = busy.then(async () => {
        const wasSpeaking = inSpeech && speechSamples > 0;
        if (wasSpeaking) await endUtterance();
        if (mode === "talk") {
          mode = "off";
          if (!wasSpeaking) post({ type: "silence" });
        }
      });
      break;
  }
};
