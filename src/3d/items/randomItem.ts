// ============================================================================
// Random item roller — produces a fresh `Item` constrained by slot space.
//
// Why constrain by space? The crate-open UX promises the player they'll
// get *something usable*. If we rolled freely and then dropped the item
// because their hands were full, the AP cost would feel unfair. So the
// roll's pool is the intersection of available slot kinds.
//
// Pure logic. Pass `rand` to make tests deterministic; defaults to
// `Math.random`. Returns null only when both slot kinds are full
// (the caller should pre-check that case to avoid wasting AP).
// ============================================================================

import type { Item } from './types';
import {
  makeWeapon,
  makeArmor,
  makeRangeModule,
  makeRepairKit,
  makeMine,
} from './factory';

export interface RollOptions {
  /** True if there's an empty hand slot. */
  handFree: boolean;
  /** True if there's an empty backpack slot. */
  backpackFree: boolean;
  /** Inject for tests. Defaults to Math.random. */
  rand?: () => number;
}

type Roller = () => Item;

/** Roll table for hand-slot items. Order is irrelevant — uniform draw. */
const HAND_ROLLERS: Roller[] = [
  () => makeWeapon(1, 'Sidearm'),
  () => makeWeapon(2, 'Plasma Cannon'),
  () => makeWeapon(2, 'Auto-Rifle'),
  () => makeWeapon(3, 'Heavy Cannon'),
];

/** Roll table for backpack items. */
const BACKPACK_ROLLERS: Roller[] = [
  () => makeArmor(1, 'Light Plating'),
  () => makeArmor(2, 'Heavy Plating'),
  () => makeRangeModule(1, 'Targeting Computer'),
  () => makeRangeModule(2, 'Sniper Scope'),
  () => makeRepairKit(2),
  () => makeRepairKit(3, 'Field Surgeon Kit'),
  () => makeMine(2),
  () => makeMine(3, 'Heavy Mine'),
];

export function rollItem(opts: RollOptions): Item | null {
  const rand = opts.rand ?? Math.random;
  const pool: Roller[] = [];
  if (opts.handFree)     pool.push(...HAND_ROLLERS);
  if (opts.backpackFree) pool.push(...BACKPACK_ROLLERS);
  if (pool.length === 0) return null;

  const raw = rand();
  const safe = raw < 0 ? 0 : raw >= 1 ? 0.999_999 : raw;
  const idx = Math.floor(safe * pool.length);
  return pool[idx]();
}
