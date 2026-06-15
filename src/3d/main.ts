// ============================================================================
// Tackticus 3D — demo entry point.
//
// TURN-BASED RULES
// ----------------
//  - Teams alternate turns. End your turn with the "End Turn" button.
//  - Every mech refills to MAX AP (default 3) at the start of its team's turn.
//  - Moving into a clear hex costs 1 AP; moving onto rubble costs 2 AP.
//  - Firing costs 1 AP and does `unit.damage.effective` damage (default 1).
//  - Mechs have 3 HP. Buildings have 6–10 HP; walls have 2; rubble has 1.
//  - If a shot's hex line passes through a destructible building, damage
//    is HALVED per building crossed.
//  - Shooting rubble (1 HP) clears it and opens the path.
//
// All numeric attributes (maxAp, maxHp, attackRange, damage) are Stats with
// the same modifier architecture, so you can buff or debuff them from the
// devtools at runtime. See the bottom of this file.
// ============================================================================

import * as THREE from 'three';

import { Stage } from './scene/Stage';
import { IsoCamera } from './scene/IsoCamera';
import { Board, TILE_TOP_Y } from './scene/Board';
import { DefaultAssetLoader } from './mech/AssetLoader';
import { BasicEffects } from './fx/BasicEffects';
import { Picker } from './Picker';
import { Pathfinder } from './movement/Pathfinder';
import { ATTACK_RANGE_BASE } from './mech/types';
import type { MechAsset, ChassisType, WeaponType } from './mech/types';
import type { PrimitiveMech } from './mech/PrimitiveMech';
import { Stat } from './stats/Stat';
import {
  HexCoord,
  hexDistance,
  hexEquals,
  hexFacingDegrees,
  hexKey,
} from './hex/HexCoord';
import { hexLineBetween } from './hex/HexLine';

import { buildUrbanMap } from './maps/urban';
import { createTerrainFromSpec } from './terrain/factory';
import { Rubble } from './terrain/Rubble';
import type { TerrainPiece } from './terrain/types';

// ----- Tunables ------------------------------------------------------------

const SECONDS_PER_TILE_STEP = 0.28;

/** AP cost to enter a hex by terrain type. */
const AP_COST = {
  clearGround: 1,
  rubble: 2,
  shoot: 1,
} as const;

const RUBBLE_DEFAULT_HP = 1;

// ----- Setup ---------------------------------------------------------------

const canvas = document.getElementById('stage') as HTMLCanvasElement;
const statusEl = document.getElementById('status') as HTMLDivElement;
const statsEl = document.getElementById('stats') as HTMLDivElement;
const turnInfoEl = document.getElementById('turn-info') as HTMLDivElement;
const endTurnBtn = document.getElementById('end-turn-btn') as HTMLButtonElement;

const stage = new Stage(canvas);
const isoCam = new IsoCamera(canvas, {
  target: new THREE.Vector3(0, 0.5, 0),
  zoom: 8,
  pitchDeg: 40,
  yawDeg: 35,
});
stage.setCamera(isoCam.camera);

// ----- Load the composed map -----------------------------------------------

const { map, spawns: SPAWN } = buildUrbanMap();

const board = new Board(map.tiles());
stage.scene.add(board.root);

const fx = new BasicEffects();
stage.scene.add(fx.root);

const picker = new Picker(canvas, isoCam.camera);
picker.setBoardPickables(board.getPickables());

// ----- Terrain -------------------------------------------------------------

const terrainPieces: TerrainPiece[] = [];

function terrainAt(h: HexCoord): TerrainPiece | undefined {
  return terrainPieces.find((t) => !t.destroyed && hexEquals(t.tile, h));
}

function blockingTerrainAt(h: HexCoord): boolean {
  const t = terrainAt(h);
  return !!t && t.blocksMovement;
}

function elevationAt(h: HexCoord): number {
  const t = terrainAt(h);
  return t && t.walkable ? t.topY : 0;
}

/** AP cost to step onto a hex: 2 for rubble, 1 otherwise. */
function apCostToEnter(h: HexCoord): number {
  const t = terrainAt(h);
  if (t && t.kind === 'rubble' && !t.destroyed) return AP_COST.rubble;
  return AP_COST.clearGround;
}

