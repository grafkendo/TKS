// ============================================================================
// Building stage tests — verify the pure HP → stage mapping.
// We don't instantiate Building itself here because that pulls in Three.js
// geometry construction; `computeStage` is a standalone export.
// ============================================================================

import { describe, it, expect } from 'vitest';
import { computeStage } from './Building';

describe('computeStage', () => {
  it('returns 0 (intact) when HP is above 67% of max', () => {
    expect(computeStage(10, 10)).toBe(0);
    expect(computeStage(7, 10)).toBe(0);
    expect(computeStage(6.8, 10)).toBe(0);
  });

  it('returns 1 (bombed out) when HP is between 34% and 67%', () => {
    expect(computeStage(6, 10)).toBe(1);
    expect(computeStage(5, 10)).toBe(1);
    expect(computeStage(4, 10)).toBe(1);
    expect(computeStage(3.5, 10)).toBe(1);
  });

  it('returns 2 (heavy rubble) when HP is between 1% and 34%', () => {
    expect(computeStage(3, 10)).toBe(2);
    expect(computeStage(2, 10)).toBe(2);
    expect(computeStage(1, 10)).toBe(2);
  });

  it('returns 3 (rough terrain) when HP is 0 or below', () => {
    expect(computeStage(0, 10)).toBe(3);
    expect(computeStage(-1, 10)).toBe(3);
  });

  it('handles small buildings (6 HP) sensibly', () => {
    expect(computeStage(6, 6)).toBe(0);
    expect(computeStage(5, 6)).toBe(0);
    expect(computeStage(4, 6)).toBe(1);
    expect(computeStage(3, 6)).toBe(1);
    expect(computeStage(2, 6)).toBe(2);
    expect(computeStage(1, 6)).toBe(2);
    expect(computeStage(0, 6)).toBe(3);
  });

  it('handles edge cases — maxHp of 0 collapses to stage 3', () => {
    expect(computeStage(0, 0)).toBe(3);
  });
});
