// ============================================================================
// HexLine — straight-line traversal between two hexes.
//
// Used for line-of-sight / cover checks: walk the hexes between a shooter
// and a target and count how many destructible buildings the line passes
// through.
//
// Algorithm: standard Red Blob Games hex-line — linearly interpolate in
// cube space and round each step back to the nearest valid hex (correcting
// for floating-point error so q + r + s stays 0).
// ============================================================================

import type { HexCoord } from './HexCoord';

/**
 * Hexes the straight line from `a` to `b` passes through. The returned
 * array starts with `a` and ends with `b`. For `a === b` it returns just
 * `[a]`.
 *
 * The line length is `hexDistance(a, b) + 1`.
 */
export function hexLine(a: HexCoord, b: HexCoord): HexCoord[] {
  const dq = b.q - a.q;
  const dr = b.r - a.r;
  const ds = -dq - dr;
  const N = Math.max(Math.abs(dq), Math.abs(dr), Math.abs(ds));

  if (N === 0) return [{ q: a.q, r: a.r }];

  const result: HexCoord[] = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    result.push(roundHex(
      a.q + (b.q - a.q) * t,
      a.r + (b.r - a.r) * t,
      -a.q - a.r + ((-b.q - b.r) - (-a.q - a.r)) * t,
    ));
  }
  return result;
}

/**
 * The hexes strictly BETWEEN `a` and `b` (excluding both endpoints).
 * Useful for "is anything in the way?" checks.
 */
export function hexLineBetween(a: HexCoord, b: HexCoord): HexCoord[] {
  const line = hexLine(a, b);
  return line.slice(1, -1);
}

function roundHex(qf: number, rf: number, sf: number): HexCoord {
  let q = Math.round(qf);
  let r = Math.round(rf);
  const s = Math.round(sf);
  const qDiff = Math.abs(q - qf);
  const rDiff = Math.abs(r - rf);
  const sDiff = Math.abs(s - sf);

  if (qDiff > rDiff && qDiff > sDiff) {
    q = -r - s;
  } else if (rDiff > sDiff) {
    r = -q - s;
  }
  return { q, r };
}
