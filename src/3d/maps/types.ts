// ============================================================================
// Shared map build result — every map builder returns this shape so main.ts
// can stay map-agnostic (spawns, crates, objectives, camera tuning).
// ============================================================================

import type { HexMap } from './HexMap';
import type { HexCoord } from '../hex/HexCoord';

export interface MapSpawns {
  r1: HexCoord;
  r2: HexCoord;
  b1: HexCoord;
  b2: HexCoord;
}

export interface MapBuildResult {
  map: HexMap;
  spawns: MapSpawns;
  /** Supply-crate spawn hexes (empty, walkable). */
  crateTiles: HexCoord[];
  /** Orbital drop-pad hexes for team 2. */
  spawnPointTiles: HexCoord[];
  /** Neutral capture objectives — standing on one claims it for your team. */
  objectiveTiles: HexCoord[];
  /** Iso camera zoom; larger maps need a higher value. */
  cameraZoom: number;
  displayName: string;
}