function spawnTerrain(): void {
  let i = 0;
  for (const spec of map.terrain()) {
    const id = `t${i++}_${spec.kind}`;
    const piece = createTerrainFromSpec(id, spec.hex, spec);
    const p = board.tileToWorld(spec.hex);
    piece.object.position.set(p.x, TILE_TOP_Y, p.z);
    stage.scene.add(piece.object);
    picker.registerTerrain(id, piece.object);
    terrainPieces.push(piece);
  }
}
spawnTerrain();

// ----- Unit model ----------------------------------------------------------

interface Unit {
  id: string;
  mech: MechAsset;
  tile: HexCoord;
  team: 1 | 2;
  chassis: ChassisType;
  destroyed: boolean;
  facingDeg: number;

  // Attributes (Stats — modifiable via devtools)
  maxAp: Stat;
  maxHp: Stat;
  damage: Stat;
  attackRange: Stat;

  // Running state (plain numbers — refilled on turn start / decremented by play)
  ap: number;
  hp: number;
}

const units: Unit[] = [];

function unitAt(h: HexCoord): Unit | undefined {
  return units.find((u) => !u.destroyed && hexEquals(u.tile, h));
}

function makePathfinder(forUnit: Unit): Pathfinder {
  return new Pathfinder({
    inBounds: (h) => map.hasTile(h),
    isBlocked: (h) => {
      if (hexEquals(h, forUnit.tile)) return false;
      if (unitAt(h)) return true;
      return blockingTerrainAt(h);
    },
    costToEnter: apCostToEnter,
  });
}

// ----- Spawn mechs ---------------------------------------------------------

async function placeMech(spec: {
  id: string;
  chassis: ChassisType;
  team: 1 | 2;
  weaponRight: WeaponType;
  weaponLeft?: WeaponType;
  tile: HexCoord;
  facingDeg: number;
}): Promise<Unit> {
  const loader = new DefaultAssetLoader();
  const mech = await loader.loadMech({
    chassis: spec.chassis,
    team: spec.team,
    weaponRight: spec.weaponRight,
    weaponLeft: spec.weaponLeft,
  });

  const pos = board.tileToWorld(spec.tile);
  mech.object.position.copy(pos);
  mech.object.position.y = TILE_TOP_Y + elevationAt(spec.tile);
  mech.setFacing(spec.facingDeg);

  stage.scene.add(mech.object);
  picker.registerUnit(spec.id, mech.object);

  const maxAp = new Stat(3, { min: 0 });
  const maxHp = new Stat(3, { min: 1 });
  const damage = new Stat(1, { min: 0 });
  const attackRange = new Stat(ATTACK_RANGE_BASE, { min: 0 });

  const unit: Unit = {
    id: spec.id,
    mech,
    tile: spec.tile,
    team: spec.team,
    chassis: spec.chassis,
    destroyed: false,
    facingDeg: spec.facingDeg,
    maxAp,
    maxHp,
    damage,
    attackRange,
    ap: maxAp.effective,
    hp: maxHp.effective,
  };
  units.push(unit);

  stage.addTicker((dt) => (mech as PrimitiveMech).tick(dt));
  return unit;
}

(async () => {
  await placeMech({ id: 'r1', chassis: 'light',  team: 1, weaponRight: 'beam',                            tile: SPAWN.r1, facingDeg: 270 });
  await placeMech({ id: 'r2', chassis: 'heavy',  team: 1, weaponRight: 'cannon', weaponLeft: 'missiles',  tile: SPAWN.r2, facingDeg: 270 });
  await placeMech({ id: 'b1', chassis: 'medium', team: 2, weaponRight: 'cannon',                          tile: SPAWN.b1, facingDeg: 90 });
  await placeMech({ id: 'b2', chassis: 'medium', team: 2, weaponRight: 'missiles', weaponLeft: 'beam',    tile: SPAWN.b2, facingDeg: 90 });

  renderTurnInfo();
  setStatus("Red team's turn. Click a mech to select.");
})();

// ----- Turn state ----------------------------------------------------------

let currentTeam: 1 | 2 = 1;
let turnNumber = 1;

