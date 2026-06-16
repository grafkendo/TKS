// ============================================================================
// Co-op map bootstrap — playable tiles + blockers from the battlefield map.
// ============================================================================

import { buildBattlefieldMap } from '../maps/battlefield';
import { hexKey } from '../hex/HexCoord';
import type { ChunkTerrainSpec } from '../terrain/types';

export interface CoopMapData {
  mapId: string;
  tiles: string[];
  blockedTiles: string[];
  spawns: ReturnType<typeof buildBattlefieldMap>['spawns'];
}

function terrainBlocks(t: ChunkTerrainSpec): boolean {
  return t.kind === 'wall' || t.kind === 'solidWall' || t.kind === 'building';
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
  };
}
