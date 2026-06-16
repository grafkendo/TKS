// ============================================================================
// Urban warfare map — chunks composed into a playable city block.
//
// Demonstrates the HexMap chunk system:
//   - Atomic 1-hex chunks (street, wall, platform, building) reused at
//     many world positions.
//   - A multi-hex `cityCorner` chunk placed at multiple offsets to give
//     the map authentic city-block structure with minimal repetition.
//
// To swap in a different map: write a new `buildXxxMap()` here, pick new
// spawn coords, and import it from main.ts. Everything else stays put.
// ============================================================================

import { HexChunkTemplate, HexMap } from './HexMap';
import { HexCoord, hexesInRadius } from '../hex/HexCoord';
import type { BuildingStyle } from '../terrain/types';
import type { MapBuildResult } from './types';

// ----- Tunables -------------------------------------------------------------

export const URBAN_MAP_RADIUS = 3;
export const URBAN_PLATFORM_HEIGHT = 1.6;

// ----- Atomic chunk templates (1 hex each) ----------------------------------

const street: HexChunkTemplate = {
  name: 'street',
  hexes: [{ q: 0, r: 0 }],
};

const wallTile: HexChunkTemplate = {
  name: 'wall',
  hexes: [{ q: 0, r: 0 }],
  terrain: [{ kind: 'wall', hex: { q: 0, r: 0 }, hp: 2 }],
};

const platformTile: HexChunkTemplate = {
  name: 'platform',
  hexes: [{ q: 0, r: 0 }],
  terrain: [{
    kind: 'platform',
    hex: { q: 0, r: 0 },
    elevation: URBAN_PLATFORM_HEIGHT,
  }],
};

/** Factory for 1-hex building chunks. Caching by composite key keeps the
 *  `name` field honest if the same building configuration is reused. */
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

// ----- Multi-hex chunk (reused at multiple offsets) -------------------------

/**
 * Three hexes arranged in a "corner block":
 *   - (0, 0)  3-story concrete office
 *   - (1, -1) 4-story glass tower (the chunk's tallest landmark)
 *   - (1,  0) open street between them (so vehicles can pass through)
 */
const cityCorner: HexChunkTemplate = {
  name: 'city-corner',
  hexes: [
    { q: 0, r:  0 },
    { q: 1, r: -1 },
    { q: 1, r:  0 },
  ],
  terrain: [
    { kind: 'building', hex: { q: 0, r:  0 }, stories: 3, hp: 6, style: 'concrete' },
    { kind: 'building', hex: { q: 1, r: -1 }, stories: 4, hp: 8, style: 'glass' },
  ],
};

// ----- Map composition ------------------------------------------------------

export interface UrbanMapResult extends MapBuildResult {}

/**
 * Compose the urban map. Returns the HexMap plus spawn / item positions.
 */
export function buildUrbanMap(): MapBuildResult {
  const m = new HexMap();

  // Base layer: every hex in a radius-3 disk gets an empty street tile.
  for (const h of hexesInRadius(URBAN_MAP_RADIUS)) {
    m.placeChunk(street, h);
  }

  // Reused multi-hex chunk: NW corner and SE corner of the disk.
  m.placeChunk(cityCorner, { q: -3, r:  0 });   // occupies (-3,0), (-2,-1), (-2,0)
  m.placeChunk(cityCorner, { q:  1, r:  1 });   // occupies ( 1,1), ( 2,0), ( 2,1)

  // Standalone buildings — bookends along the N–S axis.
  m.placeChunk(building(2, 'brick'),    { q:  0, r: -2 });
  m.placeChunk(building(2, 'brick'),    { q:  0, r:  2 });
  m.placeChunk(building(3, 'glass'),    { q:  2, r: -2 });
  m.placeChunk(building(3, 'concrete'), { q: -2, r:  2 });

  // Low cover walls flanking the central platform.
  m.placeChunk(wallTile, { q: -1, r:  0 });
  m.placeChunk(wallTile, { q:  1, r:  0 });

  // Central elevated platform — the multi-level focal point.
  m.placeChunk(platformTile, { q: 0, r: 0 });

  // Spawn positions are deliberately chosen to be:
  //   - inside the playable area
  //   - free of any blocking terrain
  //   - 4+ hexes from any enemy spawn (so movement matters)
  const spawns = {
    r1: { q: -1, r:  2 },
    r2: { q:  1, r:  2 },
    b1: { q:  1, r: -2 },
    b2: { q: -1, r: -2 },
  };

  return {
    map: m,
    spawns,
    crateTiles: [
      { q: 0, r: -1 },
      { q: 0, r: 1 },
      { q: -3, r: 1 },
      { q: 3, r: -1 },
      { q: -3, r: 3 },
      { q: 3, r: -3 },
    ],
    spawnPointTiles: [
      { q: 2, r: -3 },
      { q: 3, r: -2 },
      { q: -1, r: -1 },
    ],
    objectiveTiles: [],
    cameraZoom: 8,
    displayName: 'Urban',
  };
}
