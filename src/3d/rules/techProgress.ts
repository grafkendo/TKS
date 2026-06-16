// ============================================================================
// Tech progress — kill-based AP unlocks for the player team.
//
// Each enemy kill awards 1 tech point. Milestones at 3 and 5 kills grant
// +1 max AP per living player mech (stacking to +2 at 5+ kills).
// ============================================================================

/** Kills required for each AP bonus tier (cumulative). */
export const TECH_KILL_MILESTONES = [3, 5] as const;

/** Max AP added at each milestone (one +1 per milestone crossed). */
export const TECH_AP_PER_MILESTONE = 1;

export const TECH_MODIFIER_SOURCE = 'tech:kills';

/** Per-unit modifier source so each mech tracks its own kill bonuses. */
export function techModifierSource(unitId: string): string {
  return `${TECH_MODIFIER_SOURCE}:${unitId}`;
}

/** Tech points earned per confirmed enemy kill. */
export const TECH_POINTS_PER_KILL = 1;

/**
 * Total bonus max-AP from kill count.
 *   0–2 kills → +0
 *   3–4 kills → +1
 *   5+ kills  → +2
 */
export function apBonusFromKills(kills: number): number {
  let bonus = 0;
  for (const m of TECH_KILL_MILESTONES) {
    if (kills >= m) bonus += TECH_AP_PER_MILESTONE;
  }
  return bonus;
}

/** Tech points mirror kills 1:1 for display. */
export function techPointsFromKills(kills: number): number {
  return kills * TECH_POINTS_PER_KILL;
}

/**
 * Next milestone kill count, or null if all milestones reached.
 * Useful for HUD "2 more kills for +1 AP" style hints.
 */
export function nextKillMilestone(kills: number): number | null {
  for (const m of TECH_KILL_MILESTONES) {
    if (kills < m) return m;
  }
  return null;
}

/** Kills still needed to reach the next milestone. */
export function killsUntilNextMilestone(kills: number): number | null {
  const next = nextKillMilestone(kills);
  if (next === null) return null;
  return next - kills;
}
