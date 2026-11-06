"use client";

/**
 * The parts of a profile that the owner and everyone else both see: the hero
 * (avatar, name, level, coins) and the record.
 *
 * Used by app/profile (the owner's own page, with account details added) and
 * app/players/[id] (anyone's, read-only). The API's playerCard() is the single
 * source for both, so the public page cannot show something the owner's
 * doesn't.
 */

import { ShareButton } from "@/components/share-sheet";
import { playerBrag } from "@/lib/share";
import Link from "next/link";
import { useState } from "react";
import { Avatar } from "@/components/avatar";
import { CoinMark } from "@/components/coin-mark";
import { LevelBadge } from "@/components/level-badge";
import { formatCoins } from "@/lib/format";
import type { AvatarConfig } from "@/lib/avatar";
import { levelProgress, type LevelInfo } from "@/lib/progression";
import { TrophyBadge } from "@/components/trophy-badge";
import { ArtifactArt, EmoteArt, FramedAvatar } from "@/components/shop-art";
import { itemArt, RARITY_COLOUR } from "@/lib/shop";
import { arenaProgress, type TrackStanding } from "@/lib/trophies";
import "@/components/progression.css";

export interface PlayerCardData {
  id: string;
  name: string;
  memberSince?: string | null;
  /** `balance` only on the owner's own profile. */
  coins: { balance?: number; lifetime: number };
  title: string;
  level: LevelInfo;
  avatar: AvatarConfig | null;
  /** Every trophy track, Overall first. Absent against an older API. */
  trophies?: TrackStanding[];
  /** What they have on show from the shop. Absent against an older API. */
  loadout?: { borderId: string | null; showcase: string[]; emoteDeck: string[] };
  collection?: { owned: number; points: number };
  /** Offline games proven by Proof of Play. Absent against an older API. */
  proof?: { verified: number; partly: number };
  stats: {
    played: number;
    wins: number;
    winRate: number;
    nightsWon: number;
    nightsPlayed: number;
    clearances: number;
    streaks: number;
    seasonsWon: number;
    onlineWins: number;
  };
}

