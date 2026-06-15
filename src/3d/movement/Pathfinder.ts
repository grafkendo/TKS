// ============================================================================
// Pathfinder — Dijkstra over a hex grid (6-connected, flat-top).
//
// Each hex can have a different *enter cost* (e.g. 1 AP for clear ground,
// 2 AP for rubble). When all costs are 1 this degenerates to BFS.
//
// API:
//   reachable(start, budget) → Map<"q_r", cumulativeCost>
//   findPath(start, end, budget) → HexCoord[] | null
//
// Conventions:
//   - The start hex is always in the reachable map at cost 0 (even if
//     `isBlocked(start)` would otherwise reject it).
//   - "budget" is the maximum cumulative enter-cost a path may have.
//   - `costToEnter` is called on every destination hex; the start hex is
//     never asked because nothing costs to "enter" where you already are.
//   - `isBlocked` is a HARD block — the hex can't be passed through or
//     landed on (walls, buildings, hostile units).
//   - `canStop` (optional, default = always true) is a SOFT block — the
//     hex can be traversed but the unit can't end its move there. Used
//     for allies the unit can squeeze past but can't share a hex with.
//
// Pure logic — no Three.js, no DOM.
// ============================================================================

import { HexCoord, HEX_DIRS, hexKey } from '../hex/HexCoord';

export interface PathfinderOptions {
  /** True if `h` is OUTSIDE the playable board. */
  inBounds: (h: HexCoord) => boolean;
  /**
   * True if the hex cannot be passed through OR landed on.
   * The start hex is never asked.
   */
  isBlocked: (h: HexCoord) => boolean;
  /**
   * Optional landing-only check. Default: every passable hex is also
   * stoppable. When this returns false the hex can still be traversed
   * but won't appear in `reachable()` output and isn't a valid
   * `findPath()` target.
   */
  canStop?: (h: HexCoord) => boolean;
  /**
   * Optional per-hex enter cost. Default: every hex costs 1.
   * Must always be > 0 (else Dijkstra's invariants break).
   */
  costToEnter?: (h: HexCoord) => number;
}

const ONE = () => 1;
const TRUE = () => true;

export class Pathfinder {
  private cost: (h: HexCoord) => number;
  private canStop: (h: HexCoord) => boolean;

  constructor(private opts: PathfinderOptions) {
    this.cost = opts.costToEnter ?? ONE;
    this.canStop = opts.canStop ?? TRUE;
  }

  /**
   * All hexes reachable from `start` for a total cumulative cost ≤ `budget`
   * and where the unit can actually stop. The map values are
   * cost-to-reach (0 for start).
   *
   * The internal traversal still goes through `canStop`-false hexes so
   * we can route around an ally and land on the far side.
   */
  reachable(start: HexCoord, budget: number): Map<string, number> {
    const out = new Map<string, number>();
    // Internal "best cost to step ONTO this hex" — includes pass-through
    // hexes so we can keep walking past them.
    const seen = new Map<string, number>();

    out.set(hexKey(start), 0);
    seen.set(hexKey(start), 0);
    if (budget <= 0) return out;

    const pq: Array<{ h: HexCoord; c: number }> = [{ h: start, c: 0 }];

    while (pq.length > 0) {
      const cur = popMin(pq);
      const curKey = hexKey(cur.h);
      if (cur.c > (seen.get(curKey) ?? Infinity)) continue; // stale

      for (const dir of HEX_DIRS) {
        const n: HexCoord = { q: cur.h.q + dir.q, r: cur.h.r + dir.r };
        if (!this.opts.inBounds(n)) continue;
        if (this.opts.isBlocked(n)) continue;
        const step = this.cost(n);
        const newCost = cur.c + step;
        if (newCost > budget) continue;
        const nKey = hexKey(n);
        const prev = seen.get(nKey);
        if (prev === undefined || newCost < prev) {
          seen.set(nKey, newCost);
          if (this.canStop(n)) out.set(nKey, newCost);
          pq.push({ h: n, c: newCost });
        }
      }
    }
    return out;
  }

  /**
   * Shortest-cost path from `start` to `end`, EXCLUDING start and
   * INCLUDING end. Returns null if no path within `budget`.
   */
  findPath(start: HexCoord, end: HexCoord, budget: number): HexCoord[] | null {
    if (start.q === end.q && start.r === end.r) return [];
    if (!this.opts.inBounds(end)) return null;
    if (this.opts.isBlocked(end)) return null;
    if (!this.canStop(end)) return null;

    const dist = new Map<string, number>();
    const parents = new Map<string, string>();
    const startKey = hexKey(start);
    dist.set(startKey, 0);

    const pq: Array<{ h: HexCoord; c: number }> = [{ h: start, c: 0 }];

    while (pq.length > 0) {
      const cur = popMin(pq);
      const curKey = hexKey(cur.h);
      if (cur.c > (dist.get(curKey) ?? Infinity)) continue;
      if (curKey === hexKey(end)) break; // found shortest

      for (const dir of HEX_DIRS) {
        const n: HexCoord = { q: cur.h.q + dir.q, r: cur.h.r + dir.r };
        if (!this.opts.inBounds(n)) continue;
        if (this.opts.isBlocked(n)) continue;
        const step = this.cost(n);
        const newCost = cur.c + step;
        if (newCost > budget) continue;
        const nKey = hexKey(n);
        const prev = dist.get(nKey);
        if (prev === undefined || newCost < prev) {
          dist.set(nKey, newCost);
          parents.set(nKey, curKey);
          pq.push({ h: n, c: newCost });
        }
      }
    }

    const endKey = hexKey(end);
    if (!dist.has(endKey)) return null;

    const path: HexCoord[] = [];
    let curKey = endKey;
    while (curKey !== startKey) {
      const [qs, rs] = curKey.split('_');
      path.push({ q: parseInt(qs, 10), r: parseInt(rs, 10) });
      const p = parents.get(curKey);
      if (!p) return null;
      curKey = p;
    }
    return path.reverse();
  }

  /**
   * Sum of `costToEnter` along a path (start excluded, end included —
   * matches what `findPath` returns). Useful for "can this unit afford
   * this move?" checks BEFORE executing the move.
   */
  pathCost(path: HexCoord[]): number {
    let total = 0;
    for (const h of path) total += this.cost(h);
    return total;
  }
}

/** Linear-scan extract-min — fine while the open set stays small (~tens of hexes). */
function popMin<T extends { c: number }>(arr: T[]): T {
  let minIdx = 0;
  for (let i = 1; i < arr.length; i++) {
    if (arr[i].c < arr[minIdx].c) minIdx = i;
  }
  // splice is O(n) too, but n is small. Swap-with-last is slightly faster.
  const last = arr.length - 1;
  const item = arr[minIdx];
  arr[minIdx] = arr[last];
  arr.length = last;
  return item;
}