function endTurn(): void {
  if (mode === 'animating') return;
  // Switch teams; turnNumber increments only when blue → red wraps.
  currentTeam = currentTeam === 1 ? 2 : 1;
  if (currentTeam === 1) turnNumber += 1;

  // Refill AP for the new active team.
  for (const u of units) {
    if (u.team === currentTeam && !u.destroyed) {
      u.ap = u.maxAp.effective;
    }
  }

  // Deselect anyone whose team isn't active.
  if (selectedId) {
    const sel = units.find((u) => u.id === selectedId);
    if (!sel || sel.team !== currentTeam || sel.destroyed) {
      deselect();
    } else {
      // Selection survives across team-skip in edge cases; recompute.
      recomputeReachable(sel);
      refreshTileVisuals(null);
    }
  }

  renderTurnInfo();
  setStatus(`${teamName(currentTeam)} team's turn. Click a mech to play.`);
}
endTurnBtn.addEventListener('click', endTurn);

function teamName(team: 1 | 2): string {
  return team === 1 ? 'Red' : 'Blue';
}

function renderTurnInfo(): void {
  const color = currentTeam === 1 ? '#ff7a7a' : '#7aa8ff';
  turnInfoEl.innerHTML = `Turn ${turnNumber} — <span style="color:${color};font-weight:600">${teamName(currentTeam)} team</span>`;
}

// ----- Interaction state machine -------------------------------------------

type InteractionMode = 'idle' | 'selected' | 'animating';

let selectedId: string | null = null;
let mode: InteractionMode = 'idle';

/** Map "q_r" → AP cost to reach, set when a unit is selected. */
let reachableForSelected: Map<string, number> = new Map();

picker.setEvents({
  onTileHover(tile) {
    if (mode === 'animating') return;
    refreshTileVisuals(tile);
  },

  onUnitClick(unitId) {
    if (mode === 'animating') return;

    const target = units.find((u) => u.id === unitId);
    if (!target || target.destroyed) return;

    if (selectedId === null) {
      if (target.team !== currentTeam) {
        setStatus(`That's a ${teamName(target.team)} mech — it's ${teamName(currentTeam)}'s turn.`);
        return;
      }
      selectUnit(target);
      return;
    }

    if (selectedId === unitId) {
      deselect();
      return;
    }

    const shooter = units.find((u) => u.id === selectedId);
    if (!shooter || shooter.destroyed) {
      if (target.team === currentTeam) selectUnit(target);
      return;
    }

    if (shooter.team === target.team) {
      selectUnit(target);
      setStatus(`Switched selection to ${describeUnit(target)}.`);
      return;
    }

    fireAtUnit(shooter, target);
  },

  onTerrainClick(terrainId) {
    if (mode === 'animating') return;
    const terrain = terrainPieces.find((t) => t.id === terrainId);
    if (!terrain || terrain.destroyed) return;

    const shooter = selectedId ? units.find((u) => u.id === selectedId) : null;
    if (!shooter || shooter.destroyed) {
      setStatus(`${describeTerrain(terrain)}. Select one of your mechs first.`);
      return;
    }
    fireAtTerrain(shooter, terrain);
  },

  onTileClick(tile) {
    if (mode === 'animating') return;

    const shooter = selectedId ? units.find((u) => u.id === selectedId) : null;
    if (!shooter || shooter.destroyed) {
      deselect();
      return;
    }

    if (hexEquals(tile, shooter.tile)) {
      deselect();
      return;
    }

    if (!reachableForSelected.has(hexKey(tile))) return;

    void walkUnitTo(shooter, tile);
  },
});

function selectUnit(unit: Unit): void {
  selectedId = unit.id;
  mode = 'selected';
  recomputeReachable(unit);
  refreshTileVisuals(null);
  setStatus(describeSelection(unit));
}

function describeSelection(unit: Unit): string {
  return (
    `${describeUnit(unit)} — ` +
    `AP ${unit.ap}/${unit.maxAp.effective}, ` +
    `HP ${unit.hp}/${unit.maxHp.effective}, ` +
    `range ${unit.attackRange.effective}, dmg ${unit.damage.effective}. ` +
    (unit.ap > 0
      ? `Green = move, red = fire.`
      : `Out of AP — end the turn.`)
  );
}

function deselect(): void {
  selectedId = null;
  mode = 'idle';
  reachableForSelected = new Map();
  board.clearAllStates();
}

