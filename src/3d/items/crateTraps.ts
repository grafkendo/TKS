// ============================================================================
// Crate traps — the bad outcomes that can replace a normal item drop.
//
// Pure rule logic + a small RNG layer for testability. Three kinds of trap:
//
//   - 'enemy'     : an enemy mech warps in adjacent to the opener
//   - 'explosion' : the opener takes mega-damage (passes armor)
//   - 'stun'      : the opener loses their next own-team turn
//
// Each call to `rollCrateTrap` returns either a trap outcome OR null
// (= "no trap, normal item drop"). The default trap chance is 25%;
// inside the trap branch each kind has equal weight.
//
// PURE — no Three.js, no DOM, no main.ts coupling.
// ============================================================================

export type CrateTrapKind = 'enemy' | 'explosion' | 'stun';

export interface CrateTrapOutcome {
  kind: CrateTrapKind;
  /** Damage dealt by 'explosion' traps; ignored otherwise. */
  damage: number;
  /** Own-team turns the opener will be stunned for; only used by 'stun'. */
  stunTurns: number;
  /** Display label (e.g. "MIMIC AMBUSH"). */
  label: string;
  /** Short description shown on the reveal card. */
  description: string;
}

export interface TrapRollOptions {
  /** Chance any open triggers a trap. Default 0.25 (one in four). */
  trapChance?: number;
  /** Inject for tests. Defaults to Math.random. */
  rand?: () => number;
}

const ENEMY_TRAP: CrateTrapOutcome = {
  kind: 'enemy',
  damage: 0,
  stunTurns: 0,
  label: 'MIMIC AMBUSH',
  description: 'The crate was bait — a hostile mech materializes next to you!',
};

const EXPLOSION_TRAP: CrateTrapOutcome = {
  kind: 'explosion',
  damage: 2,
  stunTurns: 0,
  label: 'BOOBY-TRAP',
  description: 'High-yield charge wired to the lid. Mega-damage to the opener.',
};

const STUN_TRAP: CrateTrapOutcome = {
  kind: 'stun',
  damage: 0,
  stunTurns: 1,
  label: 'EMP SURGE',
  description: "Capacitor discharge fries the opener's systems — skip your next turn.",
};

/** Internal table; equal weights. */
const TRAP_TABLE: ReadonlyArray<CrateTrapOutcome> = [
  ENEMY_TRAP,
  EXPLOSION_TRAP,
  STUN_TRAP,
];

/**
 * Roll a trap outcome. Returns null if no trap fires (the common case).
 */
export function rollCrateTrap(opts: TrapRollOptions = {}): CrateTrapOutcome | null {
  const rand = opts.rand ?? Math.random;
  const chance = opts.trapChance ?? 0.25;

  if (rand() >= chance) return null;

  const raw = rand();
  const safe = raw < 0 ? 0 : raw >= 1 ? 0.999_999 : raw;
  const idx = Math.floor(safe * TRAP_TABLE.length);
  return TRAP_TABLE[idx];
}

/** Helper: return the constant outcomes (for unit tests / devtools). */
export const TRAP_OUTCOMES: Readonly<Record<CrateTrapKind, CrateTrapOutcome>> = {
  enemy: ENEMY_TRAP,
  explosion: EXPLOSION_TRAP,
  stun: STUN_TRAP,
};
