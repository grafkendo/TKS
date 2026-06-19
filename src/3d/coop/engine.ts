// ============================================================================
// Co-op rules engine — authoritative move / shoot / pivot / phase flow.
// ============================================================================

import { hexDistance, hexEquals, hexFacingDegrees, hexFromKey, hexKey, hexNeighbor } from '../hex/HexCoord';
import { facingDegToDirIndex } from '../hex/hexFacing';
import { Pathfinder } from '../movement/Pathfinder';
import { apBonusFromKills } from '../rules/techProgress';
import { evaluateOutcome } from '../rules/winCondition';
import { rollStartingLoadout } from './loadout';
import { loadCoopMap } from './mapInit';
import { makeCoopEnemy } from './enemyFactory';
import type {
  ChassisKind,
  CoopAction,
  CoopActionResult,
  CoopGameEvent,
  CoopGameState,
  CoopPlayer,
  CoopUnit,
} from './types';

const SHOOT_AP = 1;
const MOVE_AP_CLEAR = 1;
const MAX_MECHS_PER_PLAYER = 3;
const PLAYER_FACING = 270;

function unitAt(state: CoopGameState, h: { q: number; r: number }): CoopUnit | undefined {
  return state.units.find((u) => !u.destroyed && hexEquals(u.tile, h));
}

