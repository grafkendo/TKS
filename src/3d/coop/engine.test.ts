import { describe, it, expect } from 'vitest';
import {
  createLobby,
  startGame,
  applyAction,
  setPlayerReady,
  setPlayerMechs,
  setLobbyMap,
  type CoopPlayer,
} from './engine';
import { runAiPhase } from './ai';

function host(): CoopPlayer {
  return { id: 'p1', name: 'Alpha', slot: 0, ready: false, selectedMechs: [] };
}

function endPhaseViaAction(state: ReturnType<typeof createLobby>, playerId: string) {
  return applyAction(state, playerId, { kind: 'endPhase' });
}

describe('coop engine', () => {
  it('host can change lobby map and clears ready flags', () => {
    let state = createLobby('room1', host(), 'quadrants');
    state = setPlayerMechs(state, 'p1', ['light']);
    state = setPlayerReady(state, 'p1', true);
    state = setLobbyMap(state, 'p1', 'urban');
    expect(state.mapId).toBe('urban');
    expect(state.players[0].ready).toBe(false);
  });

  it('non-host cannot change lobby map', () => {
    const state = createLobby('room1', host());
    expect(() => setLobbyMap(state, 'p2', 'urban')).toThrow(/host/i);
  });

  it('starts a mission from lobby with mech selection', () => {
    let state = createLobby('room1', host());
    state = setPlayerMechs(state, 'p1', ['light', 'heavy']);
    state = setPlayerReady(state, 'p1', true);
    const { state: playing } = startGame(state);
    expect(playing.phase).toBe('human');
    expect(playing.units.filter((u) => u.ownerId === 'p1').length).toBe(2);
    expect(playing.units.find((u) => u.id === 'r1')!.items.length).toBe(3);
  });

  it('moves a player-owned mech', () => {
    let state = createLobby('room1', host());
    state = setPlayerMechs(state, 'p1', ['light']);
    state = setPlayerReady(state, 'p1', true);
    state = startGame(state).state;
    const mech = state.units.find((u) => u.ownerId === 'p1')!;
    const dest = { q: mech.tile.q + 1, r: mech.tile.r };
    const res = applyAction(state, 'p1', {
      kind: 'move',
      unitId: mech.id,
      to: dest,
    });
    expect(res.events[0].kind).toBe('moved');
    expect(res.state.units.find((u) => u.id === mech.id)!.tile).toEqual(dest);
  });

  it('transitions to AI phase when the last human ends sub-phase', () => {
    let state = createLobby('room1', host());
    state = setPlayerMechs(state, 'p1', ['light']);
    state = setPlayerReady(state, 'p1', true);
    state = startGame(state).state;
    const res = endPhaseViaAction(state, 'p1');
    expect(res.state.phase).toBe('ai');
  });

  it('spawns enemies at the start of the AI phase', () => {
    let state = createLobby('room1', host());
    state = setPlayerMechs(state, 'p1', ['light']);
    state = setPlayerReady(state, 'p1', true);
    state = startGame(state).state;
    state = endPhaseViaAction(state, 'p1').state;
    const before = state.units.filter((u) => u.team === 2).length;
    const ai = runAiPhase(state);
    expect(ai.state.phase).toBe('human');
    expect(ai.state.units.filter((u) => u.team === 2).length).toBeGreaterThanOrEqual(before);
  });

  it('refills player AP after the AI round without touching spent enemy AP mid-round', () => {
    let state = createLobby('room1', host());
    state = setPlayerMechs(state, 'p1', ['light', 'heavy']);
    state = setPlayerReady(state, 'p1', true);
    state = startGame(state).state;
    const player = state.units.find((u) => u.ownerId === 'p1' && u.chassis === 'heavy')!;
    const spent = applyAction(state, 'p1', {
      kind: 'move',
      unitId: player.id,
      to: { q: player.tile.q + 1, r: player.tile.r },
    }).state;
    const afterMove = spent.units.find((u) => u.id === player.id)!;
    expect(afterMove.ap).toBeLessThan(afterMove.maxAp);

    const ai = runAiPhase(endPhaseViaAction(spent, 'p1').state);
    const refilled = ai.state.units.find((u) => u.id === player.id)!;
    expect(refilled.ap).toBe(refilled.maxAp);
    expect(ai.state.turnNumber).toBe(spent.turnNumber + 1);
  });
});
