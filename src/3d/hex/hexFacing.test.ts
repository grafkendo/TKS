import { describe, it, expect } from 'vitest';
import {
  facingDegToDirIndex,
  forwardArcDirIndices,
  isInForwardArc,
  hexesInForwardCone,
} from './hexFacing';
import { hexFacingDegrees } from './HexCoord';

describe('facingDegToDirIndex', () => {
  it('maps each hex direction back to its index', () => {
    const neighbors = [
      { q: 0, r: -1 },
      { q: 1, r: -1 },
      { q: 1, r: 0 },
      { q: 0, r: 1 },
      { q: -1, r: 1 },
      { q: -1, r: 0 },
    ];
    for (let i = 0; i < 6; i++) {
      const angle = hexFacingDegrees({ q: 0, r: 0 }, neighbors[i]);
      expect(facingDegToDirIndex(angle)).toBe(i);
    }
  });
});

describe('forwardArcDirIndices', () => {
  it('returns center and adjacent dirs', () => {
    const [l, c, r] = forwardArcDirIndices(
      hexFacingDegrees({ q: 0, r: 0 }, { q: 1, r: 0 }),
    );
    expect(r).toBe((c + 1) % 6);
    expect(l).toBe((c + 5) % 6);
  });
});

describe('hexesInForwardCone', () => {
  const facing = hexFacingDegrees({ q: 0, r: 0 }, { q: 1, r: 0 });

  it('returns 3 hexes at range 1', () => {
    const hexes = hexesInForwardCone({ q: 0, r: 0 }, facing, 1, () => true);
    expect(hexes).toHaveLength(3);
  });

  it('returns 8 hexes at range 2 (two rows)', () => {
    const hexes = hexesInForwardCone({ q: 0, r: 0 }, facing, 2, () => true);
    expect(hexes).toHaveLength(8);
  });
});

describe('isInForwardArc', () => {
  const origin = { q: 0, r: 0 };
  const facing = hexFacingDegrees(origin, { q: 1, r: 0 });

  it('allows targets straight ahead at range 2', () => {
    expect(isInForwardArc(origin, { q: 2, r: 0 }, facing, 2)).toBe(true);
  });

  it('allows inner diagonal at range 2', () => {
    expect(isInForwardArc(origin, { q: 2, r: -1 }, facing, 2)).toBe(true);
  });

  it('blocks targets directly behind at range 2', () => {
    expect(isInForwardArc(origin, { q: -2, r: 0 }, facing, 2)).toBe(false);
  });

  it('blocks flank hex at range 1 only cone', () => {
    expect(isInForwardArc(origin, { q: 2, r: -1 }, facing, 1)).toBe(false);
  });
});