function getUnit(state: CoopGameState, id: string): CoopUnit | undefined {
  return state.units.find((u) => u.id === id);
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

export function effectiveMaxAp(u: CoopUnit): number {
  return u.maxAp + apBonusFromKills(u.techKills);
}

export function applyTechToUnit(u: CoopUnit): CoopUnit {
  const maxAp = effectiveMaxAp(u);
  return { ...u, maxAp, ap: Math.min(u.ap, maxAp) };
}

/** Humans with at least one living mech, in slot order. */
function livingHumans(state: CoopGameState): CoopPlayer[] {
  return state.players
    .slice()
    .sort((a, b) => a.slot - b.slot)
    .filter((p) =>
      state.units.some((u) => u.ownerId === p.id && u.team === 1 && !u.destroyed),
    );
}

function emptyPlayer(id: string, name: string, slot: number): CoopPlayer {
  return { id, name, slot, ready: false, selectedMechs: [] };
}

export function createLobby(
  roomId: string,
  host: CoopPlayer,
  mapId = 'quadrants',
): CoopGameState {
  const map = loadCoopMap(mapId);
  return {
    roomId,
    mapId: map.mapId,
    tiles: map.tiles,
    blockedTiles: map.blockedTiles,
    spawnPointTiles: map.spawnPointTiles,
    playerSpawnTiles: map.playerSpawnTiles,
    units: [],
    players: [{ ...host, selectedMechs: host.selectedMechs ?? [] }],
    hostPlayerId: host.id,
    turnNumber: 0,
    phase: 'lobby',
    activePlayerId: null,
    nextEnemyId: 1,
    outcome: { ended: false },
  };
}

export function addPlayer(state: CoopGameState, player: CoopPlayer): CoopGameState {
  if (state.phase !== 'lobby') return state;
  if (state.players.length >= 2) return state;
  if (state.players.some((p) => p.id === player.id)) return state;
  return {
    ...state,
    players: [...state.players, { ...emptyPlayer(player.id, player.name, player.slot), selectedMechs: [] }],
  };
}

export function setPlayerName(state: CoopGameState, playerId: string, name: string): CoopGameState {
  const trimmed = name.trim().slice(0, 24) || 'Guest';
  return {
    ...state,
    players: state.players.map((p) =>
      p.id === playerId ? { ...p, name: trimmed } : p,
    ),
  };
}

/** Host-only — swap battlefield while still in lobby. Clears ready flags. */
export function setLobbyMap(
  state: CoopGameState,
  playerId: string,
  mapId: string,
): CoopGameState {
  if (state.phase !== 'lobby') throw new Error('Map can only be changed in the lobby.');
  if (playerId !== state.hostPlayerId) throw new Error('Only the host can choose the map.');
  const map = loadCoopMap(mapId);
  if (map.mapId === state.mapId) return state;
  return {
    ...state,
    mapId: map.mapId,
    tiles: map.tiles,
    blockedTiles: map.blockedTiles,
    spawnPointTiles: map.spawnPointTiles,
    playerSpawnTiles: map.playerSpawnTiles,
    players: state.players.map((p) => ({ ...p, ready: false })),
  };
}

export function setPlayerMechs(
  state: CoopGameState,
  playerId: string,
  mechs: ChassisKind[],
): CoopGameState {
  if (state.phase !== 'lobby') return state;
  if (mechs.length < 1 || mechs.length > MAX_MECHS_PER_PLAYER) {
    throw new Error(`Pick 1–${MAX_MECHS_PER_PLAYER} mechs.`);
  }
  const valid: ChassisKind[] = ['light', 'medium', 'heavy'];
  for (const m of mechs) {
    if (!valid.includes(m)) throw new Error('Invalid mech type.');
  }
  return {
    ...state,
    players: state.players.map((p) =>
      p.id === playerId
        ? { ...p, selectedMechs: [...mechs], ready: false }
        : p,
    ),
  };
}

export function setPlayerReady(state: CoopGameState, playerId: string, ready: boolean): CoopGameState {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return state;
  if (ready && player.selectedMechs.length === 0) {
    throw new Error('Select at least one mech before readying up.');
  }
  return {
    ...state,
    players: state.players.map((p) =>
      p.id === playerId ? { ...p, ready } : p,
    ),
  };
}

function statsForChassis(chassis: ChassisKind): Pick<CoopUnit, 'maxAp' | 'maxHp' | 'ap' | 'hp' | 'damage' | 'attackRange'> {
  switch (chassis) {
    case 'light':
      return { ap: 3, maxAp: 3, hp: 3, maxHp: 3, damage: 1, attackRange: 2 };
    case 'medium':
      return { ap: 2, maxAp: 2, hp: 3, maxHp: 3, damage: 1, attackRange: 2 };
    case 'heavy':
      return { ap: 3, maxAp: 3, hp: 4, maxHp: 4, damage: 2, attackRange: 1 };
  }
}

function makePlayerMech(
  id: string,
  ownerId: string,
  tile: { q: number; r: number },
  chassis: ChassisKind,
  rand: () => number,
): CoopUnit {
  return {
    id,
    team: 1,
    ownerId,
    tile,
    chassis,
    facingDeg: PLAYER_FACING,
    destroyed: false,
    techKills: 0,
    items: rollStartingLoadout(rand),
    ...statsForChassis(chassis),
  };
}

function takeSpawnTile(state: CoopGameState, used: Set<string>): { q: number; r: number } | null {
  for (const key of state.playerSpawnTiles) {
    if (used.has(key)) continue;
    if (state.blockedTiles.includes(key)) continue;
    const tile = hexFromKey(key);
    if (state.tiles.includes(key)) {
      used.add(key);
      return tile;
    }
  }
  return null;
}

export function startGame(state: CoopGameState): CoopActionResult {
  if (state.phase !== 'lobby') {
    throw new Error('Game already started.');
  }
  const readyPlayers = state.players.filter((p) => p.ready);
  if (readyPlayers.length === 0) {
    throw new Error('At least one player must ready up.');
  }
  for (const p of readyPlayers) {
    if (p.selectedMechs.length === 0) {
      throw new Error(`${p.name} must select mechs before start.`);
    }
  }

  const map = loadCoopMap(state.mapId);
  const sorted = state.players.slice().sort((a, b) => a.slot - b.slot);
  const units: CoopUnit[] = [];
  const usedTiles = new Set<string>();
  let mechSeq = 1;
  let randSeed = 0;
  const rand = () => {
    randSeed += 1;
    return ((Math.sin(randSeed * 9999 + state.roomId.length) + 1) / 2);
  };

  for (const player of sorted) {
    if (!player.ready) continue;
    for (const chassis of player.selectedMechs.slice(0, MAX_MECHS_PER_PLAYER)) {
      const tile = takeSpawnTile(state, usedTiles);
      if (!tile) throw new Error('Not enough deploy tiles for selected mechs.');
      const id = `r${mechSeq++}`;
      units.push(makePlayerMech(id, player.id, tile, chassis, rand));
    }
  }

  let nextEnemyId = 3;
  units.push(makeCoopEnemy('b1', map.spawns.b1, rand));
  units.push(makeCoopEnemy('b2', map.spawns.b2, rand));

  const activePlayerId = livingHumans({ ...state, units })[0]?.id ?? null;
  const events: CoopGameEvent[] = [
    { kind: 'message', text: 'Mission start — clear the hostiles.' },
    { kind: 'phase', phase: 'human', activePlayerId },
  ];

  const next: CoopGameState = {
    ...state,
    units,
    phase: 'human',
    turnNumber: 1,
    activePlayerId,
    nextEnemyId,
    outcome: evaluateOutcome(units),
  };
  return { state: next, events };
}

function assertActor(state: CoopGameState, playerId: string): void {
  if (state.phase !== 'human' && playerId !== '__ai__') {
    throw new Error('Not the human team phase.');
  }
  if (state.phase === 'ai' && playerId !== '__ai__') {
    throw new Error('AI is acting.');
  }
  if (state.phase === 'human' && playerId !== '__ai__') {
    if (playerId !== state.activePlayerId) {
      throw new Error('Wait for your sub-phase.');
    }
  }
  if (state.outcome.ended) throw new Error('Game is over.');
}

function assertOwnsUnit(state: CoopGameState, playerId: string, unit: CoopUnit): void {
  if (playerId === '__ai__') {
    if (unit.team !== 2) throw new Error('AI cannot control that unit.');
    return;
  }
  if (unit.ownerId !== playerId) throw new Error('That is not your mech.');
}

export function applyAction(
  state: CoopGameState,
  playerId: string,
  action: CoopAction,
): CoopActionResult {
  if (action.kind === 'endPhase') {
    return endPhase(state, playerId);
  }

  assertActor(state, playerId);
  const unit = getUnit(state, action.unitId);
  if (!unit || unit.destroyed) throw new Error('Unit not found.');

  if (state.phase === 'human') {
    assertOwnsUnit(state, playerId, unit);
  }

  switch (action.kind) {
    case 'move':
      return applyMove(state, unit, action.to);
    case 'shoot':
      return applyShoot(state, unit, action.targetUnitId, playerId);
    case 'pivot':
      return applyPivot(state, unit, action.direction);
    default:
      throw new Error('Unknown action.');
  }
}

function applyMove(state: CoopGameState, unit: CoopUnit, to: { q: number; r: number }): CoopActionResult {
  const pf = makePf(state, unit);
  const path = pf.findPath(unit.tile, to, unit.ap);
  if (!path || path.length === 0) throw new Error('Cannot reach that hex.');

  let ap = unit.ap;
  for (const step of path) {
    ap -= MOVE_AP_CLEAR;
    if (ap < 0) throw new Error('Not enough AP.');
  }

  const facingDeg = hexFacingDegrees(
    path.length > 1 ? path[path.length - 2] : unit.tile,
    path[path.length - 1],
  );

  const units = state.units.map((u) =>
    u.id === unit.id
      ? { ...u, tile: to, ap, facingDeg }
      : u,
  );

  return {
    state: { ...state, units, outcome: evaluateOutcome(units) },
    events: [{ kind: 'moved', unitId: unit.id, path }],
  };
}

function applyShoot(
  state: CoopGameState,
  shooter: CoopUnit,
  targetId: string,
  playerId: string,
): CoopActionResult {
  if (shooter.ap < SHOOT_AP) throw new Error('Not enough AP to fire.');
  const target = getUnit(state, targetId);
  if (!target || target.destroyed) throw new Error('Invalid target.');
  if (target.team === shooter.team) throw new Error('Friendly fire disabled.');

  const dist = hexDistance(shooter.tile, target.tile);
  if (dist > shooter.attackRange) throw new Error('Out of range.');

  const events: CoopGameEvent[] = [];
  let techKills = shooter.techKills;
  const dmg = shooter.damage;

  const units = state.units.map((u) => {
    if (u.id !== target.id) {
      if (u.id === shooter.id) return { ...u, ap: u.ap - SHOOT_AP };
      return u;
    }
    const hp = Math.max(0, u.hp - dmg);
    const destroyed = hp <= 0;
    if (destroyed && playerId !== '__ai__' && shooter.team === 1) {
      techKills += 1;
      events.push({ kind: 'message', text: `${shooter.id} tech kill → ${techKills}` });
    }
    return { ...u, hp, destroyed };
  });

  let shooterUpdated = units.find((u) => u.id === shooter.id)!;
  shooterUpdated = applyTechToUnit({ ...shooterUpdated, techKills });
  const finalUnits = units.map((u) => (u.id === shooter.id ? shooterUpdated : u));

  events.unshift({ kind: 'shot', unitId: shooter.id, targetUnitId: target.id, damage: dmg });

  return {
    state: { ...state, units: finalUnits, outcome: evaluateOutcome(finalUnits) },
    events,
  };
}

function applyPivot(
  state: CoopGameState,
  unit: CoopUnit,
  direction: 'left' | 'right',
): CoopActionResult {
  const cost = 0;
  if (cost > 0 && unit.ap < cost) throw new Error('Not enough AP to pivot.');

  const centerDir = facingDegToDirIndex(unit.facingDeg);
  const newDirIdx = direction === 'left' ? (centerDir + 5) % 6 : (centerDir + 1) % 6;
  const faceTile = hexNeighbor(unit.tile, newDirIdx);
  const facingDeg = hexFacingDegrees(unit.tile, faceTile);

  const units = state.units.map((u) =>
    u.id === unit.id
      ? { ...u, facingDeg, ap: u.ap - cost }
      : u,
  );

  return {
    state: { ...state, units },
    events: [{ kind: 'pivoted', unitId: unit.id, facingDeg }],
  };
}

function endPhase(state: CoopGameState, playerId: string): CoopActionResult {
  if (state.phase !== 'human') throw new Error('Cannot end phase now.');
  if (playerId !== state.activePlayerId) throw new Error('Not your sub-phase.');

  const events: CoopGameEvent[] = [];
  const humans = livingHumans(state);
  const currentIdx = humans.findIndex((p) => p.id === playerId);

  if (currentIdx >= 0 && currentIdx < humans.length - 1) {
    const nextId = humans[currentIdx + 1].id;
    events.push({
      kind: 'message',
      text: `${state.players.find((p) => p.id === nextId)?.name ?? 'Next player'}'s sub-phase.`,
    });
    events.push({ kind: 'phase', phase: 'human', activePlayerId: nextId });
    return {
      state: { ...state, activePlayerId: nextId },
      events,
    };
  }

  events.push({ kind: 'message', text: 'Enemy phase — orbital reinforcements incoming.' });
  events.push({ kind: 'phase', phase: 'ai', activePlayerId: null });
  return {
    state: { ...state, phase: 'ai', activePlayerId: null },
    events,
  };
}

/** After AI acts, begin the next human team round. */
export function beginHumanRound(state: CoopGameState): CoopActionResult {
  const units = state.units.map((u) => {
    if (u.destroyed) return { ...u, ap: 0 };
    if (u.team !== 1) return u;
    return applyTechToUnit({ ...u, ap: effectiveMaxAp(u) });
  });
  const activePlayerId = livingHumans({ ...state, units })[0]?.id ?? null;
  const events: CoopGameEvent[] = [
    { kind: 'phase', phase: 'human', activePlayerId },
  ];
  return {
    state: {
      ...state,
      units,
      phase: 'human',
      turnNumber: state.turnNumber + 1,
      activePlayerId,
      outcome: evaluateOutcome(units),
    },
    events,
  };
}

export function unitIdsForPlayer(state: CoopGameState, playerId: string): string[] {
  return state.units
    .filter((u) => u.ownerId === playerId)
    .map((u) => u.id)
    .slice(0, MAX_MECHS_PER_PLAYER);
}