function recomputeReachable(unit: Unit): void {
  const pf = makePathfinder(unit);
  reachableForSelected = pf.reachable(unit.tile, unit.ap);
}

function refreshTileVisuals(hover: HexCoord | null): void {
  board.clearAllStates();

  const sel = selectedId ? units.find((u) => u.id === selectedId) : null;

  // Green: reachable hexes
  for (const k of reachableForSelected.keys()) {
    const [qs, rs] = k.split('_');
    const h: HexCoord = { q: parseInt(qs, 10), r: parseInt(rs, 10) };

    if (sel && hexEquals(sel.tile, h)) continue;
    if (unitAt(h)) continue;
    if (blockingTerrainAt(h)) continue;
    board.setTileState(h, 'move');
  }

  // Red: enemies + destructible terrain in attack range (and only if the
  // selected unit still has AP to fire).
  if (sel && sel.ap >= AP_COST.shoot) {
    const range = sel.attackRange.effective;
    for (const target of units) {
      if (target.destroyed || target.team === sel.team) continue;
      if (hexDistance(sel.tile, target.tile) <= range) {
        board.setTileState(target.tile, 'attack');
      }
    }
    for (const t of terrainPieces) {
      if (t.destroyed || t.hp === undefined) continue;
      if (hexDistance(sel.tile, t.tile) <= range) {
        board.setTileState(t.tile, 'attack');
      }
    }
  }

  if (sel) board.setTileState(sel.tile, 'selected');

  if (hover && board.has(hover)) board.setTileState(hover, 'hover');
}

function describeUnit(u: Unit): string {
  return `${teamName(u.team)} ${u.chassis} ${u.id.toUpperCase()}`;
}

function describeTerrain(t: TerrainPiece): string {
  const hp = t.hp !== undefined && t.maxHp !== undefined
    ? ` (HP ${t.hp}/${t.maxHp})`
    : ' (indestructible)';
  return `${t.kind}${hp}`;
}

// ----- Movement ------------------------------------------------------------

async function walkUnitTo(unit: Unit, dest: HexCoord): Promise<void> {
  const pf = makePathfinder(unit);
  const path = pf.findPath(unit.tile, dest, unit.ap);
  if (!path || path.length === 0) return;

  const cost = pf.pathCost(path);
  if (cost > unit.ap) {
    setStatus(
      `Path costs ${cost} AP but ${describeUnit(unit)} only has ${unit.ap}.`,
    );
    return;
  }

  mode = 'animating';
  board.clearAllStates();
  setStatus(`${describeUnit(unit)} moving (${cost} AP)…`);

  unit.mech.playAnimation('walk');

  for (const step of path) {
    await animateStep(unit, step);
    unit.tile = step;
    unit.ap -= apCostToEnter(step);
  }

  unit.mech.playAnimation('idle');

  mode = 'selected';
  recomputeReachable(unit);
  refreshTileVisuals(null);
  setStatus(describeSelection(unit));
}

function animateStep(unit: Unit, dest: HexCoord): Promise<void> {
  return new Promise((resolve) => {
    const fromWorld = board.tileToWorld(unit.tile);
    const toWorld   = board.tileToWorld(dest);
    const fromY = TILE_TOP_Y + elevationAt(unit.tile);
    const toY   = TILE_TOP_Y + elevationAt(dest);

    const targetYawDeg = hexFacingDegrees(unit.tile, dest);
    unit.facingDeg = targetYawDeg;
    unit.mech.setFacing(targetYawDeg);

    const start = performance.now() / 1000;
    const removeTicker = stage.addTicker(() => {
      const t = Math.min(1, (performance.now() / 1000 - start) / SECONDS_PER_TILE_STEP);
      unit.mech.object.position.x = THREE.MathUtils.lerp(fromWorld.x, toWorld.x, t);
      unit.mech.object.position.z = THREE.MathUtils.lerp(fromWorld.z, toWorld.z, t);
      const arc = (fromY !== toY) ? Math.sin(t * Math.PI) * 0.08 : 0;
      unit.mech.object.position.y = THREE.MathUtils.lerp(fromY, toY, t) + arc;
      if (t >= 1) {
        unit.mech.object.position.x = toWorld.x;
        unit.mech.object.position.z = toWorld.z;
        unit.mech.object.position.y = toY;
        removeTicker();
        resolve();
      }
    });
  });
}

