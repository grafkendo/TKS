// ============================================================================
// HexCoord tests
// ============================================================================

import { describe, expect, it } from 'vitest';
import {
  HEX_DIRS,
  hexAdd,
  hexDistance,
  hexEquals,
  hexFromKey,
  hexKey,
  hexNeighbor,
  hexNeighbors,
  hexSubtract,
  hexToWorld,
  hexesInRadius,
  isInsideHexRadius,
} from './HexCoord';

describe('HexCoord basics', () => {
  it('round-trips key <-> coord', () => {
    const h = { q: -2, r: 3 };
    expect(hexFromKey(hexKey(h))).toEqual(h);
  });

  it('hexEquals / hexAdd / hexSubtract', () => {
    expect(hexEquals({ q: 1, r: 2 }, { q: 1, r: 2 })).toBe(true);
    expect(hexEquals({ q: 1, r: 2 }, { q: 2, r: 1 })).toBe(false);
    expect(hexAdd({ q: 1, r: 2 }, { q: -1, r: 3 })).toEqual({ q: 0, r: 5 });
    expect(hexSubtract({ q: 4, r: 2 }, { q: 1, r: 3 })).toEqual({ q: 3, r: -1 });
  });
});

describe('hexNeighbors', () => {
  it('returns 6 neighbors at distance 1', () => {
    const center = { q: 0, r: 0 };
    const ns = hexNeighbors(center);
    expect(ns.length).toBe(6);
    for (const n of ns) {
      expect(hexDistance(center, n)).toBe(1);
    }
  });

  it('hexNeighbor wraps direction index modulo 6', () => {
    const center = { q: 5, r: -1 };
    expect(hexNeighbor(center, 0)).toEqual(hexNeighbor(center, 6));
    expect(hexNeighbor(center, -1)).toEqual(hexNeighbor(center, 5));
  });

  it('HEX_DIRS opposites are 3 apart', () => {
    for (let i = 0; i < 6; i++) {
      const a = HEX_DIRS[i];
      const b = HEX_DIRS[(i + 3) % 6];
      expect(a.q + b.q).toBe(0);
      expect(a.r + b.r).toBe(0);
    }
  });
});

describe('hexDistance', () => {
  it('is zero for same hex', () => {
    expect(hexDistance({ q: 2, r: -1 }, { q: 2, r: -1 })).toBe(0);
  });

  it('is one for direct neighbors', () => {
    const c = { q: 0, r: 0 };
    for (const n of hexNeighbors(c)) {
      expect(hexDistance(c, n)).toBe(1);
    }
  });

  it('matches manhattan-on-cube formula on a longer path', () => {
    // (0,0) -> N -> NE -> NE -> SE = (2, -2)
    // s coords: 0 -> +1 -> +1+0 hmm let's just trust the formula:
    // dq=2, dr=-2, ds=0  →  (2+2+0)/2 = 2
    expect(hexDistance({ q: 0, r: 0 }, { q: 2, r: -2 })).toBe(2);
  });

  it('is symmetric', () => {
    const a = { q: -3, r: 2 };
    const b = { q: 1,  r: 1 };
    expect(hexDistance(a, b)).toBe(hexDistance(b, a));
  });
});

describe('hexToWorld', () => {
  it('places origin at (0, 0)', () => {
    expect(hexToWorld({ q: 0, r: 0 }, 1)).toEqual({ x: 0, z: 0 });
  });

  it('neighbors are roughly 2*size*cos(30°) ≈ 1.732 apart in world units', () => {
    // For flat-top size=1, flat-to-flat distance = sqrt(3) ≈ 1.732.
    const a = hexToWorld({ q: 0, r: 0 }, 1);
    for (const dir of HEX_DIRS) {
      const b = hexToWorld(dir, 1);
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      expect(dist).toBeCloseTo(Math.sqrt(3), 5);
    }
  });
});

describe('hexesInRadius / isInsideHexRadius', () => {
  it('matches the closed-form count 1 + 3R(R+1)', () => {
    for (let R = 0; R <= 5; R++) {
      const tiles = hexesInRadius(R);
      expect(tiles.length).toBe(1 + 3 * R * (R + 1));
    }
  });

  it('contains exactly the hexes inside the radius', () => {
    const R = 3;
    const tiles = hexesInRadius(R);
    for (const t of tiles) expect(isInsideHexRadius(t, R)).toBe(true);
    // a hex outside
    expect(isInsideHexRadius({ q: 4, r: 0 }, R)).toBe(false);
    expect(isInsideHexRadius({ q: 0, r: 4 }, R)).toBe(false);
    expect(isInsideHexRadius({ q: 2, r: 2 }, R)).toBe(false); // s=-4
  });
});
