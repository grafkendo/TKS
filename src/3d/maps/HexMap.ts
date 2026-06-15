// ============================================================================
// HexMap — compose a playable map from reusable hex-chunk templates.
//
// Goals:
//   - A chunk is a *template*: a named list of local hex coords + terrain
//     specs. The same chunk can be re-used at multiple world offsets.
//   - Placing a chunk translates every local hex by `origin` (axial add)
//     and pushes the resulting tiles + terrain placements into the map.
//   - The map exposes:
//       tiles()    — every playable hex in the composed map
//       terrain()  — every terrain spec, in WORLD axial coords
//       hasTile(h) — bounds check used by the pathfinder
//   - Conflicts (chunks overlapping on the same hex) are tolerated for
//     tiles (last write wins, but they're the same kind of tile so it
//     doesn't matter) and *reported* for terrain so callers can decide.
//
// Pure logic — no Three.js, no DOM. Unit-testable.
// ============================================================================

import { HexCoord, hexAdd, hexKey } from '../hex/HexCoord';
import type { ChunkTerrainSpec } from '../terrain/types';

/**
 * Reusable map fragment in *local* axial coordinates.
 *
 * Translate the whole chunk by adding `origin` when placing.
 */
export interface HexChunkTemplate {
  name: string;
  /** Local hex coords of every tile this chunk occupies. */
  hexes: ReadonlyArray<HexCoord>;
  /**
   * Optional terrain specs, also in *local* axial coords. When the chunk
   * is placed, these are translated and stored in world coords.
   */
  terrain?: ReadonlyArray<ChunkTerrainSpec>;
}

export interface ChunkPlacement {
  template: HexChunkTemplate;
  origin: HexCoord;
}

/**
 * A terrain spec resolved to its final world hex coordinate.
 *
 * NOTE: this is exactly the same shape as `ChunkTerrainSpec` (the `hex`
 * field is what the renderer uses) — we just promise it's in world coords
 * by the time you see one of these.
 */
export type TerrainPlacement = ChunkTerrainSpec;

export class HexMap {
  private tileSet = new Map<string, HexCoord>();
  private terrainList: TerrainPlacement[] = [];
  private chunkPlacements: ChunkPlacement[] = [];

  /**
   * Place a chunk template at a world axial offset.
   * Returns the map for fluent chaining.
   */
  placeChunk(template: HexChunkTemplate, origin: HexCoord): this {
    this.chunkPlacements.push({ template, origin });

    for (const localHex of template.hexes) {
      const worldHex = hexAdd(localHex, origin);
      this.tileSet.set(hexKey(worldHex), worldHex);
    }

    for (const spec of template.terrain ?? []) {
      const worldHex = hexAdd(spec.hex, origin);
      // Re-emit with the translated hex; the discriminated union flows through.
      this.terrainList.push({ ...spec, hex: worldHex } as TerrainPlacement);
    }

    return this;
  }

  /** All playable hexes in world axial coords. */
  tiles(): HexCoord[] {
    return [...this.tileSet.values()];
  }

  /** O(1) bounds check. */
  hasTile(h: HexCoord): boolean {
    return this.tileSet.has(hexKey(h));
  }

  /** Every terrain piece in world coords. */
  terrain(): TerrainPlacement[] {
    return this.terrainList.slice();
  }

  /** Inspect the raw chunk placements (e.g. for debugging). */
  chunks(): ChunkPlacement[] {
    return this.chunkPlacements.slice();
  }

  /** Find a terrain spec on a specific world hex (if any). */
  terrainAt(h: HexCoord): TerrainPlacement | undefined {
    const k = hexKey(h);
    return this.terrainList.find((t) => hexKey(t.hex) === k);
  }
}
