import { describe, it, expect } from 'vitest';
import {
  apBonusFromKills,
  techPointsFromKills,
  nextKillMilestone,
  killsUntilNextMilestone,
} from './techProgress';

describe('apBonusFromKills', () => {
  it('grants no bonus below 3 kills', () => {
    expect(apBonusFromKills(0)).toBe(0);
    expect(apBonusFromKills(2)).toBe(0);
  });

  it('grants +1 AP at 3 kills', () => {
    expect(apBonusFromKills(3)).toBe(1);
    expect(apBonusFromKills(4)).toBe(1);
  });

  it('grants +2 AP at 5 kills', () => {
    expect(apBonusFromKills(5)).toBe(2);
    expect(apBonusFromKills(10)).toBe(2);
  });
});

describe('techPointsFromKills', () => {
  it('equals kill count', () => {
    expect(techPointsFromKills(4)).toBe(4);
  });
});

describe('milestones', () => {
  it('reports next milestone', () => {
    expect(nextKillMilestone(0)).toBe(3);
    expect(nextKillMilestone(3)).toBe(5);
    expect(nextKillMilestone(5)).toBeNull();
  });

  it('reports kills until next', () => {
    expect(killsUntilNextMilestone(1)).toBe(2);
    expect(killsUntilNextMilestone(4)).toBe(1);
    expect(killsUntilNextMilestone(5)).toBeNull();
  });
});
