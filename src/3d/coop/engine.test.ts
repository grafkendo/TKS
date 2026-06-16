import { describe, it, expect } from 'vitest';
import {
  createLobby,
  startGame,
  applyAction,
  setPlayerReady,
  type CoopPlayer,
} from './engine';

function host(): CoopPlayer {
  return { id: 'p1', name: 'Alpha', slot: 0, ready: false };
}

describe('coop engine', () => {
  it('starts a mission from lobby', () => {
    let state = createLobby('room1', host());
    state = setPlayerReady(state, 'p1', true);
    const { state: playing } = startGame(state);
    expect(playing.phase).toBe('human');
    expect(playing.units.filter((u) => u.team === 1).length).toBeGreaterThan(0);
    expect(playing.units.filter((u) => u.team === 2).length).toBeGreaterThan(0);
  });

  it('moves a player-owned mech', () => {
    let state = createLobby('room1', host());
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
    expect(res.state.units.find((u) => u.id === mech.id)!.ap).toBeLessThan(mech.ap);
  });
});
