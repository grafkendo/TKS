// ============================================================================
// Co-op map bootstrap — playable tiles + blockers from the battlefield map.
// ============================================================================

import { buildBattlefieldMap } from '../maps/battlefield';
import { hexKey, type HexCoord } from '../hex/HexCoord';
import type { ChunkTerrainSpec } from '../terrain/types';

export interface CoopMapData {
  mapId: string;
  tiles: string[];
  blockedTiles: string[];
  spawns: ReturnType<typeof buildBattlefieldMap>['spawns'];
  spawnPointTiles: string[];
  playerSpawnTiles: string[];
}

function terrainBlocks(t: ChunkTerrainSpec): boolean {
  return t.kind === 'wall' || t.kind === 'solidWall' || t.kind === 'building';
}

/** South-field deploy row and neighbors for up to 6 mechs (2 players × 3). */
function buildPlayerSpawnTiles(spawns: ReturnType<typeof buildBattlefieldMap>['spawns']): string[] {
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

export function loadCoopMap(mapId = 'battlefield'): CoopMapData {
  if (mapId !== 'battlefield') {
    throw new Error(`Unknown co-op map: ${mapId}`);
  }
  const built = buildBattlefieldMap();
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
  };
}
