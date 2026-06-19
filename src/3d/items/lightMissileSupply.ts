// ============================================================================
// Light chassis missile supply — starting pack + every-other-turn refill.
// ============================================================================

import { makeMissileLauncher } from './factory';
import type { Item } from './types';
import { addItem, allItems, hasSpaceFor, type Inventory } from './inventory';

/** Max missile pod items a light mech can hold at once (hand slots). */
export const LIGHT_MISSILE_PACK_CAP = 2;

export function countMissilePacks(inv: Inventory): number {
  return allItems(inv).filter(({ item }) => item.kind === 'missileLauncher').length;
}

export function isMissilePackFull(inv: Inventory): boolean {
  return countMissilePacks(inv) >= LIGHT_MISSILE_PACK_CAP;
}

/** Grant one missile pod if inventory has room and count is below cap. */
export function tryGrantMissilePack(inv: Inventory, damage = 2): boolean {
  if (isMissilePackFull(inv)) return false;
  const pack = makeMissileLauncher(damage);
  if (!hasSpaceFor(inv, pack)) return false;
  return addItem(inv, pack) !== null;
}

/**
 * Light mechs start with one missile pod in inventory.
 * Returns the item when granted, else null.
 */
export function grantLightStartingMissile(inv: Inventory, damage = 2): Item | null {
  if (countMissilePacks(inv) > 0) return null;
  const pack = makeMissileLauncher(damage);
  if (!hasSpaceFor(inv, pack)) return null;
  const addr = addItem(inv, pack);
  return addr ? pack : null;
}

/**
 * On red-team turns 2, 4, 6… grant a missile pod if not at cap.
 * Turn 1 starting pack is handled separately at spawn.
 */
export function tickLightMissileResupply(
  chassis: string,
  team: number,
  turnNumber: number,
  inv: Inventory,
): boolean {
  if (team !== 1 || chassis !== 'light' || turnNumber < 2 || turnNumber % 2 !== 0) {
    return false;
  }
  return tryGrantMissilePack(inv);
}
