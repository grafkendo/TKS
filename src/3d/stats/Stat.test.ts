// ============================================================================
// Stat tests
// ============================================================================

import { describe, expect, it } from 'vitest';
import { Stat } from './Stat';

describe('Stat', () => {
  it('returns base when no modifiers are applied', () => {
    const s = new Stat(1);
    expect(s.base).toBe(1);
    expect(s.effective).toBe(1);
    expect(s.modifierSum).toBe(0);
  });

  it('adds positive modifiers', () => {
    const s = new Stat(1);
    s.addModifier({ source: 'chassis:light',     delta: +3 });
    s.addModifier({ source: 'item:thrusters',    delta: +1 });
    expect(s.effective).toBe(5);
    expect(s.modifierSum).toBe(4);
  });

  it('adds negative modifiers and clamps to min (default 0)', () => {
    const s = new Stat(2);
    s.addModifier({ source: 'status:slow', delta: -5 });
    expect(s.effective).toBe(0); // clamped
    expect(s.modifierSum).toBe(-5); // raw sum is uncapped
  });

  it('respects a custom min', () => {
    const s = new Stat(2, { min: 1 });
    s.addModifier({ source: 'x', delta: -10 });
    expect(s.effective).toBe(1);
  });

  it('respects a max cap', () => {
    const s = new Stat(2, { max: 5 });
    s.addModifier({ source: 'a', delta: +10 });
    expect(s.effective).toBe(5);
  });

  it('replaces a modifier with the same source rather than stacking it', () => {
    const s = new Stat(1);
    s.addModifier({ source: 'chassis:heavy', delta: +1 });
    s.addModifier({ source: 'chassis:heavy', delta: +1 });
    s.addModifier({ source: 'chassis:heavy', delta: +1 });
    expect(s.modifiers.length).toBe(1);
    expect(s.effective).toBe(2); // 1 base + 1 delta, not 1 + 3
  });

  it('removeModifier removes only the one with that source', () => {
    const s = new Stat(1);
    s.addModifier({ source: 'a', delta: +2 });
    s.addModifier({ source: 'b', delta: +1 });
    expect(s.removeModifier('a')).toBe(true);
    expect(s.removeModifier('a')).toBe(false); // already gone
    expect(s.effective).toBe(2); // 1 + 1
  });

  it('clearModifiers wipes everything', () => {
    const s = new Stat(1);
    s.addModifier({ source: 'a', delta: +2 });
    s.addModifier({ source: 'b', delta: +1 });
    s.clearModifiers();
    expect(s.effective).toBe(1);
    expect(s.modifiers.length).toBe(0);
  });

  it('hasModifier reports presence', () => {
    const s = new Stat(1);
    s.addModifier({ source: 'a', delta: +2 });
    expect(s.hasModifier('a')).toBe(true);
    expect(s.hasModifier('b')).toBe(false);
  });

  it('setBase updates the base while leaving modifiers intact', () => {
    const s = new Stat(1);
    s.addModifier({ source: 'x', delta: +2 });
    expect(s.effective).toBe(3);
    s.setBase(5);
    expect(s.effective).toBe(7);
  });
});