// ----- Combat --------------------------------------------------------------

/**
 * Compute damage multiplier from cover. For each destructible building
 * between shooter and target hex, damage is halved. Rubble and walls
 * don't apply (rubble is debris; walls are short cover, not "through").
 */
function coverMultiplier(from: HexCoord, to: HexCoord): { mult: number; buildingsCrossed: number } {
  const between = hexLineBetween(from, to);
  let mult = 1;
  let buildingsCrossed = 0;
  for (const h of between) {
    const t = terrainAt(h);
    if (t && !t.destroyed && t.kind === 'building') {
      mult *= 0.5;
      buildingsCrossed += 1;
    }
  }
  return { mult, buildingsCrossed };
}

function fireAtUnit(shooter: Unit, target: Unit): void {
  if (shooter.ap < AP_COST.shoot) {
    setStatus(`${describeUnit(shooter)} has no AP to fire.`);
    return;
  }
  const dist = hexDistance(shooter.tile, target.tile);
  const range = shooter.attackRange.effective;
  if (dist > range) {
    setStatus(`${describeUnit(target)} is out of range (${dist}/${range}). Move closer.`);
    return;
  }

  const { mult, buildingsCrossed } = coverMultiplier(shooter.tile, target.tile);
  const damage = shooter.damage.effective * mult;
  shooter.ap -= AP_COST.shoot;

  faceAndFire(shooter, target.mech.object.position, () => {
    const torsoTgt = target.mech.getAttachPoint('torso');
    if (!torsoTgt) return;
    const targetWorld = new THREE.Vector3();
    torsoTgt.getWorldPosition(targetWorld);
    fx.impact({ position: targetWorld });
    target.mech.playAnimation('hit');

    target.hp = Math.max(0, target.hp - damage);
    target.mech.setDamageLevel(
      Math.min(1, (target.maxHp.effective - target.hp) / target.maxHp.effective),
    );

    const dmgStr = formatDamage(damage);
    const coverStr = buildingsCrossed > 0
      ? ` through ${buildingsCrossed} building${buildingsCrossed > 1 ? 's' : ''} (half damage)`
      : '';

    if (target.hp <= 0) {
      target.destroyed = true;
      fx.explosion({ position: targetWorld, scale: 1.4 });
      target.mech.playAnimation('destroyed');
      setStatus(`${describeUnit(target)} destroyed by ${describeUnit(shooter)}${coverStr}.`);
      sinkUnitWreckage(target);
    } else {
      setStatus(
        `${describeUnit(shooter)} hits ${describeUnit(target)} for ${dmgStr}${coverStr}. ` +
        `(HP ${target.hp}/${target.maxHp.effective})`,
      );
    }

    refreshAfterAction();
  });
}

function fireAtTerrain(shooter: Unit, terrain: TerrainPiece): void {
  if (terrain.hp === undefined) {
    setStatus(`${terrain.kind} is indestructible.`);
    return;
  }
  if (shooter.ap < AP_COST.shoot) {
    setStatus(`${describeUnit(shooter)} has no AP to fire.`);
    return;
  }
  const dist = hexDistance(shooter.tile, terrain.tile);
  const range = shooter.attackRange.effective;
  if (dist > range) {
    setStatus(`${terrain.kind} is out of range (${dist}/${range}). Move closer.`);
    return;
  }

  // No cover penalty for shooting *at* terrain (we're not shooting through it).
  const damage = shooter.damage.effective;
  shooter.ap -= AP_COST.shoot;

  const tBox = new THREE.Box3().setFromObject(terrain.object);
  const impactWorld = new THREE.Vector3();
  tBox.getCenter(impactWorld);

  faceAndFire(shooter, impactWorld, () => {
    fx.impact({ position: impactWorld });
    const wasDestroyed = terrain.takeDamage(damage);
    if (wasDestroyed) {
      fx.explosion({ position: impactWorld, scale: 1.2 });
      const verb = terrain.kind === 'rubble' ? 'cleared' : 'destroyed';
      setStatus(`${describeUnit(shooter)} ${verb} the ${terrain.kind}.`);
      replaceWithRubble(terrain);
    } else {
      setStatus(
        `${describeUnit(shooter)} damaged the ${terrain.kind} ` +
        `(HP ${terrain.hp}/${terrain.maxHp}).`,
      );
    }

    refreshAfterAction();
  });
}

