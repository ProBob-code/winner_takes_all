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

type Connection = {
  pc: RTCPeerConnection;
  stream: MediaStream | null;
  error: string | null;
  stopStats?: () => void;
};

/**
 * Plays every camera on this match at once, so a viewer can see all angles
 * without switching. Selecting one promotes it to the main player and the rest
 * continue alongside it.
 *
 * Each angle is a separate subscription, so watching four cameras pulls four
 * streams. That is the cost of a multiplex view and is why the thumbnails stay
 * muted and small until promoted.
 */
export function LiveFeedViewer({ arenaId, matchId, isLive }: Props) {
  const [feeds, setFeeds] = useState<StreamFeed[]>([]);
  const [primaryFeedId, setPrimaryFeedId] = useState<string | null>(null);
  const [connections, setConnections] = useState<Record<string, Connection>>({});
  const [usage, setUsage] = useState<TransportStats | null>(null);

  const connectionsRef = useRef<Record<string, Connection>>({});
  const primaryVideoRef = useRef<HTMLVideoElement | null>(null);
  const thumbRefs = useRef<Record<string, HTMLVideoElement | null>>({});

  connectionsRef.current = connections;

  const dropConnection = useCallback((feedId: string) => {
    const existing = connectionsRef.current[feedId];
    if (!existing) return;
    existing.stopStats?.();
    existing.pc.close();
    setConnections((prev) => {
      const next = { ...prev };
      delete next[feedId];
      return next;
    });
  }, []);

  const dropAll = useCallback(() => {
    for (const conn of Object.values(connectionsRef.current)) {
      conn.stopStats?.();
      conn.pc.close();
    }
    connectionsRef.current = {};
    setConnections({});
    setPrimaryFeedId(null);
    setUsage(null);
  }, []);

  // Keep the list of available angles current.
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

  useEffect(() => {
    if (!isLive) dropAll();
  }, [isLive, dropAll]);

  useEffect(() => dropAll, [dropAll]);

  // Subscribe to any new angle, and release any that has gone away.
  useEffect(() => {
    if (!isLive) return;

    const liveIds = new Set(feeds.map((f) => f.feedId));
    for (const id of Object.keys(connectionsRef.current)) {
      if (!liveIds.has(id)) dropConnection(id);
    }

    for (const feed of feeds) {
      if (connectionsRef.current[feed.feedId]) continue;

      const pc = createPeerConnection();
      const entry: Connection = { pc, stream: null, error: null };
      connectionsRef.current = { ...connectionsRef.current, [feed.feedId]: entry };
      setConnections((prev) => ({ ...prev, [feed.feedId]: entry }));

      subscribeToFeed(pc, feed)
        .then((stream) => {
          // The feed may have ended while this was negotiating.
          if (!connectionsRef.current[feed.feedId]) {
            pc.close();
            return;
          }
          setConnections((prev) =>
            prev[feed.feedId] ? { ...prev, [feed.feedId]: { ...prev[feed.feedId], stream } } : prev
          );
          setPrimaryFeedId((current) => current ?? feed.feedId);
        })
        .catch((err: any) => {
          if (!connectionsRef.current[feed.feedId]) return;
          setConnections((prev) =>
            prev[feed.feedId]
              ? {
                  ...prev,
                  [feed.feedId]: {
                    ...prev[feed.feedId],
                    error: err?.message || "Could not connect to this camera.",
                  },
                }
              : prev
          );
        });
    }
  }, [feeds, isLive, dropConnection]);

  // Attach media to whichever element is currently showing each angle.
  useEffect(() => {
    for (const [feedId, conn] of Object.entries(connections)) {
      if (!conn.stream) continue;
      const target =
        feedId === primaryFeedId ? primaryVideoRef.current : thumbRefs.current[feedId];
      if (target && target.srcObject !== conn.stream) target.srcObject = conn.stream;
    }
  }, [connections, primaryFeedId, feeds]);

  // Report bandwidth for the angle being watched full size.
  useEffect(() => {
    if (!primaryFeedId) return;
    const conn = connections[primaryFeedId];
    if (!conn?.stream) return;

    const stop = watchTransportStats(conn.pc, "inbound", setUsage);
    return () => {
      stop();
      setUsage(null);
    };
  }, [primaryFeedId, connections]);

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

  const primary = feeds.find((f) => f.feedId === primaryFeedId) || null;
  const others = feeds.filter((f) => f.feedId !== primaryFeedId);
  const primaryConn = primaryFeedId ? connections[primaryFeedId] : null;

  const caption = (feed: StreamFeed) =>
    feed.broadcasterName ? `${feed.label} · ${feed.broadcasterName}` : feed.label;

  return (
    <div className="live-feed-viewer">
      <div
        style={{
          display: "grid",
          // Side rail only exists once there is more than one angle.
          gridTemplateColumns: others.length ? "minmax(0, 3fr) minmax(160px, 1fr)" : "1fr",
          gap: "12px",
          alignItems: "start",
        }}
      >
        <div>
          <div
            style={{
              position: "relative",
              borderRadius: "12px",
              overflow: "hidden",
              background: "#000",
              aspectRatio: "16 / 9",
            }}
          >
            <video
              ref={primaryVideoRef}
              autoPlay
              playsInline
              controls
              style={{ width: "100%", height: "100%", objectFit: "contain" }}
            />
            {primary && !primaryConn?.stream && !primaryConn?.error && (
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
            {primaryConn?.error && (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "20px",
                  textAlign: "center",
                  color: "#ef4444",
                  fontSize: "0.8rem",
                }}
              >
                {primaryConn.error}
              </div>
            )}
            {primary && (
              <span
                style={{
                  position: "absolute",
                  bottom: "10px",
                  left: "10px",
                  padding: "4px 10px",
                  borderRadius: "6px",
                  background: "rgba(0,0,0,0.6)",
                  fontSize: "0.75rem",
                  fontWeight: 700,
                }}
              >
                {caption(primary)}
              </span>
            )}
          </div>

          {usage && (
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginTop: "8px",
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
        </div>

        {others.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <div className="section-label-v2" style={{ fontSize: "0.65rem" }}>
              OTHER ANGLES ({others.length})
            </div>
            {others.map((feed) => {
              const conn = connections[feed.feedId];
              return (
                <button
                  key={feed.feedId}
                  onClick={() => setPrimaryFeedId(feed.feedId)}
                  title={`Switch to ${caption(feed)}`}
                  style={{
                    padding: 0,
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: "8px",
                    overflow: "hidden",
                    background: "#000",
                    cursor: "pointer",
                    position: "relative",
                  }}
                >
                  <video
                    ref={(el) => {
                      thumbRefs.current[feed.feedId] = el;
                    }}
                    autoPlay
                    playsInline
                    muted
                    style={{ width: "100%", aspectRatio: "16 / 9", objectFit: "cover", display: "block" }}
                  />
                  {!conn?.stream && (
                    <span
                      className="muted"
                      style={{
                        position: "absolute",
                        inset: 0,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "0.7rem",
                      }}
                    >
                      {conn?.error ? "unavailable" : "connecting…"}
                    </span>
                  )}
                  <span
                    style={{
                      position: "absolute",
                      bottom: 0,
                      left: 0,
                      right: 0,
                      padding: "4px 6px",
                      background: "rgba(0,0,0,0.65)",
                      fontSize: "0.65rem",
                      fontWeight: 700,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      textAlign: "left",
                    }}
                  >
                    {caption(feed)}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
