// ============================================================================
// Shared map build result — every map builder returns this shape so main.ts
// can stay map-agnostic (spawns, crates, objectives, camera tuning).
// ============================================================================

import type { HexMap } from './HexMap';
import type { HexCoord } from '../hex/HexCoord';

export interface MapSpawns {
  r1: HexCoord;
  r2: HexCoord;
  /** Optional third red deploy tile. */
  r3?: HexCoord;
  b1: HexCoord;
  b2: HexCoord;
  b3?: HexCoord;
  b4?: HexCoord;
}

export interface MapBuildResult {
  mapId: string;
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
  /** Optional yaw (degrees) — 0 frames a wide map along its q axis. */
  cameraYawDeg?: number;
  displayName: string;
}