function refreshAfterAction(): void {
  if (selectedId) {
    const sel = units.find((u) => u.id === selectedId);
    if (sel && !sel.destroyed) {
      recomputeReachable(sel);
      refreshTileVisuals(null);
    }
  }
}

function formatDamage(d: number): string {
  return Number.isInteger(d) ? `${d}` : `${d.toFixed(1)}`;
}

function faceAndFire(shooter: Unit, targetWorldPos: THREE.Vector3, onHit: () => void): void {
  const sp = shooter.mech.object.position;
  const dx = targetWorldPos.x - sp.x;
  const dz = targetWorldPos.z - sp.z;
  const yawDeg = THREE.MathUtils.radToDeg(Math.atan2(dz, dx));
  shooter.facingDeg = yawDeg;
  shooter.mech.setFacing(yawDeg);
  shooter.mech.playAnimation('fire');

  const barrel = shooter.mech.getAttachPoint('rightHand');
  if (!barrel) return;
  const barrelWorld = new THREE.Vector3();
  barrel.getWorldPosition(barrelWorld);

  const dir = targetWorldPos.clone().sub(barrelWorld).normalize();
  fx.muzzleFlash({ position: barrelWorld, direction: dir });
  fx.beam({ from: barrelWorld, to: targetWorldPos, durationSec: 0.18, color: '#fff2a8' });

  setTimeout(onHit, 120);
}

function sinkUnitWreckage(target: Unit): void {
  setTimeout(() => {
    const sinkStart = performance.now() / 1000;
    const initialY = target.mech.object.position.y;
    const sinkSec = 0.6;
    const removeTicker = stage.addTicker(() => {
      const elapsed = performance.now() / 1000 - sinkStart;
      const t = Math.min(1, elapsed / sinkSec);
      target.mech.object.position.y = initialY - t * 1.6;
      target.mech.object.rotation.z = t * 0.4;
      (target.mech.object as THREE.Object3D).traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.Material | undefined;
        if (m && 'opacity' in m) {
          if (!m.transparent) m.transparent = true;
          (m as THREE.MeshStandardMaterial).opacity = 1 - t;
        }
      });
      if (t >= 1) {
        stage.scene.remove(target.mech.object);
        picker.unregisterUnit(target.id);
        removeTicker();
        refreshAfterAction();
      }
    });
  }, 200);
}

function replaceWithRubble(terrain: TerrainPiece): void {
  picker.unregisterTerrain(terrain.id);
  stage.scene.remove(terrain.object);
  terrain.dispose();

  // Don't spawn rubble for rubble (its destruction means "cleared") or for
  // platforms (visually weird — but they're indestructible anyway).
  if (terrain.kind === 'rubble' || terrain.kind === 'platform') return;

  const rubbleId = `${terrain.id}_rubble`;
  const rubble = new Rubble({
    id: rubbleId,
    tile: terrain.tile,
    hp: RUBBLE_DEFAULT_HP,
  });
  const p = board.tileToWorld(terrain.tile);
  rubble.object.position.set(p.x, TILE_TOP_Y, p.z);
  stage.scene.add(rubble.object);
  picker.registerTerrain(rubbleId, rubble.object);
  terrainPieces.push(rubble);
}

// ----- Devtools console hooks ----------------------------------------------

interface StatSnapshot {
  base: number;
  effective: number;
  mods: ReadonlyArray<{ source: string; delta: number; label?: string }>;
}

interface TackticusApi {
  units(): Array<{
    id: string; chassis: ChassisType; team: 1 | 2; tile: HexCoord; destroyed: boolean;
    ap: number; hp: number;
    maxAp: StatSnapshot; maxHp: StatSnapshot; damage: StatSnapshot; attackRange: StatSnapshot;
  }>;
  terrain(): Array<{
    id: string; kind: string; tile: HexCoord; destroyed: boolean;
    hp?: number; maxHp?: number; blocksMovement: boolean; walkable: boolean; topY: number;
  }>;
  turn(): { number: number; team: 1 | 2 };
  endTurn(): void;
  applyApModifier(unitId: string, source: string, delta: number, label?: string): boolean;
  applyHpModifier(unitId: string, source: string, delta: number, label?: string): boolean;
  applyDamageModifier(unitId: string, source: string, delta: number, label?: string): boolean;
  applyRangeModifier(unitId: string, source: string, delta: number, label?: string): boolean;
  setAp(unitId: string, ap: number): boolean;
  setHp(unitId: string, hp: number): boolean;
  damageTerrain(terrainId: string, amount: number): boolean;
}

