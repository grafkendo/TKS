// ============================================================================
// Co-op map bootstrap — playable tiles + blockers from map builders.
// ============================================================================

import { buildMapById } from '../maps';
import { hexKey, type HexCoord } from '../hex/HexCoord';
import type { ChunkTerrainSpec } from '../terrain/types';
import type { MapSpawns } from '../maps/types';

export interface CoopMapData {
  mapId: string;
  tiles: string[];
  blockedTiles: string[];
  spawns: MapSpawns;
  spawnPointTiles: string[];
  playerSpawnTiles: string[];
  objectiveTiles: string[];
}

function terrainBlocks(t: ChunkTerrainSpec): boolean {
  return t.kind === 'wall' || t.kind === 'solidWall' || t.kind === 'building';
}

/** South-field deploy row and neighbors for up to 6 mechs (2 players × 3). */
function buildPlayerSpawnTiles(spawns: MapSpawns): string[] {
  const seeds: HexCoord[] = [
    spawns.r1,
    spawns.r2,
    { q: spawns.r1.q - 1, r: spawns.r1.r },
    { q: spawns.r2.q + 1, r: spawns.r2.r },
    { q: spawns.r1.q + 1, r: spawns.r1.r },
    { q: spawns.r2.q - 1, r: spawns.r2.r },
  ];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const h of seeds) {
    const k = hexKey(h);
    if (!seen.has(k)) {
      seen.add(k);
      out.push(k);
    }
  }
  return out;
}

export function loadCoopMap(mapId = 'quadrants'): CoopMapData {
  const built = buildMapById(mapId);
  const tiles = built.map.tiles().map(hexKey);
  const blockedTiles = built.map.terrain()
    .filter(terrainBlocks)
    .map((t) => hexKey(t.hex));
  return {
    mapId,
    tiles,
    blockedTiles,
    spawns: built.spawns,
    spawnPointTiles: built.spawnPointTiles.map(hexKey),
    playerSpawnTiles: buildPlayerSpawnTiles(built.spawns),
    objectiveTiles: built.objectiveTiles.map(hexKey),
  };
}
