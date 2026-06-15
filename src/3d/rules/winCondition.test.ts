import { describe, it, expect } from 'vitest';
import {
  evaluateOutcome,
  isCombatantOut,
  type CombatantSnapshot,
  type Team,
} from './winCondition';

function unit(
  team: Team,
  state: Partial<Pick<CombatantSnapshot, 'destroyed' | 'immobilised'>> = {},
): CombatantSnapshot {
  return {
    team,
    destroyed: state.destroyed ?? false,
    immobilised: state.immobilised ?? false,
  };
}

describe('isCombatantOut', () => {
  it('is false for an active unit', () => {
    expect(isCombatantOut(unit(1))).toBe(false);
  });

  it('is true when destroyed', () => {
    expect(isCombatantOut(unit(1, { destroyed: true }))).toBe(true);
  });

  it('is true when immobilised', () => {
    expect(isCombatantOut(unit(1, { immobilised: true }))).toBe(true);
  });

  it('is true when both destroyed and immobilised', () => {
    expect(
      isCombatantOut(unit(1, { destroyed: true, immobilised: true })),
    ).toBe(true);
  });
});

describe('evaluateOutcome', () => {
  it('returns not-ended when no units have been spawned yet', () => {
    expect(evaluateOutcome([])).toEqual({ ended: false });
  });

  it('returns not-ended when only one team has units (pre-spawn race)', () => {
    expect(evaluateOutcome([unit(1)])).toEqual({ ended: false });
    expect(evaluateOutcome([unit(2)])).toEqual({ ended: false });
  });

  it('returns not-ended when both teams have at least one active unit', () => {
    expect(
      evaluateOutcome([
        unit(1),
        unit(1, { destroyed: true }),
        unit(2),
        unit(2, { immobilised: true }),
      ]),
    ).toEqual({ ended: false });
  });

  it('declares team 2 the winner when all team 1 are destroyed', () => {
    expect(
      evaluateOutcome([
        unit(1, { destroyed: true }),
        unit(1, { destroyed: true }),
        unit(2),
      ]),
    ).toEqual({ ended: true, winner: 2 });
  });

  it('declares team 2 the winner when all team 1 are immobilised', () => {
    expect(
      evaluateOutcome([
        unit(1, { immobilised: true }),
        unit(1, { immobilised: true }),
        unit(2),
      ]),
    ).toEqual({ ended: true, winner: 2 });
  });

  it('declares a winner when team 1 is a mix of destroyed and immobilised', () => {
    expect(
      evaluateOutcome([
        unit(1, { destroyed: true }),
        unit(1, { immobilised: true }),
        unit(2),
        unit(2, { destroyed: true }),
      ]),
    ).toEqual({ ended: true, winner: 2 });
  });

  it('declares team 1 the winner when all team 2 are destroyed', () => {
    expect(
      evaluateOutcome([
        unit(1),
        unit(2, { destroyed: true }),
        unit(2, { destroyed: true }),
      ]),
    ).toEqual({ ended: true, winner: 1 });
  });

  it('declares a draw when both teams are wiped simultaneously', () => {
    expect(
      evaluateOutcome([
        unit(1, { destroyed: true }),
        unit(1, { immobilised: true }),
        unit(2, { destroyed: true }),
        unit(2, { destroyed: true }),
      ]),
    ).toEqual({ ended: true, winner: 'draw' });
  });

  it('does not end the game while ANY unit on a team is still mobile', () => {
    // Team 1 has one immobilised + one active. Team 2 is fully destroyed.
    // Team 1 should win since team 2 is the only team fully wiped.
    expect(
      evaluateOutcome([
        unit(1, { immobilised: true }),
        unit(1),
        unit(2, { destroyed: true }),
      ]),
    ).toEqual({ ended: true, winner: 1 });
  });
});