const snapshot = (s: Stat): StatSnapshot => ({
  base: s.base,
  effective: s.effective,
  mods: s.modifiers.map((m) => ({ source: m.source, delta: m.delta, label: m.label })),
});

function repaintIfSelected(unitId: string): void {
  const sel = selectedId ? units.find((u) => u.id === selectedId) : null;
  if (sel && sel.id === unitId) {
    recomputeReachable(sel);
    refreshTileVisuals(null);
  }
}

const api: TackticusApi = {
  units: () =>
    units.map((u) => ({
      id: u.id, chassis: u.chassis, team: u.team, tile: u.tile, destroyed: u.destroyed,
      ap: u.ap, hp: u.hp,
      maxAp: snapshot(u.maxAp),
      maxHp: snapshot(u.maxHp),
      damage: snapshot(u.damage),
      attackRange: snapshot(u.attackRange),
    })),
  terrain: () =>
    terrainPieces.map((t) => ({
      id: t.id, kind: t.kind, tile: t.tile, destroyed: t.destroyed,
      hp: t.hp, maxHp: t.maxHp,
      blocksMovement: t.blocksMovement, walkable: t.walkable, topY: t.topY,
    })),
  turn: () => ({ number: turnNumber, team: currentTeam }),
  endTurn: () => endTurn(),

  applyApModifier(unitId, source, delta, label) {
    const u = units.find((x) => x.id === unitId);
    if (!u) return false;
    u.maxAp.addModifier({ source, delta, label });
    repaintIfSelected(u.id);
    return true;
  },
  applyHpModifier(unitId, source, delta, label) {
    const u = units.find((x) => x.id === unitId);
    if (!u) return false;
    u.maxHp.addModifier({ source, delta, label });
    return true;
  },
  applyDamageModifier(unitId, source, delta, label) {
    const u = units.find((x) => x.id === unitId);
    if (!u) return false;
    u.damage.addModifier({ source, delta, label });
    return true;
  },
  applyRangeModifier(unitId, source, delta, label) {
    const u = units.find((x) => x.id === unitId);
    if (!u) return false;
    u.attackRange.addModifier({ source, delta, label });
    repaintIfSelected(u.id);
    return true;
  },
  setAp(unitId, ap) {
    const u = units.find((x) => x.id === unitId);
    if (!u) return false;
    u.ap = Math.max(0, ap);
    repaintIfSelected(u.id);
    return true;
  },
  setHp(unitId, hp) {
    const u = units.find((x) => x.id === unitId);
    if (!u) return false;
    u.hp = Math.max(0, hp);
    return true;
  },
  damageTerrain(terrainId, amount) {
    const t = terrainPieces.find((x) => x.id === terrainId);
    if (!t) return false;
    const destroyed = t.takeDamage(amount);
    if (destroyed) replaceWithRubble(t);
    refreshAfterAction();
    return true;
  },
};
(window as unknown as { tackticus: TackticusApi }).tackticus = api;

// ----- Main tickers --------------------------------------------------------

stage.addTicker((dt) => isoCam.tick(dt));
stage.addTicker((dt) => fx.tick(dt));

let fpsAcc = 0;
let fpsCount = 0;
let fpsLastUpdate = 0;
stage.addTicker((dt, total) => {
  fpsAcc += dt;
  fpsCount += 1;
  if (total - fpsLastUpdate > 0.5) {
    const fps = fpsCount / fpsAcc;
    statsEl.textContent = `${fps.toFixed(0)} FPS`;
    fpsAcc = 0;
    fpsCount = 0;
    fpsLastUpdate = total;
  }
});

stage.start();

// ----- Helpers -------------------------------------------------------------

function setStatus(text: string): void {
  statusEl.textContent = text;
}
