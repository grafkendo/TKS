// ============================================================================
// HexCoord — axial coordinates for a flat-top hex grid.
//
// Why flat-top: tactical mech games (Battletech, etc.) traditionally use
// flat-top hexes. Visually it gives N / S as direct neighbors (the flat
// edges) and NE / SE / SW / NW as the four "diagonal" neighbors.
//
// Why axial: it's just two integers (q, r) so it fits cleanly in Maps and
// keys. Internally we treat the implicit third coordinate s = -q-r as a
// derived value (only used for distance).
//
// Coordinate conventions:
//   - q increases to the east (with a slight downward bias because of the
//     flat-top skew). q is the "column-ish" axis.
//   - r increases southward.
//   - s = -q - r (always — that's what makes hex math nice).
//
// World-space (for Three.js, where +z is south and +x is east):
//   x = size * (3/2 * q)
//   z = size * sqrt(3) * (r + q/2)
//
// "size" here is the corner-to-center distance of a hex (so the hex's
// flat-to-flat height in world units is sqrt(3) * size, point-to-point
// width is 2 * size).
// ============================================================================

export interface HexCoord {
  q: number;
  r: number;
}

/**
 * Six unit-direction vectors, ordered N → NE → SE → S → SW → NW.
 *
 * That ordering means index `i` differs from index `(i+3) % 6` by exactly
 * 180° — useful when we want to compute "facing away from" a neighbor.
 */
export const HEX_DIRS: ReadonlyArray<HexCoord> = [
  { q:  0, r: -1 }, // N
  { q: +1, r: -1 }, // NE
  { q: +1, r:  0 }, // SE
  { q:  0, r: +1 }, // S
  { q: -1, r: +1 }, // SW
  { q: -1, r:  0 }, // NW
];

export const HEX_DIR_NAMES = ['N', 'NE', 'SE', 'S', 'SW', 'NW'] as const;
export type HexDirName = typeof HEX_DIR_NAMES[number];

/** Stable string key for use in Map / Set lookups. */
export function hexKey(h: HexCoord): string {
  return `${h.q}_${h.r}`;
}

export function hexFromKey(k: string): HexCoord {
  const [q, r] = k.split('_').map((n) => parseInt(n, 10));
  return { q, r };
}

export function hexEquals(a: HexCoord, b: HexCoord): boolean {
  return a.q === b.q && a.r === b.r;
}

export function hexAdd(a: HexCoord, b: HexCoord): HexCoord {
  return { q: a.q + b.q, r: a.r + b.r };
}

export function hexSubtract(a: HexCoord, b: HexCoord): HexCoord {
  return { q: a.q - b.q, r: a.r - b.r };
}

export function hexNeighbor(h: HexCoord, dirIndex: number): HexCoord {
  const d = HEX_DIRS[((dirIndex % 6) + 6) % 6];
  return { q: h.q + d.q, r: h.r + d.r };
}

export function hexNeighbors(h: HexCoord): HexCoord[] {
  return HEX_DIRS.map((d) => ({ q: h.q + d.q, r: h.r + d.r }));
}

/** Hex distance (number of steps along the grid). */
export function hexDistance(a: HexCoord, b: HexCoord): number {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  const ds = -dq - dr; // since q + r + s = 0 for both, deltas also sum to 0
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(ds)) / 2;
}

/**
 * Convert axial coords to world-space (XZ plane).
 * Flat-top layout. Returns plain numbers so this stays Three.js-free.
 */
export function hexToWorld(h: HexCoord, size: number): { x: number; z: number } {
  const x = size * 1.5 * h.q;
  const z = size * Math.sqrt(3) * (h.r + h.q / 2);
  return { x, z };
}

/**
 * Direction (in degrees, atan2-style around world Y) from hex A to a
 * neighboring hex B, with conventions matching `MechAsset.setFacing`:
 *   0°   = facing +X (east)
 *   90°  = facing +Z (south)
 *   180° = facing -X (west)
 *   270° = facing -Z (north)
 *
 * Caller is responsible for B actually being a neighbor of A; if they're
 * not adjacent the angle still points at the world-space direction.
 */
export function hexFacingDegrees(from: HexCoord, to: HexCoord, size = 1): number {
  const a = hexToWorld(from, size);
  const b = hexToWorld(to, size);
  return (Math.atan2(b.z - a.z, b.x - a.x) * 180) / Math.PI;
}

/**
 * Enumerate all hexes in a hexagonal board of the given radius, centered
 * at (0, 0). Radius 0 = 1 hex. Radius R = 1 + 3R(R+1) hexes.
 *
 *   R=1  → 7   (center + 6 ring)
 *   R=2  → 19
 *   R=3  → 37
 *   R=4  → 61
 *
 * Tiles are returned in a deterministic order (row by row, top to bottom).
 */
export function hexesInRadius(radius: number): HexCoord[] {
  const out: HexCoord[] = [];
  for (let q = -radius; q <= radius; q++) {
    const rMin = Math.max(-radius, -q - radius);
    const rMax = Math.min( radius, -q + radius);
    for (let r = rMin; r <= rMax; r++) {
      out.push({ q, r });
    }
  }
  return out;
}

/** True if `h` is inside a hexagonal board of the given radius centered on origin. */
export function isInsideHexRadius(h: HexCoord, radius: number): boolean {
  const s = -h.q - h.r;
  return (
    Math.abs(h.q) <= radius &&
    Math.abs(h.r) <= radius &&
    Math.abs(s)   <= radius
  );
}

/**
 * Enumerate every hex in an axis-aligned axial rectangle (inclusive bounds).
 * On a flat-top grid this reads as a wide rectangle on screen.
 */
export function hexesInRectangle(
  qMin: number,
  qMax: number,
  rMin: number,
  rMax: number,
): HexCoord[] {
  const out: HexCoord[] = [];
  for (let q = qMin; q <= qMax; q++) {
    for (let r = rMin; r <= rMax; r++) {
      out.push({ q, r });
    }
  }
  return out;
}

/** True if `h` lies on the outer edge of an axial rectangle. */
export function isRectPerimeter(
  h: HexCoord,
  qMin: number,
  qMax: number,
  rMin: number,
  rMax: number,
): boolean {
  return h.q === qMin || h.q === qMax || h.r === rMin || h.r === rMax;
}
