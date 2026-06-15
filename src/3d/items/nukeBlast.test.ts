// ============================================================================
// nukeBlast tests — pure geometry, deterministic.
// ============================================================================

import { describe, it, expect } from 'vitest';
import { nukeBlastHexes, resolveNukeTrajectory } from './nukeBlast';
import { hexKey, type HexCoord } from '../hex/HexCoord';

describe('nukeBlastHexes', () => {
  it('always includes the target tile as the first entry', () => {
    const firer = { q: 0, r: 0 };
    const target = { q: 3, r: -1 };
    const [first] = nukeBlastHexes(firer, target);
    expect(first).toEqual(target);
  });

  it('returns 3 entries', () => {
    const out = nukeBlastHexes({ q: 0, r: 0 }, { q: 2, r: 0 });
    expect(out).toHaveLength(3);
  });

  it('places the two extras farther from the firer than the closest neighbors', () => {
    const firer = { q: 0, r: 0 };
    const target = { q: 3, r: 0 };
    const [, a, b] = nukeBlastHexes(firer, target);
    // Distances from firer for a/b should both be >= the target's own distance.
    // (in practice we want them at LEAST as far as target — usually further.)
    const dTarget = 3;
    const dA = Math.max(Math.abs(a.q), Math.abs(a.r), Math.abs(a.q + a.r));
    const dB = Math.max(Math.abs(b.q), Math.abs(b.r), Math.abs(b.q + b.r));
    // Each "extra" must be at least as far away as the target was.
    expect(dA).toBeGreaterThanOrEqual(dTarget);
    expect(dB).toBeGreaterThanOrEqual(dTarget);
  });

  it('self-detonates predictably', () => {
    const center = { q: 0, r: 0 };
    const a = nukeBlastHexes(center, center);
    const b = nukeBlastHexes(center, center);
    expect(a).toEqual(b);
    expect(a[0]).toEqual(center);
  });

  it('respects hexExists predicate (only existing neighbors are considered)', () => {
    const firer = { q: 0, r: 0 };
    const target = { q: 1, r: 0 };
    // Pretend only the target tile exists — extras should collapse to the target.
    const result = nukeBlastHexes(firer, target, (h) => h.q === 1 && h.r === 0);
    expect(result[0]).toEqual(target);
    expect(result[1]).toEqual(target);
    expect(result[2]).toEqual(target);
  });
});

describe('resolveNukeTrajectory', () => {
  const line = (a: HexCoord, b: HexCoord): HexCoord[] => {
    // Tiny straight-line stub for tests — assumes b.q > a.q and b.r === a.r.
    const out: HexCoord[] = [];
    for (let q = a.q; q <= b.q; q++) out.push({ q, r: a.r });
    return out;
  };

  it('detonates at the target when nothing is in the way', () => {
    const out = resolveNukeTrajectory(
      { q: 0, r: 0 },
      { q: 3, r: 0 },
      line,
      () => false,
      hexKey,
    );
    expect(out.effectiveTarget).toEqual({ q: 3, r: 0 });
    expect(out.blockedByTileKey).toBeNull();
  });

  it('detonates at the first blocker between firer and target', () => {
    const out = resolveNukeTrajectory(
      { q: 0, r: 0 },
      { q: 4, r: 0 },
      line,
      (h) => h.q === 2,
      hexKey,
    );
    expect(out.effectiveTarget).toEqual({ q: 2, r: 0 });
    expect(out.blockedByTileKey).toBe(hexKey({ q: 2, r: 0 }));
  });

  it('does NOT treat the firer tile as a blocker', () => {
    const out = resolveNukeTrajectory(
      { q: 0, r: 0 },
      { q: 2, r: 0 },
      line,
      (h) => h.q === 0,
      hexKey,
    );
    expect(out.effectiveTarget).toEqual({ q: 2, r: 0 });
    expect(out.blockedByTileKey).toBeNull();
  });

  it('does NOT treat the target tile itself as an early-block; lands on it', () => {
    const out = resolveNukeTrajectory(
      { q: 0, r: 0 },
      { q: 2, r: 0 },
      line,
      (h) => h.q === 2,
      hexKey,
    );
    expect(out.effectiveTarget).toEqual({ q: 2, r: 0 });
    expect(out.blockedByTileKey).toBeNull();
  });

  it('self-detonate skips trajectory work', () => {
    const out = resolveNukeTrajectory(
      { q: 0, r: 0 },
      { q: 0, r: 0 },
      line,
      () => true,
      hexKey,
    );
    expect(out.effectiveTarget).toEqual({ q: 0, r: 0 });
    expect(out.blockedByTileKey).toBeNull();
  });
});
