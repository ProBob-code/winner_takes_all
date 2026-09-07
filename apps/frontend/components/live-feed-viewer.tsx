"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  createPeerConnection,
  subscribeToFeed,
  fetchFeeds,
  watchTransportStats,
  formatBytes,
  type StreamFeed,
  type TransportStats,
} from "@/lib/stream-client";

type Props = {
  arenaId: string;
  matchId: string;
  /** Viewing stops when the match is no longer live. */
  isLive: boolean;
};

const FEED_POLL_MS = 10_000;

/**
 * Lists every camera currently streaming this match and plays the one the
 * viewer picks. Feeds come from a TTL'd registry, so a broadcaster who walks
 * away simply drops off the list.
 */
export function LiveFeedViewer({ arenaId, matchId, isLive }: Props) {
  const [feeds, setFeeds] = useState<StreamFeed[]>([]);
  const [activeFeedId, setActiveFeedId] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usage, setUsage] = useState<TransportStats | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const stopStatsRef = useRef<(() => void) | null>(null);

  const closePeer = useCallback(() => {
    stopStatsRef.current?.();
    stopStatsRef.current = null;
    pcRef.current?.close();
    pcRef.current = null;
    setUsage(null);
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  // Poll the registry for available angles.
  useEffect(() => {
    if (!isLive) {
      setFeeds([]);
      return;
    }

    let cancelled = false;
    const load = async () => {
      const next = await fetchFeeds(arenaId, matchId);
      if (!cancelled) setFeeds(next);
    };

    load();
    const id = setInterval(load, FEED_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [arenaId, matchId, isLive]);

  // Drop the connection the moment the match stops being live.
  useEffect(() => {
    if (!isLive) {
      closePeer();
      setActiveFeedId(null);
    }
  }, [isLive, closePeer]);

  // If the feed we are watching disappears, stop rather than showing a frozen frame.
  useEffect(() => {
    if (activeFeedId && !feeds.some((f) => f.feedId === activeFeedId)) {
      closePeer();
      setActiveFeedId(null);
    }
  }, [feeds, activeFeedId, closePeer]);

  useEffect(() => closePeer, [closePeer]);

  const watch = useCallback(
    async (feed: StreamFeed) => {
      closePeer();
      setConnecting(true);
      setError(null);
      setActiveFeedId(feed.feedId);

      try {
        const pc = createPeerConnection();
        pcRef.current = pc;
        const stream = await subscribeToFeed(pc, feed);
        if (videoRef.current) videoRef.current.srcObject = stream;
        stopStatsRef.current = watchTransportStats(pc, "inbound", setUsage);
      } catch (err: any) {
        setError(err?.message || "Could not connect to this camera.");
        setActiveFeedId(null);
        closePeer();
      } finally {
        setConnecting(false);
      }
    },
    [closePeer]
  );

  if (!isLive) return null;

  if (feeds.length === 0) {
    return (
      <div
        style={{
          padding: "14px",
          borderRadius: "10px",
          background: "rgba(255,255,255,0.02)",
          border: "1px dashed rgba(255,255,255,0.08)",
          fontSize: "0.8rem",
          textAlign: "center",
        }}
        className="muted"
      >
        📷 No one is streaming this match yet.
      </div>
    );
  }

  return (
    <div className="live-feed-viewer">
      {activeFeedId && (
        <div
          style={{
            position: "relative",
            borderRadius: "12px",
            overflow: "hidden",
            background: "#000",
            aspectRatio: "16 / 9",
            marginBottom: "12px",
          }}
        >
          <video
            ref={videoRef}
            autoPlay
            playsInline
            controls
            style={{ width: "100%", height: "100%", objectFit: "contain" }}
          />
          {connecting && (
            <div
              className="muted"
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "0.85rem",
              }}
            >
              Connecting…
            </div>
          )}
        </div>
      )}

      {error && (
        <p style={{ color: "#ef4444", fontSize: "0.8rem", marginBottom: "8px" }}>{error}</p>
      )}

      {usage && (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginBottom: "12px",
            padding: "8px 12px",
            borderRadius: "8px",
            background: "rgba(255,255,255,0.03)",
            fontSize: "0.74rem",
            fontFamily: "monospace",
          }}
        >
          <span className="muted">↓ RECEIVED {formatBytes(usage.bytes)}</span>
          <span style={{ color: "var(--gold)" }}>{usage.kbps} kbps</span>
        </div>
      )}

      <div className="section-label-v2 mb-2" style={{ fontSize: "0.7rem" }}>
        CAMERA ANGLES ({feeds.length})
      </div>
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
        {feeds.map((feed) => (
          <button
            key={feed.feedId}
            className={`button button-sm ${feed.feedId === activeFeedId ? "button-gold" : "button-secondary"}`}
            style={{ padding: "6px 12px", fontSize: "0.78rem" }}
            onClick={() => watch(feed)}
          >
            {feed.feedId === activeFeedId ? "▶ " : "📷 "}
            {feed.label}
          </button>
        ))}
        {activeFeedId && (
          <button
            className="button button-secondary button-sm"
            style={{ padding: "6px 12px", fontSize: "0.78rem" }}
            onClick={() => {
              closePeer();
              setActiveFeedId(null);
            }}
          >
            ✕ STOP
          </button>
        )}
      </div>
    </div>
  );
}
