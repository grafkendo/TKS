// ============================================================================
// Terrain factory — dispatches a ChunkTerrainSpec into the concrete piece.
//
// Centralizes the "which class implements which kind" mapping so callers
// (HexMap → renderer wiring) never import the concrete classes directly.
// ============================================================================

import { Building } from './Building';
import { Platform } from './Platform';
import { Rubble } from './Rubble';
import { Wall } from './Wall';
import { SolidWall } from './SolidWall';
import type { ChunkTerrainSpec, TerrainPiece } from './types';
import type { HexCoord } from '../hex/HexCoord';

/**
 * Build the concrete TerrainPiece for a spec on a specific world hex.
 * `id` should be unique within the running scene (e.g. `"t_${i}"`).
 */
export function createTerrainFromSpec(
  id: string,
  worldHex: HexCoord,
  spec: ChunkTerrainSpec,
): TerrainPiece {
  switch (spec.kind) {
    case 'building':
      return new Building({
        id,
        tile: worldHex,
        stories: spec.stories,
        hp: spec.hp,
        style: spec.style,
      });
    case 'platform':
      return new Platform({
        id,
        tile: worldHex,
        elevation: spec.elevation,
        hp: spec.hp,
      });
    case 'wall':
      return new Wall({
        id,
        tile: worldHex,
        height: spec.height,
        hp: spec.hp,
      });
    case 'solidWall':
      return new SolidWall({
        id,
        tile: worldHex,
        height: spec.height,
      });
    case 'rubble':
      return new Rubble({
        id,
        tile: worldHex,
        hp: spec.hp,
      });
  }
}
