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
 *
 * AND THE TAPS ALREADY IN
 * The hold has to know what has already been agreed, or it re-applies itself
 * to a frame that is finished with it. That was the other half of the same
 * bug, and the worse half: when both players did tap agree, the confirm route
 * cleared the hold and then recorded the result — and recording the result ran
 * this rule again, which put the hold straight back. Two signed-in players
 * could agree a frame all night and it would never reach the table.
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
 * frame for a team the engine cannot even find. `alreadyConfirmed` is the team
 * ids that have agreed this frame, so a settled frame is not held again.
 */
export function planFrameConfirmation(
  sides: ConfirmableSide[],
  teamAId: string,
  teamBId: string,
  alreadyConfirmed: readonly string[] = []
): ConfirmationPlan {
  const agreed = new Set(alreadyConfirmed);
  const hasAccount = (id: string) => !!sides.find((s) => s.id === id)?.user_id;

  // Both taps are in. The frame is done with the hold, and re-applying it here
  // is what stopped an agreed frame from ever counting.
  if (agreed.has(teamAId) && agreed.has(teamBId)) return { hold: false, autoConfirm: [] };

  const pending = [teamAId, teamBId].filter((id) => !agreed.has(id));

  // Nobody left who can be asked: whoever has not agreed has no account to
  // agree with. Holding the frame would wait forever, so it counts now — the
  // same outcome as a night run without confirmation switched on.
  if (pending.every((id) => !hasAccount(id))) return { hold: false, autoConfirm: [] };

  return { hold: true, autoConfirm: pending.filter((id) => !hasAccount(id)) };
}
