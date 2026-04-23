/** Lifeline / risk-factor system for WTA tournament matches. */

export type LifelineType =
  | "double_or_nothing"
  | "steal_turn"
  | "ghost_ball"
  | "pressure_shot"
  | "rerack_gambit";

export interface LifelineEffect {
  type: LifelineType;
  success: boolean;
  description: string;
  scoreModifier: number;
  turnEffect: "skip_opponent" | "lose_turn" | null;
  visualEffect: string | null;
  durationShots: number;
}

const POOL: LifelineType[] = [
  "double_or_nothing", "steal_turn", "ghost_ball", "pressure_shot", "rerack_gambit",
];

/** Randomly assign lifelines to a player. */
export function assignLifelines(count = 2): LifelineType[] {
  const shuffled = [...POOL].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, POOL.length));
}

/** Resolve a lifeline activation — server-authoritative with risk. */
export function resolveLifeline(type: LifelineType): LifelineEffect {
  const roll = Math.random();

  switch (type) {
    case "double_or_nothing":
      return roll > 0.3
        ? { type, success: true, description: "Double or Nothing ACTIVATED! Next pot worth 2x points!", scoreModifier: 0, turnEffect: null, visualEffect: "double_points_glow", durationShots: 1 }
        : { type, success: false, description: "Double or Nothing BACKFIRED! Opponent gets a bonus turn!", scoreModifier: -5, turnEffect: "lose_turn", visualEffect: "backfire_flash", durationShots: 0 };

    case "steal_turn":
      return roll > 0.3
        ? { type, success: true, description: "Steal Turn SUCCESS! Opponent's turn is skipped!", scoreModifier: 0, turnEffect: "skip_opponent", visualEffect: "steal_animation", durationShots: 1 }
        : { type, success: false, description: "Steal Turn BACKFIRED! You lose YOUR turn instead!", scoreModifier: 0, turnEffect: "lose_turn", visualEffect: "backfire_flash", durationShots: 0 };

    case "ghost_ball":
      return { type, success: true, description: "Ghost Ball! Guide lines hidden for BOTH players for 1 shot!", scoreModifier: 0, turnEffect: null, visualEffect: "hide_guide_both", durationShots: 1 };

    case "pressure_shot":
      return { type, success: true, description: "Pressure Shot! Opponent has 10 seconds! But if they pot, 1.5x points!", scoreModifier: 0, turnEffect: null, visualEffect: "pressure_timer", durationShots: 1 };

    case "rerack_gambit":
      return roll > 0.5
        ? { type, success: true, description: "Rerack Gambit! Table reset. You maintain the advantage!", scoreModifier: 5, turnEffect: null, visualEffect: "rerack_animation", durationShots: 0 }
        : { type, success: false, description: "Rerack Gambit FAILED! Opponent gets the break AND 10 bonus points!", scoreModifier: -10, turnEffect: "lose_turn", visualEffect: "backfire_flash", durationShots: 0 };
  }
}
