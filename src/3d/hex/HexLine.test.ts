// ============================================================================
// HexLine tests
// ============================================================================

import { describe, expect, it } from 'vitest';
import { hexDistance } from './HexCoord';
import { hexLine, hexLineBetween } from './HexLine';

describe('hexLine', () => {
  it('returns just the start when start === end', () => {
    expect(hexLine({ q: 2, r: -1 }, { q: 2, r: -1 })).toEqual([{ q: 2, r: -1 }]);
  });

  it('returns endpoints adjacent for direct neighbors', () => {
    const line = hexLine({ q: 0, r: 0 }, { q: 1, r: 0 });
    expect(line).toEqual([{ q: 0, r: 0 }, { q: 1, r: 0 }]);
  });

  it('produces hexDistance + 1 entries', () => {
    const a = { q: 0, r: 0 };
    const b = { q: 3, r: -2 };
    const line = hexLine(a, b);
    expect(line.length).toBe(hexDistance(a, b) + 1);
  });

  it('starts at a and ends at b', () => {
    const a = { q: -2, r: 3 };
    const b = { q:  2, r: -1 };
    const line = hexLine(a, b);
    expect(line[0]).toEqual(a);
    expect(line[line.length - 1]).toEqual(b);
  });

  it('every step is exactly one hex from the previous', () => {
    const line = hexLine({ q: -1, r: 0 }, { q: 2, r: -3 });
    for (let i = 1; i < line.length; i++) {
      expect(hexDistance(line[i - 1], line[i])).toBe(1);
    }
  });

  it('is symmetric in length', () => {
    const a = { q: 0, r: 0 };
    const b = { q: 1, r: 2 };
    expect(hexLine(a, b).length).toBe(hexLine(b, a).length);
  });
});

describe('hexLineBetween', () => {
  it('excludes both endpoints', () => {
    const between = hexLineBetween({ q: 0, r: 0 }, { q: 0, r: 3 });
    expect(between.length).toBe(2);
    expect(between).toEqual([{ q: 0, r: 1 }, { q: 0, r: 2 }]);
  });

  it('is empty for adjacent hexes', () => {
    expect(hexLineBetween({ q: 0, r: 0 }, { q: 1, r: 0 })).toEqual([]);
  });

  it('is empty for the same hex', () => {
    expect(hexLineBetween({ q: 5, r: -1 }, { q: 5, r: -1 })).toEqual([]);
  });
});
