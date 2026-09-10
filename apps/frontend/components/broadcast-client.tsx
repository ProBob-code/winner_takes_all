"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getApiUrl } from "@/lib/api-config";
import {
  createPeerConnection,
  publishStream,
  registerFeed,
  endFeed,
  watchTransportStats,
  formatBytes,
  closeTracks,
  beaconEndFeed,
  restartIce,
  type StreamFeed,
  type TransportStats,
} from "@/lib/stream-client";
import "@/components/tournament-engine.css";

type Phase = "idle" | "starting" | "live" | "ended" | "error";

/**
 * Re-registering on this cadence keeps the feed alive server-side. Feed state
 * lives in a Durable Object rather than KV, so heartbeats no longer consume a
 * daily write budget and can be frequent enough that a camera which drops out
 * disappears from the viewer's list promptly.
 */
const HEARTBEAT_MS = 20_000;
/** How often we re-check whether the match itself is still running. */
const MATCH_POLL_MS = 15_000;

type Props = {
  arenaId: string;
  matchId: string;
  /** Signed broadcast grant carried by the QR code. */
  token: string;
};

export function BroadcastClient({ arenaId, matchId, token }: Props) {

  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [label, setLabel] = useState("Main camera");
  const [feed, setFeed] = useState<StreamFeed | null>(null);
  const [matchName, setMatchName] = useState<string | null>(null);
  const [usage, setUsage] = useState<TransportStats | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [endedReason, setEndedReason] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const feedRef = useRef<StreamFeed | null>(null);
  const stopStatsRef = useRef<(() => void) | null>(null);
  const missedBeatsRef = useRef(0);

  feedRef.current = feed;

  const teardown = useCallback(
    async (nextPhase: Phase) => {
      stopStatsRef.current?.();
      stopStatsRef.current = null;

      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;

      const current = feedRef.current;

      // Release the tracks at the SFU before dropping the peer connection, so
      // the session's resources go immediately rather than on a timeout.
      if (current) await closeTracks(current.sessionId, current.trackNames);

      pcRef.current?.close();
      pcRef.current = null;

      if (current && token) {
        // Best effort: the TTL would drop it anyway.
        try {
          await endFeed({
            token,
            sessionId: current.sessionId,
            trackNames: current.trackNames,
            label: current.label,
            feedId: current.feedId,
          });
        } catch {
          /* ignore */
        }
      }
      setFeed(null);
      setPhase(nextPhase);
    },
    [token]
  );

  const goLive = useCallback(async () => {
    if (!token) {
      setError("This link is missing its broadcast code. Ask the host to show the QR again.");
      setPhase("error");
      return;
    }

    setPhase("starting");
    setError(null);

    // QR scanners usually open links inside their own in-app webview rather
    // than the real browser, and those webviews commonly expose no
    // mediaDevices at all. That is why a scanned code fails where the same
    // link pasted into Chrome or Safari works.
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setError(
        "This page opened inside an app's built-in browser, which cannot use the camera. " +
          "Use the menu to choose “Open in browser”, or paste the link into Chrome or Safari."
      );
      setPhase("error");
      return;
    }

    try {
      // Rear camera is the sensible default for filming a match.
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: true,
      });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;

      const pc = createPeerConnection();
      pcRef.current = pc;

      const { sessionId, trackNames } = await publishStream(pc, stream);
      const registered = await registerFeed({ token, sessionId, trackNames, label });

      stopStatsRef.current = watchTransportStats(pc, "outbound", setUsage);
      missedBeatsRef.current = 0;
      setWarning(null);
      setFeed(registered);
      setPhase("live");
    } catch (err: any) {
      const message =
        err?.name === "NotAllowedError"
          ? "Camera access was blocked. Allow camera and microphone access, then try again."
          : err?.name === "NotFoundError"
            ? "No camera was found on this device."
            : err?.name === "NotReadableError"
              ? "The camera is already in use by another app. Close it and try again."
              : err?.name === "OverconstrainedError"
                ? "This device has no camera matching the requested settings."
                : err?.message || "Could not start the broadcast.";
      setError(message);
      setPhase("error");
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      pcRef.current?.close();
      pcRef.current = null;
    }
  }, [token, label]);

  // Keep the registry entry alive while we are streaming.
  useEffect(() => {
    if (phase !== "live" || !feed || !token) return;

    const id = setInterval(() => {
      registerFeed({
        token,
        sessionId: feed.sessionId,
        trackNames: feed.trackNames,
        label: feed.label,
        feedId: feed.feedId,
      })
        .then(() => {
          missedBeatsRef.current = 0;
          setWarning(null);
        })
        .catch((err: any) => {
          // The server refuses a heartbeat once the match is no longer live.
          // That is not a network problem to retry through — the camera must
          // come off air immediately, which is the whole point of closing a
          // tournament.
          if (err?.status === 409 || err?.status === 403) {
            setEndedReason(
              err?.message || "The match has ended, so this broadcast has stopped."
            );
            void teardown("ended");
            return;
          }

          // One miss is recoverable, but repeated failures mean the feed will
          // expire and viewers will lose the stream with no explanation.
          missedBeatsRef.current += 1;
          if (missedBeatsRef.current >= 2) {
            setWarning("Losing contact with the server — viewers may stop seeing this feed.");
          }
        });
    }, HEARTBEAT_MS);

    return () => clearInterval(id);
  }, [phase, feed, token]);

  // The stream is tied to the match: when the match finishes, so does this.
  useEffect(() => {
    if (phase !== "live") return;

    let cancelled = false;
    const check = async () => {
      try {
        const base = process.env.NEXT_PUBLIC_API_URL || getApiUrl();
        const res = await fetch(`${base}/api/public-arenas/${encodeURIComponent(arenaId)}`, {
          cache: "no-store",
        });
        const data = await res.json().catch(() => ({}));
        if (cancelled || !data.ok) return;

        const state = data.arena?.state;
        const match = (state?.matches || []).find((m: any) => m.id === matchId);
        if (match && matchName === null) {
          const teams = state?.teams || [];
          const name = (id: string) => teams.find((t: any) => t.id === id)?.name || "Team";
          setMatchName(`${name(match.team_a_id)} vs ${name(match.team_b_id)}`);
        }

        // Anything other than a running match ends the broadcast: completed,
        // removed from the schedule, or the whole tournament closed.
        const stillRunning = !!match && match.status === "LIVE" && !!state?.isStarted;
        if (!stillRunning) {
          setEndedReason(
            match && match.status !== "LIVE"
              ? "The match has ended, so this broadcast has stopped."
              : "This tournament has closed, so this broadcast has stopped."
          );
          await teardown("ended");
        }
      } catch {
        /* transient network problems should not kill an ongoing stream */
      }
    };

    check();
    const id = setInterval(check, MATCH_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [phase, arenaId, matchId, matchName, teardown]);

  // Recover from a dropped connection. Walking out of wifi range onto mobile
  // data mid-match kills ICE, and without a restart the stream just stops.
  useEffect(() => {
    const pc = pcRef.current;
    if (phase !== "live" || !pc || !feed) return;

    let disposed = false;

    const attemptRestart = async () => {
      if (disposed || pc.iceConnectionState !== "failed") return;
      setWarning("Connection dropped — reconnecting…");
      try {
        await restartIce(pc, feed.sessionId);
        if (!disposed) setWarning(null);
      } catch {
        if (!disposed) setWarning("Could not reconnect. Stop and start the broadcast again.");
      }
    };

    const onIceChange = () => {
      if (pc.iceConnectionState === "failed") void attemptRestart();
      else if (pc.iceConnectionState === "connected" && !disposed) setWarning(null);
    };

    pc.addEventListener("iceconnectionstatechange", onIceChange);
    const connection = (navigator as any).connection;
    connection?.addEventListener?.("change", attemptRestart);

    return () => {
      disposed = true;
      pc.removeEventListener("iceconnectionstatechange", onIceChange);
      connection?.removeEventListener?.("change", attemptRestart);
    };
  }, [phase, feed]);

  // Phones stop camera tracks when the tab is backgrounded or the screen
  // locks. The peer connection stays up, so viewers would see a frozen frame
  // with nothing here to explain it.
  useEffect(() => {
    if (phase !== "live") return;
    const stream = streamRef.current;
    if (!stream) return;

    const onEnded = () => {
      setWarning("The camera stopped — keep this tab open and the screen awake, then restart.");
    };
    const tracks = stream.getTracks();
    tracks.forEach((t) => t.addEventListener("ended", onEnded));
    return () => tracks.forEach((t) => t.removeEventListener("ended", onEnded));
  }, [phase, feed]);

  // Closing the tab cancels in-flight fetches, so a normal teardown would not
  // reach the server. sendBeacon survives the unload.
  useEffect(() => {
    if (phase !== "live") return;

    const onPageHide = () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      const current = feedRef.current;
      if (current && token) {
        beaconEndFeed({
          token,
          sessionId: current.sessionId,
          trackNames: current.trackNames,
          label: current.label,
          feedId: current.feedId,
        });
      }
      pcRef.current?.close();
    };

    window.addEventListener("pagehide", onPageHide);
    return () => window.removeEventListener("pagehide", onPageHide);
  }, [phase, token]);

  // Release the camera if the page goes away.
  useEffect(() => {
    return () => {
      stopStatsRef.current?.();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      pcRef.current?.close();
    };
  }, []);

  return (
    <main className="page animate-in">
      <div className="shell" style={{ maxWidth: "620px", margin: "0 auto" }}>
        <div
          className="panel page-card slide-in"
          style={{
            padding: "2rem",
            background: "rgba(9, 9, 22, 0.55)",
            borderRadius: "16px",
            border: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          <span className="section-label-v2 glow-text" style={{ letterSpacing: "2px" }}>
            📷 LIVE BROADCAST
          </span>
          <h1 className="glow-text mb-2" style={{ fontSize: "1.6rem", fontWeight: 900 }}>
            {matchName || "Match Broadcast"}
          </h1>
          <p className="muted" style={{ fontSize: "0.85rem" }}>
            Your camera is streamed straight to viewers. Nothing is recorded or stored.
          </p>

          <div
            style={{
              position: "relative",
              margin: "20px 0",
              borderRadius: "12px",
              overflow: "hidden",
              background: "#000",
              aspectRatio: "16 / 9",
            }}
          >
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
            {phase === "live" && (
              <span
                className="live-pill"
                style={{ position: "absolute", top: "12px", left: "12px", fontSize: "0.75rem" }}
              >
                <span className="live-pulse"></span> ON AIR
              </span>
            )}
          </div>

          {phase === "idle" && (
            <>
              <label className="section-label-v2">CAMERA NAME</label>
              <input
                className="premium-input-v2"
                value={label}
                maxLength={40}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. Behind the goal"
                style={{ width: "100%", marginBottom: "16px" }}
              />
              <button className="button button-gold" style={{ width: "100%" }} onClick={goLive}>
                START STREAMING
              </button>
              <p className="muted mt-4" style={{ fontSize: "0.75rem" }}>
                Viewers will see this name when choosing between angles. Keep the screen on and this
                tab in the foreground — phones stop the camera when the tab is backgrounded.
              </p>
            </>
          )}

          {phase === "starting" && <p className="muted">Requesting camera and connecting…</p>}

          {phase === "live" && (
            <>
              <p style={{ color: "#10b981", fontWeight: "bold", fontSize: "0.9rem" }}>
                You are live as “{feed?.label}”.
              </p>
              {warning && (
                <p style={{ color: "#f59e0b", fontSize: "0.8rem", marginTop: "10px" }}>
                  ⚠ {warning}
                </p>
              )}
              {usage && (
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginTop: "12px",
                    padding: "10px 14px",
                    borderRadius: "8px",
                    background: "rgba(255,255,255,0.03)",
                    fontSize: "0.78rem",
                    fontFamily: "monospace",
                  }}
                >
                  <span className="muted">↑ UPLOADED {formatBytes(usage.bytes)}</span>
                  <span style={{ color: "var(--gold)" }}>{usage.kbps} kbps</span>
                </div>
              )}
              <button
                className="button button-secondary mt-4"
                style={{ width: "100%" }}
                onClick={() => teardown("ended")}
              >
                STOP STREAMING
              </button>
            </>
          )}

          {phase === "ended" && (
            <div className="text-center" style={{ padding: "1rem 0" }}>
              <div style={{ fontSize: "2.5rem" }}>✅</div>
              <h3 className="glow-text mt-2">BROADCAST ENDED</h3>
              <p className="muted mt-2" style={{ fontSize: "0.85rem" }}>
                {endedReason || "The camera has been released and your feed is no longer listed."}
              </p>
              <p className="muted mt-4" style={{ fontSize: "0.75rem" }}>
                To film another match, ask the host for a new stream code.
              </p>
            </div>
          )}

          {phase === "error" && (
            <>
              <p style={{ color: "#ef4444", fontSize: "0.9rem", marginBottom: "16px" }}>{error}</p>
              <button className="button button-gold" style={{ width: "100%" }} onClick={goLive}>
                TRY AGAIN
              </button>
              <a
                href="/broadcast"
                className="button button-secondary mt-4"
                style={{ width: "100%", display: "block", textAlign: "center" }}
              >
                ENTER A NEW STREAM CODE
              </a>
              <button
                className="button button-secondary mt-4"
                style={{ width: "100%" }}
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(window.location.href);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  } catch {
                    setCopied(false);
                  }
                }}
              >
                {copied ? "COPIED - NOW PASTE IN CHROME" : "COPY THIS LINK"}
              </button>
              <p className="muted mt-4" style={{ fontSize: "0.75rem" }}>
                Paste it into Chrome or Safari to start the camera.
              </p>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
