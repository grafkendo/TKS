import { describe, it, expect, beforeEach } from 'vitest';
import { rollItem } from './randomItem';
import { _resetItemIdsForTest } from './factory';

beforeEach(() => {
  _resetItemIdsForTest();
});

describe('rollItem', () => {
  it('returns null when no slots are free', () => {
    expect(rollItem({ handFree: false, backpackFree: false })).toBeNull();
  });

  it('produces only hand items when only hands are free', () => {
    // 200 rolls with a stepping PRNG — every result should be slotKind=hand.
    let i = 0;
    const rand = () => (i++ * 0.0123) % 1;
    for (let n = 0; n < 200; n++) {
      const item = rollItem({ handFree: true, backpackFree: false, rand });
      expect(item).not.toBeNull();
      expect(item!.slotKind).toBe('hand');
    }
  });

  it('produces only backpack items when only the backpack is free', () => {
    let i = 0;
    const rand = () => (i++ * 0.0234) % 1;
    for (let n = 0; n < 200; n++) {
      const item = rollItem({ handFree: false, backpackFree: true, rand });
      expect(item).not.toBeNull();
      expect(item!.slotKind).toBe('backpack');
    }
  });

  it('hits both slot kinds when both are free', () => {
    const handKinds = new Set<string>();
    const backpackKinds = new Set<string>();
    let i = 0;
    const rand = () => (i++ * 0.0173) % 1;
    for (let n = 0; n < 500; n++) {
      const item = rollItem({ handFree: true, backpackFree: true, rand });
      if (!item) continue;
      if (item.slotKind === 'hand') handKinds.add(item.kind);
      else backpackKinds.add(item.kind);
    }
    expect(handKinds.has('weapon')).toBe(true);
    expect(backpackKinds.size).toBeGreaterThan(2);
  });

  it('selects the first entry when rand is 0', () => {
    const a = rollItem({ handFree: true, backpackFree: false, rand: () => 0 });
    const b = rollItem({ handFree: true, backpackFree: false, rand: () => 0 });
    expect(a?.slotKind).toBe('hand');
    expect(b?.slotKind).toBe('hand');
    // Distinct ids — factory hands out fresh ids per call.
    expect(a?.id).not.toBe(b?.id);
  });

  it('handles out-of-range randoms gracefully', () => {
    expect(rollItem({ handFree: true, backpackFree: false, rand: () => -1 })).not.toBeNull();
    expect(rollItem({ handFree: true, backpackFree: false, rand: () => 1 })).not.toBeNull();
    expect(rollItem({ handFree: true, backpackFree: false, rand: () => 999 })).not.toBeNull();
  });
});
