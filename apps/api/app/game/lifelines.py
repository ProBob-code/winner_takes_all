"""Lifeline / risk-factor system for WTA tournament matches."""

from __future__ import annotations

import random
from dataclasses import dataclass
from enum import Enum


class LifelineType(str, Enum):
    DOUBLE_OR_NOTHING = "double_or_nothing"
    STEAL_TURN = "steal_turn"
    GHOST_BALL = "ghost_ball"
    PRESSURE_SHOT = "pressure_shot"
    RERACK_GAMBIT = "rerack_gambit"


@dataclass
class LifelineEffect:
    type: LifelineType
    success: bool
    description: str
    score_modifier: int  # Points added/subtracted
    turn_effect: str | None  # "skip_opponent", "lose_turn", None
    visual_effect: str | None  # "hide_guide", etc.
    duration_shots: int  # How many shots the effect lasts


LIFELINE_POOL = [
    LifelineType.DOUBLE_OR_NOTHING,
    LifelineType.STEAL_TURN,
    LifelineType.GHOST_BALL,
    LifelineType.PRESSURE_SHOT,
    LifelineType.RERACK_GAMBIT,
]


def assign_lifelines(count: int = 2) -> list[str]:
    """Randomly assign lifelines to a player for the match."""
    chosen = random.sample(LIFELINE_POOL, min(count, len(LIFELINE_POOL)))
    return [ll.value for ll in chosen]


def resolve_lifeline(lifeline_type: str) -> LifelineEffect:
    """Resolve a lifeline activation — determine success/failure and effects.

    Each lifeline has a risk component that can backfire.
    """
    lt = LifelineType(lifeline_type)

    if lt == LifelineType.DOUBLE_OR_NOTHING:
        # Next ball potted = 2x points. Miss = opponent gets bonus turn
        success = random.random() > 0.3  # 70% success
        if success:
            return LifelineEffect(
                type=lt,
                success=True,
                description="Double or Nothing ACTIVATED! Next pot worth 2x points!",
                score_modifier=0,  # Applied when ball is potted
                turn_effect=None,
                visual_effect="double_points_glow",
                duration_shots=1,
            )
        else:
            return LifelineEffect(
                type=lt,
                success=False,
                description="Double or Nothing BACKFIRED! Opponent gets a bonus turn!",
                score_modifier=-5,
                turn_effect="lose_turn",
                visual_effect="backfire_flash",
                duration_shots=0,
            )

    elif lt == LifelineType.STEAL_TURN:
        # Skip opponent's next turn. 30% chance it backfires
        success = random.random() > 0.3  # 70% success
        if success:
            return LifelineEffect(
                type=lt,
                success=True,
                description="Steal Turn SUCCESS! Opponent's turn is skipped!",
                score_modifier=0,
                turn_effect="skip_opponent",
                visual_effect="steal_animation",
                duration_shots=1,
            )
        else:
            return LifelineEffect(
                type=lt,
                success=False,
                description="Steal Turn BACKFIRED! You lose YOUR turn instead!",
                score_modifier=0,
                turn_effect="lose_turn",
                visual_effect="backfire_flash",
                duration_shots=0,
            )

    elif lt == LifelineType.GHOST_BALL:
        # Hide opponent's guide line for 1 shot. Your guide also hidden.
        return LifelineEffect(
            type=lt,
            success=True,
            description="Ghost Ball! Guide lines hidden for BOTH players for 1 shot!",
            score_modifier=0,
            turn_effect=None,
            visual_effect="hide_guide_both",
            duration_shots=1,
        )

    elif lt == LifelineType.PRESSURE_SHOT:
        # 10-second shot clock on opponent. If they pot, 1.5x points for them.
        return LifelineEffect(
            type=lt,
            success=True,
            description="Pressure Shot! Opponent has 10 seconds! But if they pot, 1.5x points!",
            score_modifier=0,
            turn_effect=None,
            visual_effect="pressure_timer",
            duration_shots=1,
        )

    elif lt == LifelineType.RERACK_GAMBIT:
        # Force rerack but opponent breaks. High risk.
        success = random.random() > 0.5  # 50/50
        if success:
            return LifelineEffect(
                type=lt,
                success=True,
                description="Rerack Gambit! Table reset. You maintain the advantage!",
                score_modifier=5,
                turn_effect=None,
                visual_effect="rerack_animation",
                duration_shots=0,
            )
        else:
            return LifelineEffect(
                type=lt,
                success=False,
                description="Rerack Gambit FAILED! Opponent gets the break AND 10 bonus points!",
                score_modifier=-10,
                turn_effect="lose_turn",
                visual_effect="backfire_flash",
                duration_shots=0,
            )

    raise ValueError(f"Unknown lifeline type: {lifeline_type}")


def lifeline_effect_to_dict(effect: LifelineEffect) -> dict:
    """Serialize a lifeline effect for WebSocket/API transmission."""
    return {
        "type": effect.type.value,
        "success": effect.success,
        "description": effect.description,
        "scoreModifier": effect.score_modifier,
        "turnEffect": effect.turn_effect,
        "visualEffect": effect.visual_effect,
        "durationShots": effect.duration_shots,
    }
