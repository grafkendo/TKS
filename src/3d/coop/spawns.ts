// ============================================================================
// Enemy orbital drops — ticked at the start of each AI phase.
// ============================================================================

import { hexFromKey, hexKey } from '../hex/HexCoord';
import { evaluateOutcome } from '../rules/winCondition';
import { makeCoopEnemy } from './enemyFactory';
import type { CoopActionResult, CoopGameEvent, CoopGameState, CoopUnit } from './types';

const MAX_TEAM2_ALIVE = 14;

function unitAt(units: CoopUnit[], h: { q: number; r: number }): CoopUnit | undefined {
  return units.find((u) => !u.destroyed && hexKey(u.tile) === hexKey(h));
}

/** Spawn enemies on clear drop pads (blocked if a red mech occupies the pad). */
export function tickEnemySpawns(state: CoopGameState): CoopActionResult {
  if (state.outcome.ended || state.spawnPointTiles.length === 0) {
    return { state, events: [] };
  }

  let units = [...state.units];
  let nextEnemyId = state.nextEnemyId;
  const events: CoopGameEvent[] = [];
  let dropped = 0;
  let suppressed = 0;

  const alive = () => units.filter((u) => u.team === 2 && !u.destroyed).length;

  for (const tileKey of state.spawnPointTiles) {
    if (alive() >= MAX_TEAM2_ALIVE) break;

    const tile = hexFromKey(tileKey);
    const occ = unitAt(units, tile);
    if (occ) {
      if (occ.team === 1) suppressed += 1;
      continue;
    }
    if (state.blockedTiles.includes(tileKey)) continue;

    const id = `b${nextEnemyId++}`;
    units.push(makeCoopEnemy(id, tile));
    dropped += 1;
    events.push({ kind: 'spawned', unitId: id, tile });
  }

  if (dropped > 0) {
    events.push({
      kind: 'message',
      text:
        `Orbital drop: ${dropped} hostile mech${dropped > 1 ? 's' : ''} deployed.` +
        (suppressed > 0
          ? ` ${suppressed} pad${suppressed > 1 ? 's' : ''} suppressed by your mechs.`
          : ''),
    });
  }

  return {
    state: { ...state, units, nextEnemyId, outcome: evaluateOutcome(units) },
    events,
  };
}
