import { describe, it, expect } from 'vitest';
import { rollCrateTrap, TRAP_OUTCOMES, type CrateTrapKind } from './crateTraps';

describe('rollCrateTrap', () => {
  it('returns null when the first roll lands outside the trap chance', () => {
    // First call drives trap-vs-not. Anything >= chance → null.
    const rand = () => 0.99;
    expect(rollCrateTrap({ trapChance: 0.25, rand })).toBeNull();
  });

  it('returns a trap when the first roll lands inside the trap chance', () => {
    // Two rolls per call: first decides trap-vs-not, second picks the kind.
    const values = [0.0, 0.5];
    const rand = () => values.shift() ?? 0;
    const out = rollCrateTrap({ trapChance: 0.25, rand });
    expect(out).not.toBeNull();
  });

  it('rand=0,0 picks the first trap kind', () => {
    const values = [0.0, 0.0];
    const rand = () => values.shift() ?? 0;
    const out = rollCrateTrap({ trapChance: 1, rand });
    expect(out?.kind).toBe('enemy');
  });

  it('rand=0,0.999 picks the last trap kind', () => {
    const values = [0.0, 0.999];
    const rand = () => values.shift() ?? 0;
    const out = rollCrateTrap({ trapChance: 1, rand });
    expect(out?.kind).toBe('stun');
  });

  it('always-trap with stepping rand covers every kind', () => {
    const seen = new Set<CrateTrapKind>();
    let i = 0;
    // Alternate: first roll always 0 (trap fires), second steps through the
    // bucket range so we touch each table entry.
    const rand = () => {
      const v = i % 2 === 0 ? 0 : (Math.floor(i / 2) / 6) % 1;
      i++;
      return v;
    };
    for (let n = 0; n < 30; n++) {
      const o = rollCrateTrap({ trapChance: 1, rand });
      if (o) seen.add(o.kind);
    }
    expect(seen.size).toBe(3);
    expect(seen.has('enemy')).toBe(true);
    expect(seen.has('explosion')).toBe(true);
    expect(seen.has('stun')).toBe(true);
  });

  it('respects custom trapChance — chance=0 means no traps ever', () => {
    const rand = () => 0; // would normally land at 0% chance boundary
    for (let n = 0; n < 50; n++) {
      expect(rollCrateTrap({ trapChance: 0, rand })).toBeNull();
    }
  });

  it('outcome catalog has expected damage / stun values', () => {
    expect(TRAP_OUTCOMES.enemy.damage).toBe(0);
    expect(TRAP_OUTCOMES.explosion.damage).toBeGreaterThanOrEqual(2);
    expect(TRAP_OUTCOMES.stun.stunTurns).toBe(1);
  });
});
