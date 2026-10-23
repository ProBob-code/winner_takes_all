/**
 * How trophies look. The trophies themselves are worked out by the API
 * (apps/api/src/lib/trophies.ts); this holds the arena colours and the track
 * names the screens need. The trophies test in the API suite fails if an arena
 * or a track is added on one side only.
 */

export interface TrackStanding {
  track: string;
  label: string;
  trophies: number;
  peak: number;
  games: number;
  wins: number;
  losses: number;
  arena: { id: string; name: string; from: number };
  nextArena: { name: string; at: number } | null;
}

export const TRACKS: Array<{ id: string; label: string }> = [
  { id: "overall", label: "Overall" },
  { id: "offline:8BALL", label: "Pool" },
  { id: "offline:FOOTBALL", label: "Football" },
  { id: "online:8BALL", label: "Pool online" },
];

/** Arena id → the colours of its badge, lowest first. */
export const ARENA_STYLE: Record<string, { name: string; from: number; from_colour: string; to_colour: string }> = {
  "practice-table": { name: "Practice Table", from: 0, from_colour: "#2f7d55", to_colour: "#1a4d33" },
  "corner-pub": { name: "Corner Pub", from: 300, from_colour: "#b0763f", to_colour: "#6e4521" },
  "back-room": { name: "Back Room", from: 600, from_colour: "#7a5a9e", to_colour: "#43305e" },
  "club-house": { name: "Club House", from: 1000, from_colour: "#2f6fb5", to_colour: "#1b3f6b" },
  "felt-hall": { name: "Felt Hall", from: 1500, from_colour: "#138a8a", to_colour: "#0a4f4f" },
  "neon-lounge": { name: "Neon Lounge", from: 2000, from_colour: "#e05a8a", to_colour: "#6b3fa0" },
  "velvet-room": { name: "Velvet Room", from: 3000, from_colour: "#b0203a", to_colour: "#5c0f1e" },
  "grand-hall": { name: "Grand Hall", from: 4000, from_colour: "#c9ced6", to_colour: "#6d747e" },
  "the-crown": { name: "The Crown", from: 5000, from_colour: "#ffd700", to_colour: "#a67c00" },
};

/** The arena a trophy count sits in, for when only the number is to hand. */
export function arenaIdFor(trophies: number): string {
  let id = "practice-table";
  for (const [key, a] of Object.entries(ARENA_STYLE)) {
    if (trophies >= a.from) id = key;
  }
  return id;
}

export function arenaStyle(id: string) {
  return ARENA_STYLE[id] ?? ARENA_STYLE["practice-table"];
}

/** "+28" or "−30", with a real minus sign. */
export function signedTrophies(delta: number): string {
  if (delta > 0) return `+${delta}`;
  if (delta < 0) return `−${Math.abs(delta)}`;
  return "±0";
}

/** How far through the arena towards the next one, 0–100. */
export function arenaProgress(s: Pick<TrackStanding, "trophies" | "arena" | "nextArena">): number {
  if (!s.nextArena) return 100;
  const span = s.nextArena.at - s.arena.from;
  return Math.max(0, Math.min(100, Math.round(((s.trophies - s.arena.from) / span) * 100)));
}
