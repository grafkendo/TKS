// ============================================================================
// Tactical nuke blast geometry — pure helpers, zero Three.js / DOM.
//
// A nuke detonation covers 3 hexes:
//   - The TARGET hex (always hit)
//   - The TWO adjacent hexes that share the longest contact with the
//     "blast cone" — i.e. the two hexes furthest from the firer. That
//     gives the blast a satisfying "lands and pushes forward" feel
//     instead of a circle.
//
// If the firer and target are the same hex (panic-detonate on top of
// yourself), the two extra hexes are deterministic neighbors so the
// damage shape stays predictable in replays.
// ============================================================================

import {
  hexDistance,
  hexEquals,
  HEX_DIRS,
  type HexCoord,
} from '../hex/HexCoord';

/**
 * Return the 3 hexes affected by a nuke detonation. `firer` is used to
 * orient the blast (the two extra hexes are the ones farthest away from
 * the firer's tile). Order is [target, side1, side2] — predictable for
 * replays / tests.
 *
 * If a `hexExists` predicate is provided, the helper only considers
 * neighbors that actually exist on the map. If fewer than 2 valid
 * neighbors are found, the missing slots silently collapse to the
 * target (callers should de-dupe before applying damage).
 */
export function nukeBlastHexes(
  firer: HexCoord,
  target: HexCoord,
  hexExists?: (h: HexCoord) => boolean,
): HexCoord[] {
  const exists = hexExists ?? (() => true);

  const neighbors = HEX_DIRS
    .map((d) => ({ q: target.q + d.q, r: target.r + d.r }))
    .filter(exists);

  // Self-detonate: deterministic pick of two opposing neighbors so the
  // damage shape doesn't depend on coordinate orientation luck.
  if (hexEquals(firer, target)) {
    return [target, neighbors[0] ?? target, neighbors[3] ?? target];
  }

  // Sort by distance from firer, FARTHEST first. Use coordinate-stable
  // tie-breaker so the result is deterministic across implementations.
  const sorted = neighbors.slice().sort((a, b) => {
    const da = hexDistance(a, firer);
    const db = hexDistance(b, firer);
    if (db !== da) return db - da;
    if (a.q !== b.q) return a.q - b.q;
    return a.r - b.r;
  });

  return [target, sorted[0] ?? target, sorted[1] ?? target];
}

/**
 * Result of resolving a nuke trajectory through the map. The nuke wants
 * to land on `target`; if `blockedBy` is non-null, an intervening
 * building absorbed the warhead and the detonation point is
 * `effectiveTarget` (the blocker's hex).
 */
export interface NukeTrajectory {
  effectiveTarget: HexCoord;
  blockedByTileKey: string | null;
}

/**
 * Walk a straight line from firer → target, hex by hex (via the line
 * function the caller passes in — we don't want to import HexLine here
 * since it's a Three-free helper). If `isBlocker(h)` returns true on a
 * hex BETWEEN firer and target, the nuke detonates there instead.
 *
 * The firer's own tile is never a blocker; the target tile, if it is
 * itself a blocker, is treated as the legitimate landing site (no
 * trajectory interruption — you can absolutely throw a nuke directly
 * at a building you want gone).
 */
export function resolveNukeTrajectory(
  firer: HexCoord,
  target: HexCoord,
  lineFn: (a: HexCoord, b: HexCoord) => HexCoord[],
  isBlocker: (h: HexCoord) => boolean,
  keyFn: (h: HexCoord) => string,
): NukeTrajectory {
  if (hexEquals(firer, target)) {
    return { effectiveTarget: target, blockedByTileKey: null };
  }
  const line = lineFn(firer, target);
  for (const h of line) {
    if (hexEquals(h, firer)) continue;
    if (hexEquals(h, target)) break;
    if (isBlocker(h)) {
      return { effectiveTarget: h, blockedByTileKey: keyFn(h) };
    }
  }
  return { effectiveTarget: target, blockedByTileKey: null };
}
