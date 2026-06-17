// ============================================================================
// Win condition — pure rule logic.
//
// A team is "out" when every one of its units is either destroyed OR
// immobilised. The opposing team wins. If both teams are out at the same
// time (mutual annihilation), it's a draw.
//
// Pure: no Three.js, no DOM, no global state — just a function over a
// snapshot. Lives here so it can be unit tested and later reused by the
// 2D client or a self-host server with zero changes.
// ============================================================================

export type Team = 1 | 2;

/**
 * Minimal info the rule needs about a combatant. Anything that satisfies
 * this shape — including the full `Unit` from main.ts — can be passed in.
 */
export interface CombatantSnapshot {
  team: Team;
  destroyed: boolean;
  immobilised: boolean;
}

export type GameOutcome =
  | { ended: false }
  | { ended: true; winner: Team }
  | { ended: true; winner: 'draw' };

/** Team 1 wins when they hold every capture objective. */
export function evaluateCaptureOutcome(
  totalObjectives: number,
  heldByTeam1: number,
): GameOutcome | { ended: false } {
  if (totalObjectives > 0 && heldByTeam1 >= totalObjectives) {
    return { ended: true, winner: 1 };
  }
  return { ended: false };
}

/** A combatant is "out of the fight" for win-condition purposes. */
export function isCombatantOut(u: CombatantSnapshot): boolean {
  return u.destroyed || u.immobilised;
}

/**
 * Evaluate the current outcome.
 *
 * Returns `{ ended: false }` when at least one team still has an active
 * (alive AND mobile) unit. A team is only considered "wiped" if it had
 * units to begin with — if a team has zero units in the snapshot, the
 * game is treated as not-yet-decided (e.g. during pre-spawn setup).
 */
export function evaluateOutcome(
  units: ReadonlyArray<CombatantSnapshot>,
): GameOutcome {
  const team1 = units.filter((u) => u.team === 1);
  const team2 = units.filter((u) => u.team === 2);

  const team1Out = team1.length > 0 && team1.every(isCombatantOut);
  const team2Out = team2.length > 0 && team2.every(isCombatantOut);

  if (team1Out && team2Out) return { ended: true, winner: 'draw' };
  if (team1Out) return { ended: true, winner: 2 };
  if (team2Out) return { ended: true, winner: 1 };
  return { ended: false };
}
