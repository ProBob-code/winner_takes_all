/**
 * Who still has to agree a finished frame.
 *
 * WHY THIS IS ITS OWN FILE
 * This rule caused the worst bug the app has had. A tournament with "both
 * players agree each frame" switched on held every finished frame off the
 * table until both sides confirmed — and a walk-in seated by name has no
 * account, so there was nobody who could tap confirm. Every frame of the night
 * sat waiting on a person who did not exist. The standings stayed on zero, no
 * coins were paid, and nothing on any screen said why.
 *
 * The fix is small and the consequence of getting it wrong is a whole evening,
 * so it lives here as a pure function with tests on it rather than inline in a
 * route handler where it cannot be exercised.
 *
 * THE RULE
 * A side that cannot be asked is confirmed on its behalf, and recorded as
 * such. What is left is the case the feature was built for: two signed-in
 * players who must both agree. One account against a walk-in needs only that
 * one tap. Two walk-ins settle at once, because there is nobody for the hold
 * to protect.
 */

export interface ConfirmableSide {
  id: string;
  user_id?: string | null;
}

export interface ConfirmationPlan {
  /**
   * Whether to hold the result off the table pending confirmation.
   *
   * False means count it now: there is nobody whose agreement the hold would
   * be collecting.
   */
  hold: boolean;
  /**
   * Sides with no account behind them, to be confirmed on their behalf so the
   * frame is not waiting on somebody who cannot tap.
   */
  autoConfirm: string[];
}

/**
 * Decide what to do with a finished frame on a tournament that asked for
 * confirmation.
 *
 * `sides` is the tournament's teams; a side missing from it is treated as
 * having no account, which is the safe reading — the alternative is holding a
 * frame for a team the engine cannot even find.
 */
export function planFrameConfirmation(
  sides: ConfirmableSide[],
  teamAId: string,
  teamBId: string
): ConfirmationPlan {
  const hasAccount = (id: string) => !!sides.find((s) => s.id === id)?.user_id;

  const unattended = [teamAId, teamBId].filter((id) => !hasAccount(id));

  // Nobody to ask at all. Holding the frame would wait forever, so it counts
  // immediately — the same outcome as a night run without confirmation on.
  if (unattended.length === 2) return { hold: false, autoConfirm: [] };

  return { hold: true, autoConfirm: unattended };
}
