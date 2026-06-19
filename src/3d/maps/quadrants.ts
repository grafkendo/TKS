// ============================================================================
// Quadrants — wide four-zone map with a 3-hex cross road through the center.
// One capture objective per quadrant; sparse cover and destructible walls.
// ============================================================================

import { HexChunkTemplate, HexMap } from './HexMap';
import {
  HexCoord,
  hexesInRectangle,
  isRectPerimeter,
} from '../hex/HexCoord';
import type { BuildingStyle } from '../terrain/types';
import type { MapBuildResult } from './types';

export const QUADRANTS_Q_MIN = -16;
export const QUADRANTS_Q_MAX = 16;
export const QUADRANTS_R_MIN = -7;
export const QUADRANTS_R_MAX = 7;

const street: HexChunkTemplate = {
  name: 'street',
  hexes: [{ q: 0, r: 0 }],
};

const wallTile = (hp = 3): HexChunkTemplate => ({
  name: `wall-${hp}`,
  hexes: [{ q: 0, r: 0 }],
  terrain: [{ kind: 'wall', hex: { q: 0, r: 0 }, hp }],
});

const solidWallTile: HexChunkTemplate = {
  name: 'solid-wall',
  hexes: [{ q: 0, r: 0 }],
  terrain: [{ kind: 'solidWall', hex: { q: 0, r: 0 } }],
};

const roughTerrainTile = (hp = 2): HexChunkTemplate => ({
  name: `rough-${hp}`,
  hexes: [{ q: 0, r: 0 }],
  terrain: [{ kind: 'rubble', hex: { q: 0, r: 0 }, hp }],
});

const buildingCache = new Map<string, HexChunkTemplate>();
function building(stories: number, style: BuildingStyle, hp?: number): HexChunkTemplate {
  const key = `b-${stories}-${style}`;
  const cached = buildingCache.get(key);
  if (cached) return cached;
  const tmpl: HexChunkTemplate = {
    name: key,
    hexes: [{ q: 0, r: 0 }],
    terrain: [{
      kind: 'building',
      hex: { q: 0, r: 0 },
      stories,
      hp: hp ?? 2 + stories * 2,
      style,
    }],
  };
  buildingCache.set(key, tmpl);
  return tmpl;
}

/** 3-hex-wide cross through map center (horizontal + vertical arms). */
export function isCrossRoad(h: HexCoord): boolean {
  return Math.abs(h.q) <= 1 || Math.abs(h.r) <= 1;
}

function isCorner(h: HexCoord, qMin: number, qMax: number, rMin: number, rMax: number): boolean {
  return (h.q === qMin || h.q === qMax) && (h.r === rMin || h.r === rMax);
}

function perimeterIsSolid(h: HexCoord): boolean {
  if (isCorner(h, QUADRANTS_Q_MIN, QUADRANTS_Q_MAX, QUADRANTS_R_MIN, QUADRANTS_R_MAX)) {
    return true;
  }
  const edgeIndex = h.q === QUADRANTS_Q_MIN ? 0
    : h.q === QUADRANTS_Q_MAX ? 1
    : h.r === QUADRANTS_R_MIN ? 2
    : h.r === QUADRANTS_R_MAX ? 3
    : -1;
  if (edgeIndex < 0) return false;
  const along = edgeIndex <= 1 ? h.r : h.q;
  return Math.abs(along) % 3 === 0;
}

/** Destructible choke walls at quadrant / road boundaries. */
const QUADRANT_WALLS: HexCoord[] = [
  { q: -2, r: 3 }, { q: -2, r: 4 }, { q: -3, r: 3 },
  { q: 2, r: 3 }, { q: 2, r: 4 }, { q: 3, r: 3 },
  { q: -2, r: -3 }, { q: -2, r: -4 }, { q: -3, r: -3 },
  { q: 2, r: -3 }, { q: 2, r: -4 }, { q: 3, r: -3 },
  { q: -3, r: 2 }, { q: -4, r: 2 }, { q: -3, r: -2 }, { q: -4, r: -2 },
  { q: 3, r: 2 }, { q: 4, r: 2 }, { q: 3, r: -2 }, { q: 4, r: -2 },
];

