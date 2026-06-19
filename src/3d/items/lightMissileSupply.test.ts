import { describe, expect, it } from 'vitest';

import { createEmptyInventory } from './inventory';
import {
  countMissilePacks,
  grantLightStartingMissile,
  isMissilePackFull,
  LIGHT_MISSILE_PACK_CAP,
  tickLightMissileResupply,
  tryGrantMissilePack,
} from './lightMissileSupply';
import { makeMissileLauncher } from './factory';

describe('lightMissileSupply', () => {
  it('grants a starting missile pod to an empty inventory', () => {
    const inv = createEmptyInventory();
    const item = grantLightStartingMissile(inv);
    expect(item).not.toBeNull();
    expect(countMissilePacks(inv)).toBe(1);
  });

  it('does not exceed pack cap', () => {
    const inv = createEmptyInventory();
    expect(tryGrantMissilePack(inv)).toBe(true);
    expect(tryGrantMissilePack(inv)).toBe(true);
    expect(isMissilePackFull(inv)).toBe(true);
    expect(tryGrantMissilePack(inv)).toBe(false);
    expect(countMissilePacks(inv)).toBe(LIGHT_MISSILE_PACK_CAP);
  });

  it('resupplies on even red turns only', () => {
    const inv = createEmptyInventory();
    expect(tickLightMissileResupply('light', 1, 1, inv)).toBe(false);
    expect(tickLightMissileResupply('medium', 1, 2, inv)).toBe(false);
    expect(tickLightMissileResupply('light', 2, 2, inv)).toBe(false);
    expect(tickLightMissileResupply('light', 1, 3, inv)).toBe(false);
    expect(tickLightMissileResupply('light', 1, 2, inv)).toBe(true);
    expect(countMissilePacks(inv)).toBe(1);
  });

  it('skips resupply when already full', () => {
    const inv = createEmptyInventory();
    inv.hands[0] = makeMissileLauncher(2);
    inv.hands[1] = makeMissileLauncher(2);
    expect(tickLightMissileResupply('light', 1, 4, inv)).toBe(false);
  });
});
