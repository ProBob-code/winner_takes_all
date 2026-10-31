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
  const [shared, setShared] = useState<string | null>(null);

  async function share() {
    const url = `${window.location.origin}/players/${encodeURIComponent(player.id)}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: `${player.name} on Winner Takes All`, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setShared("Link copied");
    } catch {
      // Cancelling the share sheet lands here too; that is not an error.
      setShared(null);
    }
  }

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
          <button type="button" className="button-secondary" onClick={share}>
            {shared ?? "Share profile"}
          </button>
        </div>
      </div>
    </section>
  );
}

export function PlayerStats({ player }: { player: PlayerCardData }) {
  const s = player.stats;
  const tiles: Array<[string, string]> = [
    ["Frames played", String(s.played)],
    ["Frames won", String(s.wins)],
    ["Win rate", s.played > 0 ? `${s.winRate}%` : "—"],
    ["Nights won", String(s.nightsWon)],
    ["Nights played", String(s.nightsPlayed)],
    ["Clearances", String(s.clearances)],
  ];
  if (s.seasonsWon > 0) tiles.push(["Seasons won", String(s.seasonsWon)]);
  if (s.onlineWins > 0) tiles.push(["Online wins", String(s.onlineWins)]);

  return (
    <section className="pp-stats" aria-label="Record">
      {tiles.map(([label, value]) => (
        <div className="pp-stat" key={label}>
          <strong>{value}</strong>
          <span className="pp-label">{label}</span>
        </div>
      ))}
    </section>
  );
}

/**
 * Trophies on every track: Overall large, then each sport offline and online.
 * A track never played reads as such rather than as a wall of zeroes.
 */
export function PlayerTrophies({ player }: { player: PlayerCardData }) {
  const tracks = player.trophies ?? [];
  if (tracks.length === 0) return null;
  const [overall, ...rest] = [
    ...tracks.filter((t) => t.track === "overall"),
    ...tracks.filter((t) => t.track !== "overall"),
  ];

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
      <div className="pp-rows" style={{ marginTop: "0.85rem" }}>
        {rest.map((t) => (
          <div className="pp-row" key={t.track}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: "0.55rem", minWidth: 0 }}>
              <TrophyBadge trophies={t.trophies} arenaId={t.arena.id} size={28} />
              <span>
                <span style={{ color: "var(--text-primary)", fontWeight: 700 }}>{t.label}</span>
                <span style={{ display: "block", fontSize: "var(--text-xs)" }}>
                  {t.games > 0 ? `${t.arena.name} · ${t.wins}W ${t.losses}L · best ${t.peak}` : "Not played yet"}
                </span>
              </span>
            </span>
            <span>{t.trophies.toLocaleString("en-IN")}</span>
          </div>
        ))}
      </div>
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
          <p className="muted" style={{ fontSize: "var(--text-sm)", margin: 0 }}>
            Nothing on show yet. Artifacts from the shop go here, three at a time.
          </p>
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