export function buildQuadrantsMap(): MapBuildResult {
  const m = new HexMap();
  const { Q_MIN, Q_MAX, R_MIN, R_MAX } = {
    Q_MIN: QUADRANTS_Q_MIN,
    Q_MAX: QUADRANTS_Q_MAX,
    R_MIN: QUADRANTS_R_MIN,
    R_MAX: QUADRANTS_R_MAX,
  };

  for (const h of hexesInRectangle(Q_MIN, Q_MAX, R_MIN, R_MAX)) {
    if (isRectPerimeter(h, Q_MIN, Q_MAX, R_MIN, R_MAX)) {
      m.placeChunk(perimeterIsSolid(h) ? solidWallTile : wallTile(3), h);
    } else {
      m.placeChunk(street, h);
    }
  }

  // One low building per quadrant (sparse cover).
  m.placeChunk(building(2, 'brick', 5), { q: -11, r: 5 });
  m.placeChunk(building(2, 'concrete', 5), { q: 11, r: 5 });
  m.placeChunk(building(2, 'glass', 5), { q: -11, r: -5 });
  m.placeChunk(building(2, 'brick', 5), { q: 11, r: -5 });

  for (const h of QUADRANT_WALLS) {
    if (!isCrossRoad(h)) m.placeChunk(wallTile(2), h);
  }

  const roughPatches: HexCoord[] = [
    { q: -8, r: 3 }, { q: -10, r: 2 }, { q: -7, r: 4 },
    { q: 8, r: 3 }, { q: 10, r: 2 }, { q: 7, r: 4 },
    { q: -8, r: -3 }, { q: -10, r: -2 }, { q: -7, r: -4 },
    { q: 8, r: -3 }, { q: 10, r: -2 }, { q: 7, r: -4 },
    { q: -5, r: 6 }, { q: 5, r: -6 }, { q: -6, r: -5 }, { q: 6, r: 5 },
  ];
  for (const h of roughPatches) {
    if (!isCrossRoad(h) && !isRectPerimeter(h, Q_MIN, Q_MAX, R_MIN, R_MAX)) {
      m.placeChunk(roughTerrainTile(), h);
    }
  }

  const spawns = {
    r1: { q: -3, r: 6 },
    r2: { q: 3, r: 6 },
    b1: { q: 3, r: -6 },
    b2: { q: -3, r: -6 },
  };

  const objectiveTiles: HexCoord[] = [
    { q: -9, r: 5 },
    { q: 9, r: 5 },
    { q: -9, r: -5 },
    { q: 9, r: -5 },
  ];

  const crateTiles: HexCoord[] = [
    { q: -6, r: 4 }, { q: -12, r: 3 }, { q: -8, r: 6 },
    { q: 6, r: 4 }, { q: 12, r: 3 }, { q: 8, r: 6 },
    { q: -6, r: -4 }, { q: -12, r: -3 }, { q: -8, r: -6 },
    { q: 6, r: -4 }, { q: 12, r: -3 }, { q: 8, r: -6 },
    { q: 0, r: 5 }, { q: 0, r: -5 }, { q: -5, r: 0 }, { q: 5, r: 0 },
  ];

  const spawnPointTiles: HexCoord[] = [
    { q: 13, r: -5 },
    { q: -13, r: -5 },
    { q: 13, r: 5 },
    { q: -13, r: 5 },
    { q: 0, r: -6 },
  ];

  return {
    mapId: 'quadrants',
    map: m,
    spawns,
    crateTiles,
    spawnPointTiles,
    objectiveTiles,
    cameraZoom: 19,
    cameraYawDeg: 0,
    displayName: 'Four Quadrants',
  };
}
