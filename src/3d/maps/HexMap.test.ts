// ============================================================================
// HexMap tests
// ============================================================================

import { describe, expect, it } from 'vitest';
import { HexMap, HexChunkTemplate } from './HexMap';

const SIMPLE_BLOCK: HexChunkTemplate = {
  name: 'simple-3hex',
  hexes: [
    { q: 0, r: 0 },
    { q: 1, r: 0 },
    { q: 0, r: 1 },
  ],
  terrain: [
    { kind: 'building', hex: { q: 0, r: 0 }, stories: 2, hp: 4 },
    { kind: 'wall',     hex: { q: 1, r: 0 }, hp: 2 },
  ],
};

describe('HexMap', () => {
  it('starts empty', () => {
    const m = new HexMap();
    expect(m.tiles()).toEqual([]);
    expect(m.terrain()).toEqual([]);
  });

  it('placeChunk adds tiles in world coords', () => {
    const m = new HexMap().placeChunk(SIMPLE_BLOCK, { q: 5, r: -1 });
    const tiles = m.tiles();
    expect(tiles.length).toBe(3);
    // Each local hex translated by (5, -1)
    expect(m.hasTile({ q: 5, r: -1 })).toBe(true);
    expect(m.hasTile({ q: 6, r: -1 })).toBe(true);
    expect(m.hasTile({ q: 5, r:  0 })).toBe(true);
    expect(m.hasTile({ q: 0, r:  0 })).toBe(false);
  });

  it('placeChunk translates terrain specs to world coords', () => {
    const m = new HexMap().placeChunk(SIMPLE_BLOCK, { q: 5, r: -1 });
    const t = m.terrain();
    expect(t.length).toBe(2);

    const building = t.find((x) => x.kind === 'building')!;
    expect(building.hex).toEqual({ q: 5, r: -1 });
    if (building.kind === 'building') {
      expect(building.stories).toBe(2);
      expect(building.hp).toBe(4);
    }

    const wall = t.find((x) => x.kind === 'wall')!;
    expect(wall.hex).toEqual({ q: 6, r: -1 });
  });

  it('the same template can be placed multiple times at different origins', () => {
    const m = new HexMap()
      .placeChunk(SIMPLE_BLOCK, { q: 0, r: 0 })
      .placeChunk(SIMPLE_BLOCK, { q: 3, r: 0 });
    expect(m.tiles().length).toBe(6);
    expect(m.terrain().length).toBe(4);
    expect(m.hasTile({ q: 3, r: 0 })).toBe(true);
    expect(m.hasTile({ q: 4, r: 0 })).toBe(true);
  });

  it('overlapping placements de-duplicate tiles but stack terrain', () => {
    const m = new HexMap()
      .placeChunk(SIMPLE_BLOCK, { q: 0, r: 0 })
      .placeChunk(SIMPLE_BLOCK, { q: 0, r: 0 });
    // Tile set de-duplicates by key
    expect(m.tiles().length).toBe(3);
    // Terrain placements are recorded as-is (caller can dedupe / pick a winner)
    expect(m.terrain().length).toBe(4);
  });

  it('terrainAt returns the spec on a given world hex', () => {
    const m = new HexMap().placeChunk(SIMPLE_BLOCK, { q: 2, r: 0 });
    const here = m.terrainAt({ q: 2, r: 0 });
    expect(here?.kind).toBe('building');
    const empty = m.terrainAt({ q: 100, r: 100 });
    expect(empty).toBeUndefined();
  });
});
