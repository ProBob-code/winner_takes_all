"use client";

/**
 * Scoring by voice, for the scorer whose hands are full.
 *
 * THREE WAYS IN, BEST FIRST
 * 1. On this device (the default). Silero VAD and the Moonshine model run in
 *    the browser itself — see lib/speech/on-device.worker.ts — so audio never
 *    leaves the phone and it works with the bar's wifi down. It costs one
 *    download of about 40 MB, which is asked for, not assumed.
 * 2. The browser's own speech service (Web Speech API). Nothing to download,
 *    but Chrome sends the audio to Google and it needs a connection. The
 *    fallback for a phone that cannot run the model.
 * 3. Handy (github.com/cjpais/Handy) on a laptop, or typing. Handy has no
 *    API; it pastes into whatever has focus, so this is a text field.
 *
 * "Talk" listens for one sentence. "Hands-free" keeps listening and only acts
 * on what follows "Bob note the points", so table chatter is ignored.
 *
 * WHAT IT DOES WITH WHAT IT HEARS
 * Turns it into the same taps the buttons make (lib/voice-command.ts) and
 * hands them to the page's scorer, so they go through the same offline outbox
 * and the server de-duplicates them the same way. Before sending, each tap is
 * run through the board's own rules (lib/local-score.ts), so "two balls" for
 * a side with one ball left is reported as one, not shown as two and then
 * corrected by the next poll.
 *
 * WHAT IT WILL NOT DO BY VOICE ALONE
 * End a frame. The black is the one tap with no undo, so a spoken black waits
 * for a thumb on the screen. Everything else can be taken back with "scratch
 * that" or the Undo button.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  applyLocalScore,
  POOL_RULES,
  type LocalScoreEvent,
  type ScoreableMatch,
} from "@/lib/local-score";
import {
  describeVoiceEvents,
  findWakePhrase,
  inverseOf,
  parseBestAlternative,
  type VoiceEvent,
  type VoicePlayer,
  type VoiceSport,
} from "@/lib/voice-command";
import { onDeviceSpeech, onDeviceSupported, type OnDeviceEvent } from "@/lib/speech/on-device";

/** The slice of the Web Speech API this uses; not in TypeScript's DOM lib. */
interface RecognitionAlternative {
  transcript: string;
}
interface RecognitionResult {
  isFinal: boolean;
  length: number;
  [index: number]: RecognitionAlternative;
}
interface RecognitionEvent {
  resultIndex: number;
  results: { length: number; [index: number]: RecognitionResult };
}
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
}

function recognitionConstructor(): (new () => Recognition) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => Recognition;
    webkitSpeechRecognition?: new () => Recognition;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

type Source = "device" | "browser" | "handy";
type ModelState = "unknown" | "consent" | "loading" | "ready";
type Listening = "off" | "talk" | "handsfree";
type Feedback = { tone: "ok" | "warn" | "error" | "info"; text: string } | null;

const SOURCE_KEY = "wta-voice-source";
/** Set once the scorer has agreed to the download, so it is asked once. */
const CONSENT_KEY = "wta-voice-model-ok";
/** What the first on-device use downloads, for the prompt. */
const DOWNLOAD_MB = 40;

const readStorage = (key: string): string | null => {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};

const writeStorage = (key: string, value: string) => {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Remembered for this visit only.
  }
};
/** How long "Bob note the points" keeps the ear open for the next sentence. */
const ARMED_MS = 8000;
/** Indian English: the names at these tables are Indian names. */
const LANG = "en-IN";

export interface VoiceScorerProps {
  /** The live frame as the board shows it, queued taps included. */
  match: ScoreableMatch;
  players: VoicePlayer[];
  sport: VoiceSport;
  /** Queue one tap, exactly as a button would. Resolves once it is on disk. */
  onScore: (teamId: string, type: LocalScoreEvent) => Promise<void>;
}

