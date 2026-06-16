// ============================================================================
// Hex facing — map mech yaw (degrees) to hex directions and forward arcs.
//
// Heavy chassis fires in a forward cone:
//   range 1 → 3 hexes (one row)
//   range 2+ → 8 hexes (row of 3 + wider row of 5 with inner diagonals)
//   range 3+ → those 8 plus center-line hexes at further distances
// ============================================================================

import {
  type HexCoord,
  HEX_DIRS,
  hexAdd,
  hexEquals,
  hexFacingDegrees,
  hexNeighbor,
  hexToWorld,
} from './HexCoord';

/** Snap a mech's facing yaw to the nearest hex direction index (0–5). */
export function facingDegToDirIndex(facingDeg: number): number {
  const rad = (facingDeg * Math.PI) / 180;
  const fx = Math.cos(rad);
  const fz = Math.sin(rad);
  let best = 0;
  let bestDot = -Infinity;
  for (let i = 0; i < 6; i++) {
    const w = hexToWorld(HEX_DIRS[i], 1);
    const len = Math.hypot(w.x, w.z) || 1;
    const dot = (w.x * fx + w.z * fz) / len;
    if (dot > bestDot) {
      bestDot = dot;
      best = i;
    }
  }
  return best;
}

/** The three hex directions in the forward wedge (left flank, center, right). */
export function forwardArcDirIndices(facingDeg: number): [number, number, number] {
  const center = facingDegToDirIndex(facingDeg);
  return [((center + 5) % 6), center, ((center + 1) % 6)];
}

function stepDir(from: HexCoord, dirIdx: number, steps: number): HexCoord {
  let h = from;
  for (let i = 0; i < steps; i++) h = hexNeighbor(h, dirIdx);
  return h;
}

/**
 * Hexes in the heavy mech forward fire cone up to `range`.
 *   range 1 → 3 hexes (forward wedge row)
 *   range 2+ → 8 hexes (3 + 5 with inner diagonals on row 2)
 *   range 3+ → row 3+ along center ray only
 */
export function hexesInForwardCone(
  origin: HexCoord,
  facingDeg: number,
  range: number,
  hasTile: (h: HexCoord) => boolean,
): HexCoord[] {
  if (range < 1) return [];

  const [left, center, right] = forwardArcDirIndices(facingDeg);
  const seen = new Set<string>();
  const out: HexCoord[] = [];

  function add(h: HexCoord): void {
    if (!hasTile(h)) return;
    const k = `${h.q}_${h.r}`;
    if (seen.has(k)) return;
    seen.add(k);
    out.push({ ...h });
  }

  // Row 1 — three forward faces.
  add(stepDir(origin, left, 1));
  add(stepDir(origin, center, 1));
  add(stepDir(origin, right, 1));

  if (range < 2) return out;

  // Row 2 — five hexes: straight shots + inner diagonals bridging the wedge.
  add(stepDir(origin, left, 2));
  add(hexAdd(stepDir(origin, left, 1), HEX_DIRS[center]));
  add(stepDir(origin, center, 2));
  add(hexAdd(stepDir(origin, center, 1), HEX_DIRS[right]));
  add(stepDir(origin, right, 2));

  for (let d = 3; d <= range; d++) {
    add(stepDir(origin, center, d));
  }

  return out;
}

/** @deprecated Use hexesInForwardCone — kept as alias for imports. */
export const hexesAlongForwardArc = hexesInForwardCone;

/**
 * True when `to` lies in the shooter's forward cone at the given `range`.
 */
export function isInForwardArc(
  from: HexCoord,
  to: HexCoord,
  facingDeg: number,
  range: number,
  hasTile: (h: HexCoord) => boolean = () => true,
): boolean {
  if (hexEquals(from, to)) return false;
  return hexesInForwardCone(from, facingDeg, range, hasTile)
    .some((h) => hexEquals(h, to));
}

/** Bearing-based check (legacy) — prefer isInForwardArc with range. */
export function isInForwardArcByBearing(
  from: HexCoord,
  to: HexCoord,
  facingDeg: number,
  hexSize = 1,
): boolean {
  if (hexEquals(from, to)) return false;
  const bearing = hexFacingDegrees(from, to, hexSize);
  const targetDir = facingDegToDirIndex(bearing);
  const [left, center, right] = forwardArcDirIndices(facingDeg);
  return targetDir === left || targetDir === center || targetDir === right;
}