export function PlayerHero({ player, own }: { player: PlayerCardData; own: boolean }) {
  const { level } = player;
  const overall = player.trophies?.find((t) => t.track === "overall");
  return (
    <section className="pp-hero slide-in" aria-label={`${player.name}'s profile`}>
      <div className={`pp-avatar-wrap${player.loadout?.borderId ? " framed" : ""}`}>
        <FramedAvatar borderId={player.loadout?.borderId} size={128}>
          <Avatar avatar={player.avatar} seed={player.id} size={128} />
        </FramedAvatar>
        <span className="pp-avatar-badge">
          <LevelBadge
            level={level.level}
            bandId={level.band.id}
            bandName={level.band.name}
            pip={level.pip}
            pips={level.pips}
            size={46}
          />
        </span>
      </div>

      <div style={{ minWidth: 0 }}>
        <h1 className="pp-name">{player.name}</h1>
        <div className="pp-level-line">
          <span>Level {level.level}</span>
          <span className="pp-band">{level.band.name}</span>
        </div>
        {overall && (
          <div className="pp-trophy-line">
            <TrophyBadge trophies={overall.trophies} arenaId={overall.arena.id} size={28} />
            <strong>{overall.trophies.toLocaleString("en-IN")}</strong>
            <span className="muted">trophies · {overall.arena.name}</span>
          </div>
        )}
        {player.proof && player.proof.verified + player.proof.partly > 0 && (
          <div className="pp-proof-line" title="Offline games both players checked in to with the game code">
            <span aria-hidden>✅</span>
            <strong>{player.proof.verified.toLocaleString("en-IN")}</strong>
            <span className="muted">
              verified game{player.proof.verified === 1 ? "" : "s"}
              {player.proof.partly > 0 ? ` · ${player.proof.partly} partly` : ""}
            </span>
          </div>
        )}
        <div className="pp-xp">
          <div
            className="pp-xp-bar"
            role="progressbar"
            aria-label="Progress to the next level"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={levelProgress(level)}
          >
            <span style={{ width: `${levelProgress(level)}%` }} />
          </div>
          <div className="pp-xp-label">
            <span>
              {level.toNext.toLocaleString("en-IN")} XP to level {level.level + 1}
            </span>
            {level.nextBand && (
              <span>
                {level.nextBand.name} at {level.nextBand.level}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="pp-coins">
        <div className="pp-coin-figure">
          <CoinMark size={40} />
          <div>
            {own && typeof player.coins.balance === "number" ? (
              <>
                <strong>{formatCoins(player.coins.balance)}</strong>
                <span className="pp-label">
                  WTA Coins · {formatCoins(player.coins.lifetime)} collected all time
                </span>
              </>
            ) : (
              <>
                <strong>{formatCoins(player.coins.lifetime)}</strong>
                <span className="pp-label">WTA Coins collected</span>
              </>
            )}
          </div>
        </div>
        <div className="pp-actions">
          {own && (
            <Link href="/profile/avatar" className="button">
              Edit avatar
            </Link>
          )}
          <ShareButton
            className="button-secondary"
            heading={own ? "Share your card" : "Share this profile"}
            label={own ? "📲 Share my card" : "📲 Share profile"}
            message={() =>
              playerBrag({
                id: player.id,
                name: player.name,
                mine: own,
                title: `Level ${level.level} · ${level.band.name}`,
                trophies: overall?.trophies,
                coins: player.coins.lifetime,
              })
            }
            card={{ title: `${player.name} on Winner Takes All`, description: `Level ${level.level} · ${level.band.name}. Real tables, real rivals, real bragging rights.`, image: "/og-image.jpg" }}
          />
          
        </div>
      </div>
    </section>
  );
}

type RecordTile = { icon: string; label: string; value: string; zero: boolean; hint: string };

/**
 * The record: a win-rate ring beside six tiles, with a chip per sport they
 * have played. "All" is their frames and fights; a sport chip swaps the ring
 * and tiles for that track. Always six tiles, so the grid never leaves one
 * stranded on a row of its own, and a tile still at zero says how to earn it
 * instead of sitting there as a bare 0.
 */
export function PlayerStats({ player }: { player: PlayerCardData }) {
  const s = player.stats;
  const played = (player.trophies ?? []).filter((t) => t.track !== "overall" && t.games > 0);
  const [view, setView] = useState("all");
  const track = played.find((t) => t.track === view);

  const n = (v: number) => v.toLocaleString("en-IN");
  let wins: number, games: number, tiles: RecordTile[];
  if (track) {
    wins = track.wins;
    games = track.games;
    tiles = [
      { icon: "🏆", label: "Trophies", value: n(track.trophies), zero: false, hint: "" },
      { icon: "⭐", label: "Best ever", value: n(track.peak), zero: false, hint: "" },
      { icon: "🏟️", label: "Arena", value: track.arena.name, zero: false, hint: "" },
      { icon: "✅", label: "Won", value: n(track.wins), zero: track.wins === 0, hint: "Your first win counts" },
      { icon: "✖️", label: "Lost", value: n(track.losses), zero: false, hint: "" },
      {
        icon: "🎯",
        label: track.nextArena ? `To ${track.nextArena.name}` : "Top arena",
        value: track.nextArena ? n(Math.max(0, track.nextArena.at - track.trophies)) : "👑",
        zero: false,
        hint: "",
      },
    ];
  } else {
    // Frames at fights plus browser games. Offline tracks are left out:
    // those games are the frames already counted in s.played.
    const online = played.filter((t) => t.track.startsWith("online:"));
    wins = s.wins + online.reduce((a, t) => a + t.wins, 0);
    games = s.played + online.reduce((a, t) => a + t.games, 0);
    tiles = [
      { icon: "🏆", label: "Fights won", value: n(s.nightsWon), zero: s.nightsWon === 0, hint: "Win a whole fight" },
      { icon: "🎟️", label: "Fights played", value: n(s.nightsPlayed), zero: s.nightsPlayed === 0, hint: "Join a fight at a venue" },
      { icon: "🎱", label: "Clearances", value: n(s.clearances), zero: s.clearances === 0, hint: "All seven and the black" },
      { icon: "🌐", label: "Online wins", value: n(s.onlineWins), zero: s.onlineWins === 0, hint: "Beat the AI or a rival" },
      { icon: "🔥", label: "Streaks", value: n(s.streaks), zero: s.streaks === 0, hint: "Three fights in a row" },
      { icon: "👑", label: "Seasons won", value: n(s.seasonsWon), zero: s.seasonsWon === 0, hint: "Top a season's table" },
    ];
  }
  const losses = Math.max(0, games - wins);
  const pct = games > 0 ? Math.round((wins / games) * 100) : 0;
  const R = 52;
  const C = 2 * Math.PI * R;

  return (
    <section className="pp-card pp-record" aria-label="Record">
      <div className="pp-record-head">
        <h2 style={{ margin: 0 }}>Record</h2>
        {played.length > 0 && (
          <div className="pp-chips" role="tablist" aria-label="Show the record for">
            {[{ track: "all", label: "All" }, ...played].map((t) => (
              <button
                key={t.track}
                type="button"
                role="tab"
                aria-selected={view === t.track}
                className={`pp-chip${view === t.track ? " on" : ""}`}
                onClick={() => setView(t.track)}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="pp-record-body">
        <div className="pp-ring-wrap">
          <div className="pp-ring-box">
            <svg className="pp-ring" viewBox="0 0 120 120" role="img" aria-label={games > 0 ? `Won ${pct}% of ${games} games` : "No games yet"}>
              <circle cx="60" cy="60" r={R} className="pp-ring-track" />
              {games > 0 && (
                <circle
                  cx="60"
                  cy="60"
                  r={R}
                  className="pp-ring-fill"
                  strokeDasharray={`${(C * pct) / 100} ${C}`}
                  transform="rotate(-90 60 60)"
                />
              )}
            </svg>
            <div className="pp-ring-centre">
              <strong>{games > 0 ? `${pct}%` : "—"}</strong>
              <span>{games > 0 ? "win rate" : "no games yet"}</span>
            </div>
          </div>
          <div className="pp-wl">
            <span><b className="w">{n(wins)}</b> won</span>
            <span><b className="l">{n(losses)}</b> lost</span>
          </div>
          <span className="pp-ring-note">{track ? `${track.label} games` : "All games, at the table and online"}</span>
        </div>

        <div className="pp-tiles">
          {tiles.map((t) => (
            <div className={`pp-tile${t.zero ? " zero" : ""}`} key={t.label}>
              <span className="pp-tile-icon" aria-hidden>{t.icon}</span>
              <strong className={/\d/.test(t.value) ? undefined : "word"}>{t.value}</strong>
              <span className="pp-label">{t.label}</span>
              {t.zero && t.hint && <span className="pp-tile-hint">{t.hint}</span>}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/**
 * Trophies on every track: Overall large, then each track they have played
 * with its win/loss split. Tracks never played fold into one line of chips
 * rather than a wall of "Not played yet" rows.
 */
export function PlayerTrophies({ player }: { player: PlayerCardData }) {
  const tracks = player.trophies ?? [];
  if (tracks.length === 0) return null;
  const overall = tracks.find((t) => t.track === "overall") ?? tracks[0];
  const rest = tracks.filter((t) => t !== overall);
  const played = rest.filter((t) => t.games > 0).sort((a, b) => b.trophies - a.trophies);
  const unplayed = rest.filter((t) => t.games === 0);

  return (
    <section className="pp-card" aria-label="Trophies">
      <h2>Trophies</h2>
      <div className="pp-trophy-overall">
        <TrophyBadge trophies={overall.trophies} arenaId={overall.arena.id} size={64} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <strong>{overall.trophies.toLocaleString("en-IN")}</strong>
          <span className="pp-label">Overall · {overall.arena.name}</span>
          <ArenaBar standing={overall} />
        </div>
      </div>
      {played.length > 0 && (
        <div className="pp-rows" style={{ marginTop: "0.85rem" }}>
          {played.map((t) => {
            const winPct = t.games > 0 ? (t.wins / t.games) * 100 : 0;
            return (
              <div className="pp-row pp-track" key={t.track}>
                <span className="pp-track-main">
                  <TrophyBadge trophies={t.trophies} arenaId={t.arena.id} size={30} />
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <span className="pp-track-name">{t.label}</span>
                    <span className="pp-track-sub">
                      {t.arena.name} · {t.wins}W {t.losses}L · best {t.peak.toLocaleString("en-IN")}
                    </span>
                    <span className="pp-split" aria-hidden>
                      <span style={{ width: `${winPct}%` }} />
                    </span>
                  </span>
                </span>
                <span className="pp-track-score">{t.trophies.toLocaleString("en-IN")}</span>
              </div>
            );
          })}
        </div>
      )}
      {unplayed.length > 0 && (
        <div className="pp-unplayed">
          <span className="pp-label">{played.length > 0 ? "Not played yet" : "Play any of these to start a ladder"}</span>
          <div className="pp-chips">
            {unplayed.map((t) => (
              <span className="pp-chip ghost" key={t.track}>{t.label}</span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function ArenaBar({ standing }: { standing: TrackStanding }) {
  const pct = arenaProgress(standing);
  return (
    <div className="pp-xp" style={{ marginTop: "0.5rem" }}>
      <div className="pp-xp-bar" role="progressbar" aria-label="Progress to the next arena" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
        <span style={{ width: `${pct}%` }} />
      </div>
      <div className="pp-xp-label">
        <span>Best {standing.peak.toLocaleString("en-IN")}</span>
        {standing.nextArena ? (
          <span>
            {(standing.nextArena.at - standing.trophies).toLocaleString("en-IN")} to {standing.nextArena.name}
          </span>
        ) : (
          <span>Top arena</span>
        )}
      </div>
    </div>
  );
}

/**
 * What a player has chosen to show: up to three artifacts and their emote
 * deck. On their own profile, a way to the shop; on anyone else's, only
 * what is there.
 */
export function PlayerShowcase({ player, own }: { player: PlayerCardData; own: boolean }) {
  const showcase = player.loadout?.showcase ?? [];
  const emotes = player.loadout?.emoteDeck ?? [];
  if (!own && showcase.length === 0 && emotes.length === 0) return null;

  return (
    <section className="pp-card" aria-label="Showcase">
      <div className="h-stack between" style={{ marginBottom: "0.85rem" }}>
        <h2 style={{ margin: 0 }}>Showcase</h2>
        {own && (
          <Link href="/shop" className="muted" style={{ fontSize: "var(--text-sm)" }}>
            Shop →
          </Link>
        )}
      </div>
      {showcase.length > 0 ? (
        <div className="pp-showcase">
          {showcase.map((id) => {
            const item = itemArt(id);
            return (
              <div key={id} className="pp-showcase-item" style={{ ["--rarity" as string]: item ? RARITY_COLOUR[item.rarity] : "#8a9099" }}>
                <ArtifactArt id={id} size={56} />
                <span>{item?.name ?? id}</span>
              </div>
            );
          })}
        </div>
      ) : (
        own && (
          <>
            <div className="pp-showcase pp-slots">
              {[0, 1, 2].map((i) => (
                <Link key={i} href="/shop" className="pp-slot" aria-label="Pick an artifact in the shop">
                  <span aria-hidden>+</span>
                </Link>
              ))}
            </div>
            <p className="muted" style={{ fontSize: "var(--text-sm)", margin: "0.75rem 0 0" }}>
              Three slots for artifacts from the shop. Everyone who opens your card sees them.
            </p>
          </>
        )
      )}
      {emotes.length > 0 && (
        <>
          <h3 className="pp-label" style={{ margin: "1rem 0 0.5rem" }}>Emote deck</h3>
          <div className="pp-showcase">
            {emotes.map((id) => (
              <EmoteArt key={id} id={id} size={52} />
            ))}
          </div>
        </>
      )}
      {own && player.collection && (
        <p className="muted" style={{ fontSize: "var(--text-xs)", margin: "0.85rem 0 0" }}>
          {player.collection.owned} item{player.collection.owned === 1 ? "" : "s"} owned, worth {player.collection.points} XP
          towards your Collection Level.
        </p>
      )}
    </section>
  );
}
