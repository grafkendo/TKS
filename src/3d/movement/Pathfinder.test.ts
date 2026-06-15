// ============================================================================
// Pathfinder tests — hex grid (6-connected, flat-top).
// ============================================================================

import { describe, expect, it } from 'vitest';
import { Pathfinder } from './Pathfinder';
import { HexCoord, hexDistance, hexKey, hexesInRadius, isInsideHexRadius } from '../hex/HexCoord';

const makePathfinder = (
  radius: number,
  blockedTiles: HexCoord[] = [],
  costToEnter?: (h: HexCoord) => number,
) => {
  const blockedSet = new Set(blockedTiles.map(hexKey));
  return new Pathfinder({
    inBounds: (h) => isInsideHexRadius(h, radius),
    isBlocked: (h) => blockedSet.has(hexKey(h)),
    costToEnter,
  });
};

describe('reachable', () => {
  it('returns just the start tile for range 0', () => {
    const pf = makePathfinder(3);
    const r = pf.reachable({ q: 0, r: 0 }, 0);
    expect(r.size).toBe(1);
    expect(r.get('0_0')).toBe(0);
  });

  it('reaches all 6 neighbors for range 1 from the center', () => {
    const pf = makePathfinder(3);
    const r = pf.reachable({ q: 0, r: 0 }, 1);
    expect(r.size).toBe(7); // self + 6 neighbors
    // Spot-check a few neighbors
    expect(r.get('0_-1')).toBe(1); // N
    expect(r.get('1_-1')).toBe(1); // NE
    expect(r.get('1_0')).toBe(1);  // SE
  });

  it('respects board edges (hex corner has fewer neighbors)', () => {
    const pf = makePathfinder(2);
    // (2, -2) is a corner of the radius-2 board — only 3 in-bounds neighbors
    const r = pf.reachable({ q: 2, r: -2 }, 1);
    expect(r.size).toBe(4); // self + 3 in-bounds
  });

  it('treats blocked tiles as impassable AND unlandable', () => {
    const pf = makePathfinder(3, [
      { q: 0, r: -1 }, // N
      { q: 1, r: -1 }, // NE
    ]);
    const r = pf.reachable({ q: 0, r: 0 }, 1);
    expect(r.has('0_-1')).toBe(false);
    expect(r.has('1_-1')).toBe(false);
    expect(r.has('1_0')).toBe(true);
    expect(r.size).toBe(5); // self + 4 unblocked neighbors
  });

  it('range 2 from center on radius-3 board reaches 19 hexes', () => {
    // All hexes within distance 2 of the center, when the board easily
    // contains them, equals the radius-2 hex count = 1 + 3*2*3 = 19.
    const pf = makePathfinder(3);
    const r = pf.reachable({ q: 0, r: 0 }, 2);
    expect(r.size).toBe(19);
  });

  it('reachable distances match hexDistance on an empty board', () => {
    const pf = makePathfinder(3);
    const r = pf.reachable({ q: 0, r: 0 }, 3);
    for (const t of hexesInRadius(3)) {
      const d = hexDistance({ q: 0, r: 0 }, t);
      expect(r.get(hexKey(t))).toBe(d);
    }
  });
});

describe('findPath', () => {
  it('returns empty array when start equals end', () => {
    const pf = makePathfinder(3);
    expect(pf.findPath({ q: 1, r: 0 }, { q: 1, r: 0 }, 5)).toEqual([]);
  });

  it('finds an obvious straight path', () => {
    const pf = makePathfinder(3);
    const path = pf.findPath({ q: 0, r: 0 }, { q: 0, r: 2 }, 5);
    expect(path).not.toBeNull();
    expect(path).toEqual([
      { q: 0, r: 1 },
      { q: 0, r: 2 },
    ]);
  });

  it('routes around a wall', () => {
    // Block the straight-line S step; pathfinder must detour through a neighbor.
    const pf = makePathfinder(3, [{ q: 0, r: 1 }]);
    const path = pf.findPath({ q: 0, r: 0 }, { q: 0, r: 2 }, 6);
    expect(path).not.toBeNull();
    // hex distance is 2, with one wall in the way the optimal detour is 3 hops.
    expect(path!.length).toBe(3);
    expect(path![path!.length - 1]).toEqual({ q: 0, r: 2 });
    // None of the steps should land on the blocked hex
    for (const step of path!) {
      expect(hexKey(step)).not.toBe('0_1');
    }
  });

  it('returns null when target is unreachable in maxSteps', () => {
    const pf = makePathfinder(3);
    expect(pf.findPath({ q: -3, r: 0 }, { q: 3, r: 0 }, 3)).toBeNull();
  });

  it('returns null if the destination itself is blocked', () => {
    const pf = makePathfinder(3, [{ q: 1, r: 1 }]);
    expect(pf.findPath({ q: 0, r: 0 }, { q: 1, r: 1 }, 5)).toBeNull();
  });

  it('returns null if the destination is out of bounds', () => {
    const pf = makePathfinder(2);
    expect(pf.findPath({ q: 0, r: 0 }, { q: 5, r: 0 }, 10)).toBeNull();
  });
});

describe('weighted Dijkstra (costToEnter)', () => {
  it('respects per-hex costs in reachable budget', () => {
    // (1, 0) costs 2 to enter; everything else costs 1.
    const expensive = new Set([hexKey({ q: 1, r: 0 })]);
    const pf = makePathfinder(3, [], (h) =>
      expensive.has(hexKey(h)) ? 2 : 1,
    );

    const r2 = pf.reachable({ q: 0, r: 0 }, 2);
    expect(r2.get('1_0')).toBe(2);   // costs 2 to enter
    expect(r2.get('0_-1')).toBe(1);  // cheap neighbor

    // Budget 1 cannot afford the expensive hex.
    const r1 = pf.reachable({ q: 0, r: 0 }, 1);
    expect(r1.has('1_0')).toBe(false);
    // 6 neighbors total; (1,0) is the one expensive hex, so 5 are reachable.
    expect(r1.size).toBe(6); // start + 5 cheap neighbors
  });

  it('findPath routes around an expensive cluster when budget is tight', () => {
    // Make the direct route to (0, 2) expensive at (0, 1) (cost 5),
    // forcing pathfinder to take the cheap detour through neighbors.
    const expensive = new Set([hexKey({ q: 0, r: 1 })]);
    const pf = makePathfinder(3, [], (h) =>
      expensive.has(hexKey(h)) ? 5 : 1,
    );

    const path = pf.findPath({ q: 0, r: 0 }, { q: 0, r: 2 }, 4);
    expect(path).not.toBeNull();
    // The detour visits 3 hexes (the direct route would be 2 but is too pricey)
    expect(path!.length).toBe(3);
    for (const step of path!) {
      expect(hexKey(step)).not.toBe('0_1');
    }
  });

  it('pathCost sums per-hex costs along a returned path', () => {
    const expensive = new Set([hexKey({ q: 0, r: 1 })]);
    const pf = makePathfinder(3, [], (h) =>
      expensive.has(hexKey(h)) ? 3 : 1,
    );

    // Path through the expensive hex (budget allows it).
    const path = pf.findPath({ q: 0, r: 0 }, { q: 0, r: 2 }, 99);
    expect(path).not.toBeNull();
    // Expected: budget allows direct; Dijkstra picks cheapest.
    // Direct: 3 + 1 = 4. Detour: 1 + 1 + 1 = 3. So detour is cheaper.
    const cost = pf.pathCost(path!);
    expect(cost).toBe(3);
  });
});
