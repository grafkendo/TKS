// ============================================================================
// Enemy orbital drops — ticked at the start of each AI phase.
// ============================================================================

import { hexFromKey, hexKey } from '../hex/HexCoord';
import { evaluateOutcome } from '../rules/winCondition';
import type { CoopActionResult, CoopGameEvent, CoopGameState, CoopUnit } from './types';

const MAX_TEAM2_ALIVE = 14;
const FACING = 90;

function unitAt(units: CoopUnit[], h: { q: number; r: number }): CoopUnit | undefined {
  return units.find((u) => !u.destroyed && hexKey(u.tile) === hexKey(h));
}

function makeGrunt(id: string, tile: { q: number; r: number }): CoopUnit {
  return {
    id,
    team: 2,
    ownerId: null,
    tile,
    chassis: 'medium',
    hp: 1,
    maxHp: 1,
    ap: 1,
    maxAp: 1,
    damage: 1,
    attackRange: 1,
    facingDeg: FACING,
    destroyed: false,
    techKills: 0,
    items: [],
  };
}

/** Spawn grunts on clear drop pads (blocked if a red mech occupies the pad). */
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
    units.push(makeGrunt(id, tile));
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
