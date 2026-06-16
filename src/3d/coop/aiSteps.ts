// AI step helpers (split from ai.ts to avoid circular imports).

import { hexDistance, hexKey } from '../hex/HexCoord';
import { Pathfinder } from '../movement/Pathfinder';
import type { CoopGameEvent, CoopGameState, CoopUnit } from './types';
import { applyAction } from './engine';

function unitAt(state: CoopGameState, h: { q: number; r: number }): CoopUnit | undefined {
  const k = hexKey(h);
  return state.units.find((u) => !u.destroyed && hexKey(u.tile) === k);
}

function makePf(state: CoopGameState, mover: CoopUnit): Pathfinder {
  const tileSet = new Set(state.tiles);
  const blocked = new Set(state.blockedTiles);
  return new Pathfinder({
    inBounds: (h) => tileSet.has(hexKey(h)),
    isBlocked: (h) => {
      const k = hexKey(h);
      if (blocked.has(k)) return true;
      const occ = unitAt(state, h);
      return !!occ && occ.id !== mover.id;
    },
    canStop: (h) => !unitAt(state, h),
  });
}

export function aiStep(state: CoopGameState, mechId: string): {
  state: CoopGameState;
  events: CoopGameEvent[];
  acted: boolean;
} {
  const mech = state.units.find((u) => u.id === mechId);
  if (!mech || mech.destroyed || mech.team !== 2 || mech.ap <= 0) {
    return { state, events: [], acted: false };
  }

  const enemies = state.units.filter((u) => u.team === 1 && !u.destroyed);
  if (enemies.length === 0) return { state, events: [], acted: false };

  let best: CoopUnit | null = null;
  let bestDist = Infinity;
  for (const e of enemies) {
    const d = hexDistance(mech.tile, e.tile);
    if (d < bestDist) {
      bestDist = d;
      best = e;
    }
  }
  if (!best) return { state, events: [], acted: false };

  const dist = hexDistance(mech.tile, best.tile);
  if (dist <= mech.attackRange && mech.ap >= 1) {
    const res = applyAction(state, '__ai__', {
      kind: 'shoot',
      unitId: mech.id,
      targetUnitId: best.id,
    });
    return { state: res.state, events: res.events, acted: true };
  }

  const pf = makePf(state, mech);
  const reach = pf.reachable(mech.tile, mech.ap);
  let bestHex: { q: number; r: number } | null = null;
  let bestHexDist = dist;
  let bestCost = Infinity;

  for (const [k, cost] of reach) {
    if (cost === 0) continue;
    const h = { q: parseInt(k.split('_')[0], 10), r: parseInt(k.split('_')[1], 10) };
    const d = hexDistance(h, best.tile);
    if (d < bestHexDist || (d === bestHexDist && cost < bestCost)) {
      bestHexDist = d;
      bestCost = cost;
      bestHex = h;
    }
  }

  if (!bestHex) return { state, events: [], acted: false };

  const res = applyAction(state, '__ai__', { kind: 'move', unitId: mech.id, to: bestHex });
  return { state: res.state, events: res.events, acted: true };
}
