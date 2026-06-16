// ============================================================================
// Battlefield — large rectangular map with a dense city core, open perimeter
// fields, and a mix of solid (indestructible) and destructible boundary walls.
// ============================================================================

import { HexChunkTemplate, HexMap } from './HexMap';
import {
  HexCoord,
  hexesInRectangle,
  isRectPerimeter,
} from '../hex/HexCoord';
import type { BuildingStyle } from '../terrain/types';
import type { MapBuildResult } from './types';

// ----- Bounds (axial rectangle) -------------------------------------------

export const BATTLEFIELD_Q_MIN = -10;
export const BATTLEFIELD_Q_MAX = 10;
export const BATTLEFIELD_R_MIN = -8;
export const BATTLEFIELD_R_MAX = 8;

export const BATTLEFIELD_PLATFORM_HEIGHT = 1.8;

// ----- Chunk templates ----------------------------------------------------

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

const platformTile: HexChunkTemplate = {
  name: 'platform',
  hexes: [{ q: 0, r: 0 }],
  terrain: [{
    kind: 'platform',
    hex: { q: 0, r: 0 },
    elevation: BATTLEFIELD_PLATFORM_HEIGHT,
  }],
};

const buildingCache = new Map<string, HexChunkTemplate>();
function building(
  stories: number,
  style: BuildingStyle,
  hp?: number,
): HexChunkTemplate {
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

/** 2×2 city block — four buildings around a central street gap. */
const cityBlock: HexChunkTemplate = {
  name: 'city-block-2x2',
  hexes: [
    { q: 0, r: 0 },
    { q: 1, r: -1 },
    { q: 1, r: 0 },
    { q: 0, r: -1 },
  ],
  terrain: [
    { kind: 'building', hex: { q: 0, r: 0 }, stories: 4, hp: 9, style: 'glass' },
    { kind: 'building', hex: { q: 1, r: -1 }, stories: 3, hp: 7, style: 'concrete' },
    { kind: 'building', hex: { q: 1, r: 0 }, stories: 2, hp: 5, style: 'brick' },
  ],
};

// ----- Perimeter helpers --------------------------------------------------

function isCorner(
  h: HexCoord,
  qMin: number,
  qMax: number,
  rMin: number,
  rMax: number,
): boolean {
  return (
    (h.q === qMin || h.q === qMax) &&
    (h.r === rMin || h.r === rMax)
  );
}

/** Solid segments at corners + every third edge hex; rest are sandbags. */
function perimeterIsSolid(h: HexCoord): boolean {
  if (isCorner(h, BATTLEFIELD_Q_MIN, BATTLEFIELD_Q_MAX, BATTLEFIELD_R_MIN, BATTLEFIELD_R_MAX)) {
    return true;
  }
  const edgeIndex = h.q === BATTLEFIELD_Q_MIN ? 0
    : h.q === BATTLEFIELD_Q_MAX ? 1
    : h.r === BATTLEFIELD_R_MIN ? 2
    : h.r === BATTLEFIELD_R_MAX ? 3
    : -1;
  if (edgeIndex < 0) return false;
  const along = edgeIndex <= 1 ? h.r : h.q;
  return Math.abs(along) % 3 === 0;
}

// ----- Map build ------------------------------------------------------------

export function buildBattlefieldMap(): MapBuildResult {
  const m = new HexMap();
  const {
    Q_MIN, Q_MAX, R_MIN, R_MAX,
  } = {
    Q_MIN: BATTLEFIELD_Q_MIN,
    Q_MAX: BATTLEFIELD_Q_MAX,
    R_MIN: BATTLEFIELD_R_MIN,
    R_MAX: BATTLEFIELD_R_MAX,
  };

  // Base layer: open streets inside, walls on the rectangle edge.
  for (const h of hexesInRectangle(Q_MIN, Q_MAX, R_MIN, R_MAX)) {
    if (isRectPerimeter(h, Q_MIN, Q_MAX, R_MIN, R_MAX)) {
      m.placeChunk(perimeterIsSolid(h) ? solidWallTile : wallTile(3), h);
    } else {
      m.placeChunk(street, h);
    }
  }

  // ----- Central city cluster (dense buildings + elevated plaza) ----------

  m.placeChunk(platformTile, { q: 0, r: 0 });

  // 2×2 blocks in the four quadrants around center.
  m.placeChunk(cityBlock, { q: -3, r: -1 });
  m.placeChunk(cityBlock, { q: 1, r: -1 });
  m.placeChunk(cityBlock, { q: -3, r: 2 });
  m.placeChunk(cityBlock, { q: 1, r: 2 });

  // Standalone towers along the main avenues.
  m.placeChunk(building(5, 'glass', 11), { q: 0, r: -3 });
  m.placeChunk(building(5, 'concrete', 11), { q: 0, r: 3 });
  m.placeChunk(building(4, 'brick', 9), { q: -5, r: 0 });
  m.placeChunk(building(4, 'glass', 9), { q: 5, r: 0 });

  // Inner ring cover — destructible sandbags at avenue choke points.
  for (const h of [
    { q: -2, r: 0 },
    { q: 2, r: 0 },
    { q: 0, r: -2 },
    { q: 0, r: 2 },
  ]) {
    m.placeChunk(wallTile(2), h);
  }

  // Smaller structures scattered in the mid-ring (between city and fields).
  m.placeChunk(building(2, 'brick'), { q: -7, r: 3 });
  m.placeChunk(building(2, 'concrete'), { q: 7, r: -3 });
  m.placeChunk(building(3, 'glass'), { q: -6, r: -4 });
  m.placeChunk(building(3, 'brick'), { q: 6, r: 4 });
  m.placeChunk(building(2, 'concrete'), { q: -4, r: 6 });
  m.placeChunk(building(2, 'glass'), { q: 4, r: -6 });

  // ----- Spawns (open south / north fields) --------------------------------

  const spawns = {
    r1: { q: -3, r: 6 },
    r2: { q: 3, r: 6 },
    b1: { q: 3, r: -6 },
    b2: { q: -3, r: -6 },
  };

  const crateTiles: HexCoord[] = [
    { q: -8, r: 5 },
    { q: 8, r: -5 },
    { q: -5, r: -5 },
    { q: 5, r: 5 },
    { q: 0, r: 7 },
    { q: 0, r: -7 },
  ];

  const spawnPointTiles: HexCoord[] = [
    { q: 7, r: -6 },
    { q: -7, r: -6 },
    { q: 8, r: 0 },
    { q: -8, r: 0 },
    { q: 0, r: -7 },
  ];

  // Objectives on contested avenues leading into the city core.
  const objectiveTiles: HexCoord[] = [
    { q: 0, r: -4 },
    { q: 0, r: 4 },
    { q: -4, r: 0 },
    { q: 4, r: 0 },
    { q: -2, r: -2 },
    { q: 2, r: 2 },
  ];

  return {
    map: m,
    spawns,
    crateTiles,
    spawnPointTiles,
    objectiveTiles,
    cameraZoom: 15,
    displayName: 'Battlefield',
  };
}