export function VoiceScorer({ match, players, sport, onScore }: VoiceScorerProps) {
  const [browserSupported, setBrowserSupported] = useState(false);
  const [deviceSupported, setDeviceSupported] = useState(false);
  const [source, setSource] = useState<Source>("device");
  const [model, setModel] = useState<ModelState>("unknown");
  const [progress, setProgress] = useState<{ loaded: number; total: number } | null>(null);
  /** What to start once the model is ready. */
  const [waitingFor, setWaitingFor] = useState<Exclude<Listening, "off"> | null>(null);
  const [listening, setListening] = useState<Listening>("off");
  const [interim, setInterim] = useState("");
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [armed, setArmed] = useState(false);
  const [lastBatch, setLastBatch] = useState<VoiceEvent[]>([]);
  const [pendingBlack, setPendingBlack] = useState<string | null>(null);
  const [help, setHelp] = useState(false);
  const [handyText, setHandyText] = useState("");

  const recognitionRef = useRef<Recognition | null>(null);
  const listeningRef = useRef<Listening>("off");
  const armedUntilRef = useRef(0);
  const heardSomethingRef = useRef(false);
  const handyRef = useRef<HTMLInputElement | null>(null);
  /** The on-device engine has the mic open. */
  const deviceListeningRef = useRef(false);

  // Recogniser callbacks outlive renders; they read the current frame from here.
  const matchRef = useRef(match);
  const playersRef = useRef(players);
  const lastBatchRef = useRef(lastBatch);
  matchRef.current = match;
  playersRef.current = players;
  lastBatchRef.current = lastBatch;

  useEffect(() => {
    const browser = recognitionConstructor() !== null;
    const device = onDeviceSupported();
    setBrowserSupported(browser);
    setDeviceSupported(device);
    // "mic" was the browser's speech service before on-device existed.
    const saved = readStorage(SOURCE_KEY);
    const wanted: Source | null =
      saved === "mic"
        ? "browser"
        : saved === "device" || saved === "browser" || saved === "handy"
          ? saved
          : null;
    const usable = (s: Source) => (s === "device" ? device : s === "browser" ? browser : true);
    setSource(wanted && usable(wanted) ? wanted : device ? "device" : browser ? "browser" : "handy");
    if (device && onDeviceSpeech().isReady) setModel("ready");
  }, []);

  const nameOf = useCallback(
    (id: string) => playersRef.current.find((p) => p.id === id)?.name ?? "?",
    []
  );

  const buzz = () => {
    try {
      navigator.vibrate?.(35);
    } catch {
      // Not every phone can, and it is only a nicety.
    }
  };

  /**
   * Send a batch, in order, keeping only the taps the rules say do something.
   *
   * The black never goes from here: it is held for a tap on the screen.
   */
  const apply = useCallback(
    async (events: VoiceEvent[]) => {
      let board = matchRef.current;
      const sent: VoiceEvent[] = [];
      const skipped: VoiceEvent[] = [];
      let black: string | null = null;

      for (const event of events) {
        if (event.type === "BLACK") {
          black = event.teamId;
          continue;
        }
        const result = applyLocalScore(board, event.teamId, event.type);
        if (!result.changed) {
          skipped.push(event);
          continue;
        }
        board = result.match;
        sent.push(event);
        await onScore(event.teamId, event.type);
        if (result.ended) break;
      }

      if (sent.length > 0) {
        setLastBatch(sent);
        buzz();
      }
      if (black && board.status === "LIVE") setPendingBlack(black);

      const said = sent.length > 0 ? describeVoiceEvents(sent, nameOf) : "";
      const notDone =
        skipped.length > 0 ? `Not counted (the board would not allow it): ${describeVoiceEvents(skipped, nameOf)}` : "";
      if (said) {
        setFeedback({ tone: notDone ? "warn" : "ok", text: notDone ? `${said}. ${notDone}` : said });
      } else if (notDone) {
        setFeedback({ tone: "warn", text: notDone });
      } else if (black) {
        setFeedback(null);
      }
    },
    [nameOf, onScore]
  );

  const undoLast = useCallback(async () => {
    const batch = lastBatchRef.current;
    if (batch.length === 0) {
      setFeedback({ tone: "warn", text: "Nothing said by voice to take back." });
      return;
    }
    let board = matchRef.current;
    for (const event of [...batch].reverse()) {
      const inverse = inverseOf(event.type);
      if (!inverse) continue;
      const result = applyLocalScore(board, event.teamId, inverse);
      if (!result.changed) continue;
      board = result.match;
      await onScore(event.teamId, inverse);
    }
    setLastBatch([]);
    buzz();
    setFeedback({ tone: "info", text: `Taken back: ${describeVoiceEvents(batch, nameOf)}` });
  }, [nameOf, onScore]);

  /** One utterance, from either source. `requireWake` is hands-free mode. */
  const handleUtterance = useCallback(
    (alternatives: string[], requireWake: boolean) => {
      const first = alternatives[0] ?? "";
      const wake = findWakePhrase(first);
      const now = Date.now();

      if (requireWake && !wake.found && now > armedUntilRef.current) {
        // Not for us: table talk. Say nothing.
        return;
      }

      const parsed = parseBestAlternative(alternatives, playersRef.current, sport);

      if (parsed.wake && parsed.events.length === 0 && !parsed.undoLast && parsed.heard === "") {
        armedUntilRef.current = now + ARMED_MS;
        setArmed(true);
        window.setTimeout(() => {
          if (Date.now() >= armedUntilRef.current) setArmed(false);
        }, ARMED_MS + 50);
        setFeedback({ tone: "info", text: "Listening — say the player and what happened." });
        return;
      }

      armedUntilRef.current = 0;
      setArmed(false);

      if (parsed.undoLast) {
        void undoLast();
        return;
      }
      if (parsed.events.length > 0) {
        void apply(parsed.events).then(() => {
          if (parsed.problems.length > 0) {
            setFeedback((prev) => ({
              tone: "warn",
              text: [prev?.text, ...parsed.problems].filter(Boolean).join(" "),
            }));
          }
        });
        return;
      }
      setFeedback({ tone: "warn", text: `Heard “${first.trim()}”. ${parsed.problems.join(" ")}` });
    },
    [apply, sport, undoLast]
  );

  const stopListening = useCallback(() => {
    listeningRef.current = "off";
    setListening("off");
    setInterim("");
    setArmed(false);
    setWaitingFor(null);
    armedUntilRef.current = 0;
    if (deviceListeningRef.current) {
      deviceListeningRef.current = false;
      void onDeviceSpeech().stop();
    }
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    if (recognition) {
      recognition.onend = null;
      try {
        recognition.abort();
      } catch {
        // Already stopped.
      }
    }
  }, []);

  const startBrowser = useCallback(
    (mode: Exclude<Listening, "off">) => {
      const Ctor = recognitionConstructor();
      if (!Ctor) return;
      stopListening();

      const recognition = new Ctor();
      recognition.lang = LANG;
      recognition.continuous = mode === "handsfree";
      recognition.interimResults = true;
      recognition.maxAlternatives = 3;
      heardSomethingRef.current = false;

      recognition.onresult = (event) => {
        let partial = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          if (result.isFinal) {
            const alternatives: string[] = [];
            for (let k = 0; k < result.length; k++) alternatives.push(result[k].transcript);
            heardSomethingRef.current = true;
            setInterim("");
            handleUtterance(alternatives, listeningRef.current === "handsfree");
          } else {
            partial += result[0]?.transcript ?? "";
          }
        }
        if (partial) setInterim(partial);
      };

      recognition.onerror = (event) => {
        if (event.error === "no-speech" || event.error === "aborted") return;
        const why =
          event.error === "not-allowed" || event.error === "service-not-allowed"
            ? "The microphone is blocked for this site. Allow it in the browser's site settings."
            : event.error === "network"
              ? "The browser's speech service needs a connection, and there isn't one. Switch to “On this phone” under ?, which works offline."
              : event.error === "audio-capture"
                ? "No microphone found."
                : `Speech stopped (${event.error}).`;
        setFeedback({ tone: "error", text: why });
        stopListening();
      };

      recognition.onend = () => {
        if (listeningRef.current === "handsfree" && document.visibilityState === "visible") {
          // Browsers end continuous recognition after a silence or a minute.
          // Hands-free means it comes back by itself.
          window.setTimeout(() => {
            if (listeningRef.current !== "handsfree" || recognitionRef.current !== recognition) return;
            try {
              recognition.start();
            } catch {
              stopListening();
            }
          }, 250);
          return;
        }
        // "Bob note the points" said into Talk: the sentence ended, but the
        // score is still to come, so keep listening for it.
        if (listeningRef.current === "talk" && Date.now() < armedUntilRef.current) {
          heardSomethingRef.current = false;
          try {
            recognition.start();
            return;
          } catch {
            // Fall through and stop.
          }
        }
        if (listeningRef.current === "talk" && !heardSomethingRef.current) {
          setFeedback({ tone: "warn", text: "Didn't hear anything. Tap Talk, then speak." });
        }
        if (recognitionRef.current === recognition) {
          recognitionRef.current = null;
          listeningRef.current = "off";
          setListening("off");
          setInterim("");
        }
      };

      recognitionRef.current = recognition;
      listeningRef.current = mode;
      setListening(mode);
      setFeedback(
        mode === "handsfree"
          ? { tone: "info", text: "Hands-free on. Say “Bob note the points”, then the score." }
          : null
      );
      try {
        recognition.start();
      } catch {
        setFeedback({ tone: "error", text: "The microphone would not start. Try again." });
        stopListening();
      }
    },
    [handleUtterance, stopListening]
  );

  /** Open the mic through the on-device engine. The model must be ready. */
  const startDevice = useCallback(
    async (mode: Exclude<Listening, "off">) => {
      stopListening();
      listeningRef.current = mode;
      setListening(mode);
      setFeedback(
        mode === "handsfree"
          ? { tone: "info", text: "Hands-free on. Say “Bob note the points”, then the score." }
          : null
      );
      try {
        deviceListeningRef.current = true;
        await onDeviceSpeech().start(mode);
      } catch (error) {
        const denied = error instanceof DOMException && error.name === "NotAllowedError";
        stopListening();
        setFeedback({
          tone: "error",
          text: denied
            ? "The microphone is blocked for this site. Allow it in the browser's site settings."
            : "The microphone would not start. Try again.",
        });
      }
    },
    [stopListening]
  );

  /** Talk or hands-free with the on-device model, downloading it if agreed. */
  const startOnDevice = useCallback(
    (mode: Exclude<Listening, "off">) => {
      const engine = onDeviceSpeech();
      if (engine.isReady) {
        void startDevice(mode);
        return;
      }
      setWaitingFor(mode);
      if (readStorage(CONSENT_KEY) !== "yes") {
        setModel("consent");
        return;
      }
      setModel("loading");
      engine.load().then(
        () => setModel("ready"),
        (error: Error) => {
          setModel("unknown");
          setWaitingFor(null);
          setProgress(null);
          setFeedback({ tone: "error", text: error.message });
        }
      );
    },
    [startDevice]
  );

  // The model finished loading: start whatever the scorer asked for.
  useEffect(() => {
    if (model === "ready" && waitingFor) {
      const mode = waitingFor;
      setWaitingFor(null);
      setProgress(null);
      void startDevice(mode);
    }
  }, [model, waitingFor, startDevice]);

  // What the on-device engine hears.
  useEffect(() => {
    return onDeviceSpeech().subscribe((event: OnDeviceEvent) => {
      switch (event.type) {
        case "progress":
          setProgress({ loaded: event.loaded, total: event.total });
          return;
        case "speech":
          if (deviceListeningRef.current) setInterim("…");
          return;
        case "transcribing":
          if (deviceListeningRef.current) setInterim("writing it down…");
          return;
        case "transcript": {
          if (!deviceListeningRef.current) return;
          setInterim("");
          const mode = listeningRef.current;
          if (event.text) handleUtterance([event.text], mode === "handsfree");
          // Talk is one sentence — unless that sentence was "Bob note the
          // points", in which case the worker is still listening for the score.
          if (mode === "talk" && Date.now() >= armedUntilRef.current) stopListening();
          return;
        }
        case "silence":
          if (listeningRef.current === "talk" && deviceListeningRef.current) {
            stopListening();
            setFeedback({ tone: "warn", text: "Didn't hear anything. Tap Talk, then speak." });
          }
          return;
        case "error":
          if (deviceListeningRef.current) {
            stopListening();
            setFeedback({ tone: "error", text: event.message });
          }
          return;
      }
    });
  }, [handleUtterance, startDevice, stopListening]);

  const agreeToDownload = () => {
    writeStorage(CONSENT_KEY, "yes");
    startOnDevice(waitingFor ?? "talk");
  };

  const startListening = (mode: Exclude<Listening, "off">) =>
    source === "device" ? startOnDevice(mode) : startBrowser(mode);

  // Hidden tab, locked phone: stop holding the mic. Unmount: let it go.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden" && listeningRef.current !== "off") stopListening();
    };
    document.addEventListener("visibilitychange", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      stopListening();
    };
  }, [stopListening]);

  // A frame that ends takes its pending black and its undo with it.
  useEffect(() => {
    if (match.status !== "LIVE") {
      setPendingBlack(null);
      setLastBatch([]);
    }
  }, [match.status]);

  const chooseSource = (next: Source) => {
    stopListening();
    setSource(next);
    setFeedback(null);
    if (model === "consent") setModel("unknown");
    writeStorage(SOURCE_KEY, next);
    if (next === "handy") window.setTimeout(() => handyRef.current?.focus(), 0);
  };

  const onTalk = () => {
    if (source === "handy") {
      handyRef.current?.focus();
      setFeedback({ tone: "info", text: "Press your Handy shortcut and speak. The words land here and are scored." });
      return;
    }
    if (listening === "handsfree") {
      // Already listening: Talk just opens the ear without the wake phrase.
      armedUntilRef.current = Date.now() + ARMED_MS;
      setArmed(true);
      setFeedback({ tone: "info", text: "Go ahead — say the player and what happened." });
      return;
    }
    if (listening === "talk") {
      if (source === "device") onDeviceSpeech().flush();
      else recognitionRef.current?.stop();
      return;
    }
    if (model === "loading") return;
    startListening("talk");
  };

  const submitHandy = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setHandyText("");
    handleUtterance([trimmed], false);
  };

  const confirmBlack = async () => {
    if (!pendingBlack) return;
    const teamId = pendingBlack;
    setPendingBlack(null);
    await onScore(teamId, "BLACK");
    setLastBatch([]);
    buzz();
    setFeedback({ tone: "ok", text: `${nameOf(teamId)}: the black` });
  };

  const micAvailable =
    (source === "device" && deviceSupported) || (source === "browser" && browserSupported);
  const example = players.length >= 2
    ? `“${firstWord(players[0].name)} two balls one foul”`
    : "“Asha two balls one foul”";

  return (
    <section className="voice" aria-label="Score by voice">
      <div className="voice-bar">
        <button
          type="button"
          className={`voice-talk${listening === "talk" || armed ? " live" : ""}`}
          onClick={onTalk}
          aria-pressed={listening === "talk"}
        >
          <MicIcon />
          <span>
            {model === "loading" && waitingFor
              ? "Getting ready…"
              : listening === "talk"
                ? "Listening…"
                : armed
                  ? "Go ahead"
                  : "Talk"}
          </span>
        </button>

        {micAvailable && (
          <button
            type="button"
            className={`voice-chip${listening === "handsfree" ? " on" : ""}`}
            onClick={() => (listening === "handsfree" ? stopListening() : startListening("handsfree"))}
            aria-pressed={listening === "handsfree"}
            title="Keep listening for “Bob note the points”"
          >
            {listening === "handsfree" ? "Hands-free on" : "Hands-free"}
          </button>
        )}

        {source === "handy" && (
          <input
            ref={handyRef}
            className="voice-handy"
            value={handyText}
            placeholder="Handy pastes here"
            aria-label="Spoken score, from Handy or typed"
            onChange={(e) => setHandyText(e.target.value)}
            onPaste={(e) => {
              // Handy pastes the whole sentence at once: score it as it lands.
              const pasted = e.clipboardData.getData("text");
              if (pasted.trim()) {
                e.preventDefault();
                submitHandy(`${handyText} ${pasted}`);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submitHandy(handyText);
              }
            }}
            enterKeyHint="send"
            autoComplete="off"
          />
        )}

        <button
          type="button"
          className="voice-chip quiet"
          onClick={() => setHelp((v) => !v)}
          aria-expanded={help}
        >
          ?
        </button>
      </div>

      {(interim || feedback) && (
        <div className={`voice-feedback ${interim ? "info" : feedback?.tone}`} role="status" aria-live="polite">
          <span className="voice-feedback-text">{interim ? `“${interim}”` : feedback?.text}</span>
          {!interim && lastBatch.length > 0 && feedback?.tone !== "info" && (
            <button type="button" className="voice-chip" onClick={() => void undoLast()}>
              Undo
            </button>
          )}
        </div>
      )}

      {model === "consent" && source === "device" && (
        <div className="voice-consent" role="dialog" aria-label="Download the speech model">
          <span>
            Voice runs on this phone: nothing said leaves it, and it works without wifi. It needs a
            one-time download of about {DOWNLOAD_MB} MB — best done on the venue's wifi.
          </span>
          <div className="voice-black-actions">
            <button type="button" className="staff-btn" onClick={agreeToDownload}>
              Download
            </button>
            <button
              type="button"
              className="staff-btn ghost"
              onClick={() => {
                setModel("unknown");
                setWaitingFor(null);
              }}
            >
              Not now
            </button>
          </div>
        </div>
      )}

      {model === "loading" && (
        <div className="voice-feedback info" role="status" aria-live="polite">
          <span className="voice-feedback-text">
            {progress && progress.total > 0
              ? `Downloading the speech model: ${Math.round(progress.loaded / 1e6)} of ${Math.round(progress.total / 1e6)} MB. Once only.`
              : "Starting the speech model…"}
          </span>
          {progress && progress.total > 0 && (
            <progress className="voice-progress" value={progress.loaded} max={progress.total} />
          )}
        </div>
      )}

      {pendingBlack && (
        <div className="voice-black" role="alertdialog" aria-label="Confirm the black">
          <span>
            Heard: <strong>{nameOf(pendingBlack)}</strong> potted the black. That ends the frame
            {blackIsEarly(match, pendingBlack)
              ? ` — and before all seven, so it goes to ${nameOf(otherSide(match, pendingBlack))}.`
              : "."}
          </span>
          <div className="voice-black-actions">
            <button type="button" className="staff-btn black" onClick={() => void confirmBlack()}>
              Confirm black
            </button>
            <button type="button" className="staff-btn ghost" onClick={() => setPendingBlack(null)}>
              Not the black
            </button>
          </div>
        </div>
      )}

      {help && (
        <div className="voice-help">
          <p>
            Say the player, then what happened: {example}, “{players[1] ? firstWord(players[1].name) : "Ravi"}{" "}
            {sport === "FOOTBALL" ? "goal" : "point"}”, “two balls for{" "}
            {players[0] ? firstWord(players[0].name) : "Asha"}”.
            {sport === "POOL" && " “The black” asks before it counts."} “Scratch that” takes back the last one.
          </p>
          <p>
            <strong>Hands-free</strong> keeps listening and only acts after “Bob note the points”.
          </p>
          <p>
            <strong>On this phone</strong> listens with a speech model that runs on the phone itself:
            private, and it works offline after a one-time download. <strong>Browser speech</strong>{" "}
            needs nothing downloaded, but sends the audio to the browser's service (Google, for Chrome)
            and needs a connection. <strong>Handy</strong> is for a laptop: click the field, press your
            Handy shortcut, and speak; if Handy types rather than pastes, turn on its auto-submit.
          </p>
          <div className="voice-source">
            {deviceSupported && (
              <button
                type="button"
                className={`voice-chip${source === "device" ? " on" : ""}`}
                onClick={() => chooseSource("device")}
              >
                On this phone
              </button>
            )}
            {browserSupported && (
              <button
                type="button"
                className={`voice-chip${source === "browser" ? " on" : ""}`}
                onClick={() => chooseSource("browser")}
              >
                Browser speech
              </button>
            )}
            <button
              type="button"
              className={`voice-chip${source === "handy" ? " on" : ""}`}
              onClick={() => chooseSource("handy")}
            >
              Handy / typed
            </button>
          </div>
          {!deviceSupported && !browserSupported && (
            <p className="muted">This browser cannot listen. Use Handy, or a current Chrome or Safari.</p>
          )}
        </div>
      )}
    </section>
  );
}

/** The black before all seven loses the frame; the scorer should hear that. */
function blackIsEarly(match: ScoreableMatch, teamId: string): boolean {
  const balls = teamId === match.team_a_id ? match.balls_potted_a : match.balls_potted_b;
  return balls < POOL_RULES.BALLS_PER_SIDE;
}

function otherSide(match: ScoreableMatch, teamId: string): string {
  return teamId === match.team_a_id ? match.team_b_id : match.team_a_id;
}

function firstWord(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

function MicIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 10a7 7 0 0 0 14 0" />
      <path d="M12 17v4" />
    </svg>
  );
}
