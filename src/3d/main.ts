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
//  - HIGH GROUND: when the shooter is on elevated terrain (a platform) AND
//    the target is lower than them, the attack does +1 damage. The bonus
//    is added BEFORE the cover multiplier — high-ground through cover is
//    `(base + 1) * 0.5`.
//
// WIN CONDITION
// -------------
//  - A team is defeated when EVERY one of its mechs is either destroyed
//    OR immobilised. The other team wins (or it's a draw on mutual wipe).
//  - Immobilised mechs cannot move and cannot shoot, but still occupy
//    their hex. They count as "out" for win-condition purposes.
//  - Pure rule logic lives in ./rules/winCondition.ts and is unit tested.
//
// INVENTORY & SUPPLY CRATES
// -------------------------
//  - Every mech carries a 6-slot inventory: 2 hand slots + 4 backpack.
//  - SUPPLY CRATES sit on the board. The contents are randomized at
//    OPEN time so the player doesn't know what's inside until they
//    commit. To open a crate the active mech must:
//      1. stand on the crate's hex
//      2. spend 1 AP
//      3. click the crate (or call tackticus.openCrate)
//    Hand items are routed to the first empty hand slot; everything
//    else goes to backpack. The random roll is constrained by which
//    slot kinds are free, so an open with at least one free slot
//    always yields a usable item.
//  - Passive items attach a Stat modifier (source = "item:<itemId>")
//    that's reversed on removal — picking up "Plating +2" really does
//    push your maxHp Stat by +2.
//  - Consumables (repair kit, mine) are activated by clicking their
//    inventory slot in the dashboard. They cost AP and are removed
//    from inventory on use.
//  - Mines: placed on the placer's current hex; explode for `amount`
//    damage when an enemy mech enters. Friendly mines don't trigger.
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
import { evaluateOutcome, type GameOutcome } from './rules/winCondition';
import type { Item } from './items/types';
import {
  createEmptyInventory,
  addItem,
  removeItem,
  hasSpaceFor,
  type Inventory,
  type SlotAddress,
} from './items/inventory';
import {
  makeWeapon,
  makeArmor,
  makeRangeModule,
  makeRepairKit,
  makeMine,
} from './items/factory';
import { rollItem } from './items/randomItem';
import { createCrateMesh } from './items/Crate';
import { createPlacedMineMesh, type PickupMeshHandle } from './items/PickupMesh';

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
const gameOverEl = document.getElementById('game-over') as HTMLDivElement;
const dashboardEl = document.getElementById('dashboard') as HTMLDivElement;

/** Up to N controlled-mech slots shown in the bottom dashboard. */
const DASHBOARD_SLOTS = 3;

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

// ----- Supply crates & mines -----------------------------------------------

interface CrateEntity {
  id: string;
  tile: HexCoord;
  mesh: PickupMeshHandle;
}

interface MineEntity {
  id: string;
  tile: HexCoord;
  damage: number;
  /** Mines won't trigger for mechs on this team (friendly fire avoided). */
  placerTeam: 1 | 2;
  placerId: string;
  mesh: PickupMeshHandle;
}

const crates: CrateEntity[] = [];
const mines: MineEntity[] = [];

let _crateSeq = 0;

function crateAt(h: HexCoord): CrateEntity | undefined {
  return crates.find((c) => hexEquals(c.tile, h));
}

function mineAt(h: HexCoord): MineEntity | undefined {
  return mines.find((m) => hexEquals(m.tile, h));
}

function spawnCrate(tile: HexCoord): CrateEntity {
  const id = `crate-${++_crateSeq}`;
  const mesh = createCrateMesh();
  const p = board.tileToWorld(tile);
  mesh.group.position.set(p.x, TILE_TOP_Y, p.z);
  stage.scene.add(mesh.group);
  picker.registerCrate(id, mesh.group);
  const entity: CrateEntity = { id, tile, mesh };
  crates.push(entity);
  return entity;
}

function despawnCrate(crate: CrateEntity): void {
  picker.unregisterCrate(crate.id);
  const i = crates.indexOf(crate);
  if (i >= 0) crates.splice(i, 1);
  crate.mesh.dispose();
}

function spawnMine(unit: Unit, item: Item): MineEntity {
  const mineId = `mine-${performance.now().toFixed(0)}-${Math.random().toString(36).slice(2, 7)}`;
  const mesh = createPlacedMineMesh(item.color);
  const p = board.tileToWorld(unit.tile);
  mesh.group.position.set(p.x, TILE_TOP_Y + 0.04, p.z);
  stage.scene.add(mesh.group);
  const entity: MineEntity = {
    id: mineId,
    tile: { ...unit.tile },
    damage: item.active?.amount ?? 1,
    placerTeam: unit.team,
    placerId: unit.id,
    mesh,
  };
  mines.push(entity);
  return entity;
}

function despawnMine(mine: MineEntity): void {
  const i = mines.indexOf(mine);
  if (i >= 0) mines.splice(i, 1);
  mine.mesh.dispose();
}

// ----- Item ↔ Stat modifier bridge -----------------------------------------
//
// Items influence a carrier's Stats through standard `addModifier`/
// `removeModifier` calls keyed by `item:<id>`. Centralised here so any
// add/remove path (auto-pickup, devtools giveItem, consume-on-use) uses
// the same source string and we never end up with orphan modifiers.

function itemModifierSource(item: Item): string {
  return `item:${item.id}`;
}

function applyItemPassive(unit: Unit, item: Item): void {
  if (!item.passive) return;
  const mod = {
    source: itemModifierSource(item),
    delta: item.passive.delta,
    label: item.name,
  };
  switch (item.passive.stat) {
    case 'damage':      unit.damage.addModifier(mod); break;
    case 'maxHp':       unit.maxHp.addModifier(mod); break;
    case 'attackRange': unit.attackRange.addModifier(mod); break;
  }
}

function removeItemPassive(unit: Unit, item: Item): void {
  if (!item.passive) return;
  const src = itemModifierSource(item);
  switch (item.passive.stat) {
    case 'damage':      unit.damage.removeModifier(src); break;
    case 'maxHp':       unit.maxHp.removeModifier(src); break;
    case 'attackRange': unit.attackRange.removeModifier(src); break;
  }
}

// ----- Unit model ----------------------------------------------------------

interface Unit {
  id: string;
  mech: MechAsset;
  tile: HexCoord;
  team: 1 | 2;
  chassis: ChassisType;
  destroyed: boolean;
  /** Alive but unable to move OR shoot. Counts as "out" for win condition. */
  immobilised: boolean;
  facingDeg: number;

  // Attributes (Stats — modifiable via devtools)
  maxAp: Stat;
  maxHp: Stat;
  damage: Stat;
  attackRange: Stat;

  // Running state (plain numbers — refilled on turn start / decremented by play)
  ap: number;
  hp: number;

  /** 6-slot grid: 2 hands + 4 backpack. See ./items/inventory.ts. */
  inventory: Inventory;
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
    immobilised: false,
    facingDeg: spec.facingDeg,
    maxAp,
    maxHp,
    damage,
    attackRange,
    ap: maxAp.effective,
    hp: maxHp.effective,
    inventory: createEmptyInventory(),
  };
  units.push(unit);

  stage.addTicker((dt) => (mech as PrimitiveMech).tick(dt));
  return unit;
}

/**
 * Initial crate spawn positions. Hexes chosen to be empty (no
 * buildings/walls/mech spawns) and spread across the map so both teams
 * have a reason to detour to grab supplies.
 */
const INITIAL_CRATE_TILES: HexCoord[] = [
  { q:  0, r: -1 },
  { q:  0, r:  1 },
  { q: -3, r:  1 },
  { q:  3, r: -1 },
  { q: -3, r:  3 },
  { q:  3, r: -3 },
];

function spawnInitialCrates(): void {
  for (const tile of INITIAL_CRATE_TILES) {
    if (!map.hasTile(tile)) continue;
    if (blockingTerrainAt(tile)) continue;
    spawnCrate(tile);
  }
}

(async () => {
  await placeMech({ id: 'r1', chassis: 'light',  team: 1, weaponRight: 'beam',                            tile: SPAWN.r1, facingDeg: 270 });
  await placeMech({ id: 'r2', chassis: 'heavy',  team: 1, weaponRight: 'cannon', weaponLeft: 'missiles',  tile: SPAWN.r2, facingDeg: 270 });
  await placeMech({ id: 'b1', chassis: 'medium', team: 2, weaponRight: 'cannon',                          tile: SPAWN.b1, facingDeg: 90 });
  await placeMech({ id: 'b2', chassis: 'medium', team: 2, weaponRight: 'missiles', weaponLeft: 'beam',    tile: SPAWN.b2, facingDeg: 90 });

  spawnInitialCrates();

  renderTurnInfo();
  renderDashboard();
  setStatus("Red team's turn. Walk to a supply crate and click it to open.");
})();

// ----- Turn state ----------------------------------------------------------

let currentTeam: 1 | 2 = 1;
let turnNumber = 1;

/** Who's at the controls for each team. */
type TeamController = 'human' | 'ai';
const teamControllers: Record<1 | 2, TeamController> = { 1: 'human', 2: 'ai' };

/** True while the AI is processing its turn. Locks player input. */
let aiActive = false;

function endTurn(): void {
  if (mode === 'animating') return;
  if (gameOver) return;
  if (aiActive) return; // AI will end its own turn
  doEndTurn();
}

/** Internal — the actual turn-flip logic, callable by both UI + AI. */
function doEndTurn(): void {
  if (gameOver) return;
  // Switch teams; turnNumber increments only when blue → red wraps.
  currentTeam = currentTeam === 1 ? 2 : 1;
  if (currentTeam === 1) turnNumber += 1;

  // Refill AP for the new active team (immobilised mechs still refill, but
  // they can't spend it — kept for symmetry if they become un-immobilised).
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
  renderDashboard();
  setStatus(`${teamName(currentTeam)} team's turn. Click a mech to play.`);

  // Defensive: if a state change before this turn-end somehow missed the
  // win-check (e.g. an immobilise via devtools), catch it here.
  checkWinCondition();
  if (gameOver) return;

  // Hand off to the AI if the new active team is computer-controlled.
  if (teamControllers[currentTeam] === 'ai') {
    void runAiTurn();
  }
}
endTurnBtn.addEventListener('click', endTurn);

function teamName(team: 1 | 2): string {
  return team === 1 ? 'Red' : 'Blue';
}

function renderTurnInfo(): void {
  const color = currentTeam === 1 ? '#ff7a7a' : '#7aa8ff';
  const tag = teamControllers[currentTeam] === 'ai' ? ' <span style="color:#ffce4d;font-size:11px">[AI]</span>' : '';
  turnInfoEl.innerHTML = `Turn ${turnNumber} — <span style="color:${color};font-weight:600">${teamName(currentTeam)} team</span>${tag}`;
}

// ----- Win condition -------------------------------------------------------

let gameOver: GameOutcome & { ended: true } | null = null;

/**
 * Visually mark `u` as immobilised. Reversible via `unmarkImmobilised`.
 * Tilts the chassis on its Z axis to suggest a busted leg.
 */
function markImmobilised(u: Unit): void {
  u.mech.object.rotation.z = 0.18;
  u.mech.playAnimation('idle');
}
function unmarkImmobilised(u: Unit): void {
  u.mech.object.rotation.z = 0;
}

function immobiliseUnit(u: Unit): void {
  if (u.destroyed || u.immobilised) return;
  u.immobilised = true;
  markImmobilised(u);
  // If currently selected, repaint to clear movement/attack highlights.
  if (selectedId === u.id) {
    recomputeReachable(u);
    refreshTileVisuals(null);
  }
  renderDashboard();
  checkWinCondition();
}

function releaseUnit(u: Unit): void {
  if (u.destroyed || !u.immobilised) return;
  u.immobilised = false;
  unmarkImmobilised(u);
  if (selectedId === u.id) {
    recomputeReachable(u);
    refreshTileVisuals(null);
  }
  renderDashboard();
}

/**
 * Re-evaluate the win condition. If the game has just ended, lock all
 * input by setting `gameOver` and render the victory banner.
 */
function checkWinCondition(): void {
  if (gameOver) return; // already over — don't flip-flop on later events
  const outcome = evaluateOutcome(units);
  if (!outcome.ended) return;

  gameOver = outcome;
  endTurnBtn.disabled = true;
  deselect();
  board.clearAllStates();
  hideItemCard();
  renderGameOver();
  renderDashboard();

  const text =
    outcome.winner === 'draw'
      ? `Mutual destruction. Draw on turn ${turnNumber}.`
      : `${teamName(outcome.winner)} team wins on turn ${turnNumber}!`;
  setStatus(text);
}

function renderGameOver(): void {
  if (!gameOver) {
    gameOverEl.hidden = true;
    gameOverEl.textContent = '';
    return;
  }
  const w = gameOver.winner;
  if (w === 'draw') {
    gameOverEl.textContent = 'DRAW — mutual destruction';
    gameOverEl.style.color = '#e6eaef';
  } else {
    gameOverEl.textContent = `${teamName(w)} team wins`;
    gameOverEl.style.color = w === 1 ? '#ff7a7a' : '#7aa8ff';
  }
  gameOverEl.hidden = false;
}

// ----- Interaction state machine -------------------------------------------

type InteractionMode = 'idle' | 'selected' | 'animating';

let selectedId: string | null = null;
let mode: InteractionMode = 'idle';

/** Map "q_r" → AP cost to reach, set when a unit is selected. */
let reachableForSelected: Map<string, number> = new Map();

picker.setEvents({
  onTileHover(tile) {
    if (mode === 'animating' || gameOver || aiActive) return;
    refreshTileVisuals(tile);
  },

  onUnitClick(unitId) {
    if (mode === 'animating' || gameOver || aiActive) return;

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

    void fireAtUnit(shooter, target);
  },

  onTerrainClick(terrainId) {
    if (mode === 'animating' || gameOver || aiActive) return;
    const terrain = terrainPieces.find((t) => t.id === terrainId);
    if (!terrain || terrain.destroyed) return;

    const shooter = selectedId ? units.find((u) => u.id === selectedId) : null;
    if (!shooter || shooter.destroyed) {
      setStatus(`${describeTerrain(terrain)}. Select one of your mechs first.`);
      return;
    }
    void fireAtTerrain(shooter, terrain);
  },

  onCrateClick(crateId) {
    if (mode === 'animating' || gameOver || aiActive) return;
    const crate = crates.find((c) => c.id === crateId);
    if (!crate) return;

    const actor = selectedId ? units.find((u) => u.id === selectedId) : null;
    // No selection OR selection is on a different hex → treat the crate
    // click as a movement command toward its tile (if reachable).
    if (!actor || actor.destroyed) {
      setStatus(`Supply crate at (${crate.tile.q},${crate.tile.r}). Select a mech to interact.`);
      return;
    }
    if (!hexEquals(actor.tile, crate.tile)) {
      // Move toward the crate hex if reachable, else just announce it.
      if (reachableForSelected.has(hexKey(crate.tile))) {
        void walkUnitTo(actor, crate.tile);
      } else {
        setStatus(`Supply crate at (${crate.tile.q},${crate.tile.r}) — out of move range.`);
      }
      return;
    }
    openCrate(actor, crate);
  },

  onTileClick(tile) {
    if (mode === 'animating' || gameOver || aiActive) return;

    const shooter = selectedId ? units.find((u) => u.id === selectedId) : null;
    if (!shooter || shooter.destroyed) {
      deselect();
      return;
    }

    if (hexEquals(tile, shooter.tile)) {
      // Click your own hex: if there's a crate under you, open it.
      // Otherwise the click is a "deselect" (current default).
      const crate = crateAt(tile);
      if (crate) {
        openCrate(shooter, crate);
        return;
      }
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
  renderDashboard();
  setStatus(describeSelection(unit));
}

function describeSelection(unit: Unit): string {
  const head =
    `${describeUnit(unit)} — ` +
    `AP ${unit.ap}/${unit.maxAp.effective}, ` +
    `HP ${unit.hp}/${unit.maxHp.effective}, ` +
    `range ${unit.attackRange.effective}, dmg ${unit.damage.effective}. `;
  if (unit.immobilised) return head + `IMMOBILISED — cannot act this game.`;

  const crate = crateAt(unit.tile);
  if (crate && unit.ap >= CRATE_OPEN_AP_COST) {
    return head + `Click your tile (or the crate) to open it for 1 AP.`;
  }
  return head + (unit.ap > 0
    ? `Green = move, red = fire.`
    : `Out of AP — end the turn.`);
}

function deselect(): void {
  selectedId = null;
  mode = 'idle';
  reachableForSelected = new Map();
  board.clearAllStates();
  renderDashboard();
}

function recomputeReachable(unit: Unit): void {
  if (unit.immobilised) {
    // Start hex only — no other reachable tiles.
    reachableForSelected = new Map([[hexKey(unit.tile), 0]]);
    return;
  }
  const pf = makePathfinder(unit);
  reachableForSelected = pf.reachable(unit.tile, unit.ap);
}

function refreshTileVisuals(hover: HexCoord | null): void {
  board.clearAllStates();
  if (gameOver) return;

  const sel = selectedId ? units.find((u) => u.id === selectedId) : null;

  // Green: reachable hexes (skipped entirely for immobilised mechs).
  if (sel && !sel.immobilised) {
    for (const k of reachableForSelected.keys()) {
      const [qs, rs] = k.split('_');
      const h: HexCoord = { q: parseInt(qs, 10), r: parseInt(rs, 10) };

      if (hexEquals(sel.tile, h)) continue;
      if (unitAt(h)) continue;
      if (blockingTerrainAt(h)) continue;
      board.setTileState(h, 'move');
    }
  }

  // Red: enemies + destructible terrain in attack range (only if the
  // selected unit has AP AND isn't immobilised).
  if (sel && !sel.immobilised && sel.ap >= AP_COST.shoot) {
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
  if (gameOver) return;
  if (unit.immobilised) {
    setStatus(`${describeUnit(unit)} is immobilised and cannot move.`);
    return;
  }
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
    renderDashboard();

    // Step-on effects: only mines auto-trigger. Supply crates require
    // an explicit "open" action (1 AP) so the player can choose when
    // to spend the AP and whether to risk a slot-full waste.
    const killedByMine = triggerMineFor(unit);
    if (killedByMine) break;
  }

  unit.mech.playAnimation('idle');

  if (unit.destroyed) {
    mode = 'idle';
    deselect();
    return;
  }

  mode = 'selected';
  recomputeReachable(unit);
  refreshTileVisuals(null);
  renderDashboard();
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

// ----- Crate / mine interactions -------------------------------------------

const CRATE_OPEN_AP_COST = 1;

/** Free-slot summary for a unit's inventory. */
function inventorySpace(unit: Unit): { handFree: boolean; backpackFree: boolean } {
  return {
    handFree: unit.inventory.hands.some((s) => s === null),
    backpackFree: unit.inventory.backpack.some((s) => s === null),
  };
}

/**
 * Attempts to open `crate` with `unit`. Validates that the unit is on
 * the same hex, has AP, and has at least one inventory slot free. On
 * success: rolls a random item (constrained to free slot kinds),
 * routes it to the right slot, applies any passive, despawns the
 * crate, and shows the item-reveal card on the side.
 */
function openCrate(unit: Unit, crate: CrateEntity): void {
  if (gameOver || mode === 'animating' || aiActive) return;
  if (unit.destroyed) return;
  if (unit.immobilised) {
    setStatus(`${describeUnit(unit)} is immobilised and cannot interact.`);
    return;
  }
  if (unit.team !== currentTeam || teamControllers[currentTeam] !== 'human') {
    setStatus(`It's not ${teamName(unit.team)}'s turn.`);
    return;
  }
  if (!hexEquals(unit.tile, crate.tile)) {
    setStatus(`${describeUnit(unit)} must stand on the crate to open it.`);
    return;
  }
  if (unit.ap < CRATE_OPEN_AP_COST) {
    setStatus(`${describeUnit(unit)} needs ${CRATE_OPEN_AP_COST} AP to open the crate.`);
    return;
  }

  const space = inventorySpace(unit);
  if (!space.handFree && !space.backpackFree) {
    setStatus(`${describeUnit(unit)}'s inventory is full — drop something or use a consumable first.`);
    return;
  }

  // Commit: spend AP, roll item, route.
  unit.ap -= CRATE_OPEN_AP_COST;
  const item = rollItem(space);
  if (!item) {
    // Shouldn't be reachable given the space check above, but be safe.
    setStatus(`Crate was empty.`);
    renderDashboard();
    return;
  }

  const addr = addItem(unit.inventory, item);
  if (!addr) {
    // Defensive: addItem failed despite the space check (e.g., item kind
    // we don't have room for — rollItem already filters but stay safe).
    setStatus(`${describeUnit(unit)} couldn't fit ${item.name}.`);
    renderDashboard();
    return;
  }
  applyItemPassive(unit, item);

  // Small FX where the crate stood.
  const cw = new THREE.Vector3();
  crate.mesh.group.getWorldPosition(cw);
  fx.impact({ position: cw });

  despawnCrate(crate);
  showItemCard(item, addr);

  setStatus(
    `${describeUnit(unit)} opened a crate — ${item.name} → ${addr.slotKind} slot ${addr.index + 1}.`,
  );
  refreshAfterAction();
  renderDashboard();
}

/**
 * Triggers any enemy mine on `unit.tile`. Returns true if the unit was
 * destroyed by the blast (so the walk loop can short-circuit).
 */
function triggerMineFor(unit: Unit): boolean {
  const mine = mineAt(unit.tile);
  if (!mine) return false;
  if (mine.placerTeam === unit.team) return false; // friendly mine — inert

  const dmg = mine.damage;
  const p = board.tileToWorld(unit.tile);
  const blast = new THREE.Vector3(p.x, TILE_TOP_Y + 0.4, p.z);
  fx.impact({ position: blast });
  fx.explosion({ position: blast, scale: 1.25 });

  unit.hp = Math.max(0, unit.hp - dmg);
  unit.mech.setDamageLevel(
    Math.min(1, (unit.maxHp.effective - unit.hp) / unit.maxHp.effective),
  );

  despawnMine(mine);

  if (unit.hp <= 0) {
    unit.destroyed = true;
    unit.mech.playAnimation('destroyed');
    setStatus(`${describeUnit(unit)} stepped on a mine for ${dmg} damage — destroyed!`);
    sinkUnitWreckage(unit);
    renderDashboard();
    checkWinCondition();
    return true;
  }

  unit.mech.playAnimation('hit');
  setStatus(
    `${describeUnit(unit)} triggered a mine for ${dmg} damage. ` +
    `(HP ${unit.hp}/${unit.maxHp.effective})`,
  );
  renderDashboard();
  return false;
}

// ----- Active items (consumables) ------------------------------------------

/** Public entry-point — dispatch by `item.active.kind`. */
function useItemFromSlot(unit: Unit, addr: SlotAddress): void {
  const item = addr.slotKind === 'hand'
    ? unit.inventory.hands[addr.index]
    : unit.inventory.backpack[addr.index];
  if (!item) return;

  if (gameOver || mode === 'animating' || aiActive) return;
  if (unit.destroyed) return;
  if (unit.team !== currentTeam || teamControllers[currentTeam] !== 'human') {
    setStatus(`Not ${teamName(unit.team)}'s turn.`);
    return;
  }
  if (unit.immobilised) {
    setStatus(`${describeUnit(unit)} is immobilised and cannot use items.`);
    return;
  }
  if (!item.active) {
    setStatus(`${item.name} is a passive item — already in effect.`);
    return;
  }
  const cost = item.active.apCost;
  if (unit.ap < cost) {
    setStatus(`${describeUnit(unit)} needs ${cost} AP to use ${item.name} (has ${unit.ap}).`);
    return;
  }

  switch (item.active.kind) {
    case 'heal':      doHeal(unit, item, addr); return;
    case 'placeMine': doPlaceMine(unit, item, addr); return;
  }
}

function consumeItem(unit: Unit, item: Item, addr: SlotAddress): void {
  removeItemPassive(unit, item); // safe no-op for active-only items
  removeItem(unit.inventory, addr);
}

function doHeal(unit: Unit, item: Item, addr: SlotAddress): void {
  const heal = item.active!.amount;
  const cap = unit.maxHp.effective;
  const before = unit.hp;
  unit.hp = Math.min(cap, unit.hp + heal);
  unit.ap -= item.active!.apCost;
  consumeItem(unit, item, addr);
  unit.mech.setDamageLevel(Math.min(1, (cap - unit.hp) / cap));

  // Small green plume on the mech for visual feedback.
  const tWorld = new THREE.Vector3();
  const torso = unit.mech.getAttachPoint('torso');
  if (torso) torso.getWorldPosition(tWorld);
  else       unit.mech.object.getWorldPosition(tWorld);
  fx.impact({ position: tWorld });

  const gained = unit.hp - before;
  setStatus(
    `${describeUnit(unit)} used ${item.name} (+${gained} HP). ` +
    `(HP ${unit.hp}/${cap})`,
  );
  refreshAfterAction();
  renderDashboard();
}

function doPlaceMine(unit: Unit, item: Item, addr: SlotAddress): void {
  if (mineAt(unit.tile)) {
    setStatus(`There's already a mine here.`);
    return;
  }
  unit.ap -= item.active!.apCost;
  spawnMine(unit, item);
  consumeItem(unit, item, addr);
  setStatus(
    `${describeUnit(unit)} dropped a ${item.name}. Enemies entering this hex take ${item.active!.amount} damage.`,
  );
  refreshAfterAction();
  renderDashboard();
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

/**
 * High-ground bonus: shooter is on elevated terrain AND target is lower.
 * Returns the integer damage bonus (0 or +1 for now).
 */
function highGroundBonus(shooter: Unit, target: Unit): number {
  return elevationAt(shooter.tile) > elevationAt(target.tile) ? 1 : 0;
}

async function fireAtUnit(shooter: Unit, target: Unit): Promise<void> {
  if (gameOver) return;
  if (shooter.immobilised) {
    setStatus(`${describeUnit(shooter)} is immobilised and cannot fire.`);
    return;
  }
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
  const hg = highGroundBonus(shooter, target);
  const damage = (shooter.damage.effective + hg) * mult;
  shooter.ap -= AP_COST.shoot;
  renderDashboard();

  await faceAndFire(shooter, target.mech.object.position);

  const torsoTgt = target.mech.getAttachPoint('torso');
  const targetWorld = new THREE.Vector3();
  if (torsoTgt) {
    torsoTgt.getWorldPosition(targetWorld);
    fx.impact({ position: targetWorld });
  }
  target.mech.playAnimation('hit');

  target.hp = Math.max(0, target.hp - damage);
  target.mech.setDamageLevel(
    Math.min(1, (target.maxHp.effective - target.hp) / target.maxHp.effective),
  );

  const dmgStr = formatDamage(damage);
  const modBits: string[] = [];
  if (hg > 0) modBits.push('from high ground (+1)');
  if (buildingsCrossed > 0) {
    modBits.push(`through ${buildingsCrossed} building${buildingsCrossed > 1 ? 's' : ''} (half damage)`);
  }
  const modStr = modBits.length > 0 ? ` ${modBits.join(', ')}` : '';

  if (target.hp <= 0) {
    target.destroyed = true;
    if (torsoTgt) fx.explosion({ position: targetWorld, scale: 1.4 });
    target.mech.playAnimation('destroyed');
    setStatus(`${describeUnit(target)} destroyed by ${describeUnit(shooter)}${modStr}.`);
    sinkUnitWreckage(target);
  } else {
    setStatus(
      `${describeUnit(shooter)} hits ${describeUnit(target)} for ${dmgStr}${modStr}. ` +
      `(HP ${target.hp}/${target.maxHp.effective})`,
    );
  }

  refreshAfterAction();
  renderDashboard();
  checkWinCondition();
}

async function fireAtTerrain(shooter: Unit, terrain: TerrainPiece): Promise<void> {
  if (gameOver) return;
  if (shooter.immobilised) {
    setStatus(`${describeUnit(shooter)} is immobilised and cannot fire.`);
    return;
  }
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
  // No high-ground bonus on terrain either — that's a vs-unit perk.
  const damage = shooter.damage.effective;
  shooter.ap -= AP_COST.shoot;
  renderDashboard();

  const tBox = new THREE.Box3().setFromObject(terrain.object);
  const impactWorld = new THREE.Vector3();
  tBox.getCenter(impactWorld);

  await faceAndFire(shooter, impactWorld);

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

/**
 * Animate the shooter facing + firing. Resolves ~120ms after the trigger,
 * which is the right moment to apply damage and spawn the impact FX.
 * Always resolves — even if the mech has no rightHand attach point, so
 * callers can safely `await` it without risk of a dangling promise.
 */
function faceAndFire(shooter: Unit, targetWorldPos: THREE.Vector3): Promise<void> {
  const sp = shooter.mech.object.position;
  const dx = targetWorldPos.x - sp.x;
  const dz = targetWorldPos.z - sp.z;
  const yawDeg = THREE.MathUtils.radToDeg(Math.atan2(dz, dx));
  shooter.facingDeg = yawDeg;
  shooter.mech.setFacing(yawDeg);
  shooter.mech.playAnimation('fire');

  const barrel = shooter.mech.getAttachPoint('rightHand');
  if (barrel) {
    const barrelWorld = new THREE.Vector3();
    barrel.getWorldPosition(barrelWorld);
    const dir = targetWorldPos.clone().sub(barrelWorld).normalize();
    fx.muzzleFlash({ position: barrelWorld, direction: dir });
    fx.beam({ from: barrelWorld, to: targetWorldPos, durationSec: 0.18, color: '#fff2a8' });
  }

  return new Promise((resolve) => setTimeout(resolve, 120));
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
        renderDashboard();
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

// ----- Player dashboard ----------------------------------------------------
//
// A bottom strip of up to DASHBOARD_SLOTS cards, one per controlled mech.
// Each card shows the mech's identity, HP/AP bars, and equipped weapons
// ("inventory" for now — extend this struct as more loadout items appear).
// Click a card to select that mech (equivalent to clicking it on the board).
// ---------------------------------------------------------------------------

/** Which team's mechs appear in the dashboard. */
let dashboardTeam: 1 | 2 = 1;

function renderDashboard(): void {
  // Show controlled mechs (defaulting to team 1 / Red). Capped to DASHBOARD_SLOTS.
  const slots = units
    .filter((u) => u.team === dashboardTeam)
    .slice(0, DASHBOARD_SLOTS);

  dashboardEl.innerHTML = '';

  for (const u of slots) {
    const slot = buildDashSlot(u);
    dashboardEl.appendChild(slot);
  }

  // Pad to DASHBOARD_SLOTS so layout stays stable as mechs die / spawn.
  for (let i = slots.length; i < DASHBOARD_SLOTS; i++) {
    const empty = document.createElement('div');
    empty.className = 'dash-empty';
    empty.textContent = '— empty slot —';
    dashboardEl.appendChild(empty);
  }
}

function buildDashSlot(u: Unit): HTMLElement {
  const slot = document.createElement('div');
  slot.className = 'dash-slot';
  slot.dataset.unitId = u.id;

  if (u.id === selectedId) slot.classList.add('selected');
  if (u.destroyed) slot.classList.add('destroyed');
  else if (u.immobilised) slot.classList.add('immobilised');

  const playerTurn = teamControllers[currentTeam] === 'human' && currentTeam === u.team;
  const cardClickable = !u.destroyed && !gameOver && !aiActive && playerTurn;
  if (!cardClickable) slot.classList.add('locked');

  const maxHp = u.maxHp.effective;
  const maxAp = u.maxAp.effective;
  const hpPct = maxHp > 0 ? Math.max(0, (u.hp / maxHp) * 100) : 0;
  const apPct = maxAp > 0 ? Math.max(0, (u.ap / maxAp) * 100) : 0;

  const onCrate = !u.destroyed && !u.immobilised && crateAt(u.tile);
  const statusTag = u.destroyed
    ? '<span class="tag destroyed">DESTROYED</span>'
    : u.immobilised
      ? '<span class="tag immobilised">IMMOBILE</span>'
      : onCrate
        ? '<span class="tag crate">ON CRATE</span>'
        : `<span class="tag">${u.chassis.toUpperCase()}</span>`;

  // Header + bars (click-to-select on header area).
  const header = document.createElement('div');
  header.className = 'dash-head';
  header.innerHTML = `
    <div class="dash-name">
      <span>${teamName(u.team)} ${u.id.toUpperCase()}</span>
      ${statusTag}
    </div>
    <div class="dash-bar dash-hp">
      <label>HP</label>
      <div class="bar"><div class="fill" style="width:${hpPct}%"></div></div>
      <span>${formatDamage(u.hp)}/${maxHp}</span>
    </div>
    <div class="dash-bar dash-ap">
      <label>AP</label>
      <div class="bar"><div class="fill" style="width:${apPct}%"></div></div>
      <span>${u.ap}/${maxAp}</span>
    </div>
  `;
  if (cardClickable) {
    header.addEventListener('click', () => {
      if (mode === 'animating' || gameOver || aiActive) return;
      selectUnit(u);
    });
  }
  slot.appendChild(header);

  slot.appendChild(buildInventoryGrid(u, cardClickable));
  return slot;
}

function buildInventoryGrid(u: Unit, parentClickable: boolean): HTMLElement {
  const grid = document.createElement('div');
  grid.className = 'inv-grid';

  // Two hand cells then four backpack cells; CSS handles the visual split.
  for (let i = 0; i < u.inventory.hands.length; i++) {
    grid.appendChild(buildInventoryCell(u, 'hand', i, parentClickable));
  }
  for (let i = 0; i < u.inventory.backpack.length; i++) {
    grid.appendChild(buildInventoryCell(u, 'backpack', i, parentClickable));
  }
  return grid;
}

function buildInventoryCell(
  u: Unit,
  slotKind: 'hand' | 'backpack',
  index: number,
  parentClickable: boolean,
): HTMLElement {
  const cell = document.createElement('div');
  cell.className = `inv-cell ${slotKind}`;
  const item = slotKind === 'hand'
    ? u.inventory.hands[index]
    : u.inventory.backpack[index];

  if (!item) {
    cell.classList.add('empty');
    cell.title = `${slotKind} slot ${index + 1} — empty`;
    return cell;
  }

  cell.style.borderColor = item.color;
  cell.style.color = item.color;
  cell.classList.add(`kind-${item.kind}`);
  cell.textContent = item.icon;

  const tooltipLines = [item.name, item.description];
  if (item.active) {
    const cost = item.active.apCost;
    tooltipLines.push(
      parentClickable && u.ap >= cost
        ? `Click to use (${cost} AP).`
        : `Needs ${cost} AP to use.`,
    );
  }
  cell.title = tooltipLines.join('\n');

  if (item.active && parentClickable) {
    cell.classList.add('usable');
    cell.addEventListener('click', (e) => {
      e.stopPropagation();
      useItemFromSlot(u, { slotKind, index });
    });
  }

  return cell;
}

// ----- AI controller -------------------------------------------------------
//
// Dead-simple heuristic that's still readable: for each active mech, find
// the nearest enemy. If in range and we have AP, shoot. Otherwise step
// toward them along the cheapest reachable hex that shortens hex-distance.
// Repeat until out of AP or no useful move exists, then end the turn.
//
// Animations are awaited end-to-end so each action plays out fully before
// the next one starts (no overlapping muzzle flashes / chaotic movement).
// ---------------------------------------------------------------------------

const AI_THINK_MS = 450;     // pause between AI actions
const AI_PRE_TURN_MS = 350;  // initial "thinking" pause when AI takes over

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function runAiTurn(): Promise<void> {
  if (aiActive || gameOver) return;
  aiActive = true;
  endTurnBtn.disabled = true;
  setStatus(`${teamName(currentTeam)} AI is thinking…`);
  renderDashboard();

  try {
    await delay(AI_PRE_TURN_MS);

    // Snapshot the team's mechs at start-of-turn; new ones can't spawn mid-turn.
    const aiUnits = units.filter(
      (u) => u.team === currentTeam && !u.destroyed,
    );

    for (const mech of aiUnits) {
      if (gameOver) break;
      if (mech.destroyed || mech.immobilised) continue;
      await aiPlayMech(mech);
    }
  } finally {
    aiActive = false;
    endTurnBtn.disabled = gameOver !== null;
    renderDashboard();
  }

  if (gameOver) return;
  await delay(AI_THINK_MS);
  doEndTurn();
}

async function aiPlayMech(mech: Unit): Promise<void> {
  // Up to a generous step cap to guarantee termination even with bugs.
  for (let safety = 0; safety < 20; safety++) {
    if (gameOver) return;
    if (mech.destroyed || mech.immobilised) return;
    if (mech.ap <= 0) return;

    const target = nearestEnemy(mech);
    if (!target) return;

    const dist = hexDistance(mech.tile, target.tile);
    const range = mech.attackRange.effective;

    // 1) In range & can afford a shot → fire.
    if (dist <= range && mech.ap >= AP_COST.shoot) {
      await delay(AI_THINK_MS);
      if (gameOver) return;
      await fireAtUnit(mech, target);
      continue;
    }

    // 2) Try to move toward the target.
    const moved = await aiTryMoveToward(mech, target);
    if (!moved) return;
  }
}

function nearestEnemy(mech: Unit): Unit | null {
  let best: Unit | null = null;
  let bestDist = Infinity;
  for (const u of units) {
    if (u.team === mech.team) continue;
    if (u.destroyed || u.immobilised) continue;
    const d = hexDistance(mech.tile, u.tile);
    if (d < bestDist) {
      bestDist = d;
      best = u;
    }
  }
  return best;
}

/**
 * Walks `mech` one step closer to `target` if any reachable hex strictly
 * reduces the hex-distance to the target. Returns true if a move happened.
 */
async function aiTryMoveToward(mech: Unit, target: Unit): Promise<boolean> {
  const pf = makePathfinder(mech);
  const reach = pf.reachable(mech.tile, mech.ap);

  let bestHex: HexCoord | null = null;
  let bestDist = hexDistance(mech.tile, target.tile);
  let bestCost = Infinity;

  for (const [k, cost] of reach) {
    if (cost === 0) continue; // start hex
    const [qs, rs] = k.split('_');
    const h: HexCoord = { q: parseInt(qs, 10), r: parseInt(rs, 10) };
    if (unitAt(h)) continue;
    if (blockingTerrainAt(h)) continue;

    const d = hexDistance(h, target.tile);
    // Prefer "closer to target" first, "cheaper" as tie-breaker. Don't move
    // somewhere that doesn't get us any closer — that's just wasting AP.
    if (d < bestDist || (d === bestDist && cost < bestCost)) {
      bestDist = d;
      bestHex = h;
      bestCost = cost;
    }
  }

  if (!bestHex) return false;

  await delay(AI_THINK_MS);
  if (gameOver) return false;
  await walkUnitTo(mech, bestHex);
  return true;
}

// ----- Devtools console hooks ----------------------------------------------

interface StatSnapshot {
  base: number;
  effective: number;
  mods: ReadonlyArray<{ source: string; delta: number; label?: string }>;
}

/** A simplified item snapshot for the devtools — no THREE objects. */
interface ItemSnapshot {
  id: string;
  kind: string;
  name: string;
  slotKind: 'hand' | 'backpack';
  passive?: { stat: string; delta: number };
  active?: { kind: string; amount: number; apCost: number };
}

interface InventorySnapshot {
  hands: (ItemSnapshot | null)[];
  backpack: (ItemSnapshot | null)[];
}

interface TackticusApi {
  units(): Array<{
    id: string; chassis: ChassisType; team: 1 | 2; tile: HexCoord;
    destroyed: boolean; immobilised: boolean;
    ap: number; hp: number;
    maxAp: StatSnapshot; maxHp: StatSnapshot; damage: StatSnapshot; attackRange: StatSnapshot;
    inventory: InventorySnapshot;
  }>;
  terrain(): Array<{
    id: string; kind: string; tile: HexCoord; destroyed: boolean;
    hp?: number; maxHp?: number; blocksMovement: boolean; walkable: boolean; topY: number;
  }>;
  crates(): Array<{ id: string; tile: HexCoord }>;
  mines(): Array<{ tile: HexCoord; damage: number; placerTeam: 1 | 2 }>;
  /**
   * Force-open a crate for the given unit (the unit must be on the
   * crate's tile and have 1 AP; obeys the same rules as a click).
   * Returns true on success.
   */
  openCrate(unitId: string, crateId: string): boolean;
  turn(): { number: number; team: 1 | 2 };
  endTurn(): void;
  /** Mark a unit as immobilised (alive but can't act). Triggers win check. */
  immobilise(unitId: string): boolean;
  /** Un-immobilise a unit (devtools only — no in-game mechanic yet). */
  release(unitId: string): boolean;
  isGameOver(): boolean;
  winner(): 1 | 2 | 'draw' | null;
  /** Get/set who's at the controls for a team. Default: 1=human, 2=ai. */
  controller(team: 1 | 2): TeamController;
  setController(team: 1 | 2, c: TeamController): void;
  /** Show a different team's mechs in the bottom dashboard. */
  setDashboardTeam(team: 1 | 2): void;
  /** Snap the camera to top-down or iso (also via the T key). */
  setView(view: 'iso' | 'top'): void;
  /**
   * Give an item directly to a unit (bypasses pickup mechanics). Pass any of:
   *   { kind: 'weapon',      damage: 2 }
   *   { kind: 'armor',       hp: 2 }
   *   { kind: 'rangeModule', range: 1 }
   *   { kind: 'repairKit',   heal: 2 }
   *   { kind: 'mine',        damage: 2 }
   * Returns the inventory address used, or null if no space.
   */
  giveItem(unitId: string, spec: GiveItemSpec): SlotAddress | null;
  applyApModifier(unitId: string, source: string, delta: number, label?: string): boolean;
  applyHpModifier(unitId: string, source: string, delta: number, label?: string): boolean;
  applyDamageModifier(unitId: string, source: string, delta: number, label?: string): boolean;
  applyRangeModifier(unitId: string, source: string, delta: number, label?: string): boolean;
  setAp(unitId: string, ap: number): boolean;
  setHp(unitId: string, hp: number): boolean;
  damageTerrain(terrainId: string, amount: number): boolean;
}

type GiveItemSpec =
  | { kind: 'weapon';      damage: number; name?: string }
  | { kind: 'armor';       hp: number;     name?: string }
  | { kind: 'rangeModule'; range: number;  name?: string }
  | { kind: 'repairKit';   heal: number;   name?: string }
  | { kind: 'mine';        damage: number; name?: string };

function buildItemFromSpec(spec: GiveItemSpec): Item {
  switch (spec.kind) {
    case 'weapon':      return makeWeapon(spec.damage, spec.name);
    case 'armor':       return makeArmor(spec.hp, spec.name);
    case 'rangeModule': return makeRangeModule(spec.range, spec.name);
    case 'repairKit':   return makeRepairKit(spec.heal, spec.name);
    case 'mine':        return makeMine(spec.damage, spec.name);
  }
}

function snapshotItem(item: Item | null): ItemSnapshot | null {
  if (!item) return null;
  return {
    id: item.id,
    kind: item.kind,
    name: item.name,
    slotKind: item.slotKind,
    passive: item.passive ? { stat: item.passive.stat, delta: item.passive.delta } : undefined,
    active: item.active
      ? { kind: item.active.kind, amount: item.active.amount, apCost: item.active.apCost }
      : undefined,
  };
}

function snapshotInventory(inv: Inventory): InventorySnapshot {
  return {
    hands: inv.hands.map(snapshotItem),
    backpack: inv.backpack.map(snapshotItem),
  };
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
      id: u.id, chassis: u.chassis, team: u.team, tile: u.tile,
      destroyed: u.destroyed, immobilised: u.immobilised,
      ap: u.ap, hp: u.hp,
      maxAp: snapshot(u.maxAp),
      maxHp: snapshot(u.maxHp),
      damage: snapshot(u.damage),
      attackRange: snapshot(u.attackRange),
      inventory: snapshotInventory(u.inventory),
    })),
  terrain: () =>
    terrainPieces.map((t) => ({
      id: t.id, kind: t.kind, tile: t.tile, destroyed: t.destroyed,
      hp: t.hp, maxHp: t.maxHp,
      blocksMovement: t.blocksMovement, walkable: t.walkable, topY: t.topY,
    })),
  crates: () =>
    crates.map((c) => ({ id: c.id, tile: { ...c.tile } })),
  mines: () =>
    mines.map((m) => ({ tile: { ...m.tile }, damage: m.damage, placerTeam: m.placerTeam })),
  openCrate(unitId, crateId) {
    const u = units.find((x) => x.id === unitId);
    const c = crates.find((x) => x.id === crateId);
    if (!u || !c) return false;
    const before = crates.length;
    openCrate(u, c);
    return crates.length < before;
  },
  turn: () => ({ number: turnNumber, team: currentTeam }),
  endTurn: () => endTurn(),

  giveItem(unitId, spec) {
    const u = units.find((x) => x.id === unitId);
    if (!u) return null;
    const item = buildItemFromSpec(spec);
    if (!hasSpaceFor(u.inventory, item)) return null;
    const addr = addItem(u.inventory, item);
    if (!addr) return null;
    applyItemPassive(u, item);
    renderDashboard();
    if (selectedId === u.id) {
      recomputeReachable(u);
      refreshTileVisuals(null);
    }
    return addr;
  },

  immobilise(unitId) {
    const u = units.find((x) => x.id === unitId);
    if (!u) return false;
    immobiliseUnit(u);
    return true;
  },
  release(unitId) {
    const u = units.find((x) => x.id === unitId);
    if (!u) return false;
    releaseUnit(u);
    return true;
  },
  isGameOver: () => gameOver !== null,
  winner: () => (gameOver ? gameOver.winner : null),

  controller: (team) => teamControllers[team],
  setController(team, c) {
    teamControllers[team] = c;
    renderTurnInfo();
    renderDashboard();
    // If we just handed control of the *current* team to the AI, kick it off.
    if (team === currentTeam && c === 'ai' && !aiActive && !gameOver) {
      void runAiTurn();
    }
  },
  setDashboardTeam(team) {
    dashboardTeam = team;
    renderDashboard();
  },
  setView(view) {
    isoCam.setView(view);
  },

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
    renderDashboard();
    return true;
  },
  setHp(unitId, hp) {
    const u = units.find((x) => x.id === unitId);
    if (!u) return false;
    u.hp = Math.max(0, hp);
    renderDashboard();
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

// Crate + placed-mine animations (bob / pulse / sway).
stage.addTicker((_dt, total) => {
  for (const c of crates) c.mesh.tick(total);
  for (const m of mines)  m.mesh.tick(total);
});

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

// ----- Item reveal card ----------------------------------------------------

const itemCardEl = document.getElementById('item-card') as HTMLDivElement | null;
let itemCardHideTimer: number | null = null;

/**
 * Slide-in card on the right that shows what was just pulled from a
 * crate, with kind/effect/where-it-went info. Auto-dismisses after a
 * few seconds, but re-opening another crate refreshes the card.
 */
function showItemCard(item: Item, addr: SlotAddress): void {
  if (!itemCardEl) return;

  const effectLines: string[] = [];
  if (item.passive) {
    const sign = item.passive.delta >= 0 ? '+' : '';
    const statLabel = passiveStatLabel(item.passive.stat);
    effectLines.push(`${sign}${item.passive.delta} ${statLabel} while equipped`);
  }
  if (item.active) {
    const verb = item.active.kind === 'heal' ? 'Repair' : 'Deploy mine';
    effectLines.push(`Active: ${verb} (${item.active.apCost} AP)`);
  }

  const slotLabel = addr.slotKind === 'hand'
    ? `Hand slot ${addr.index + 1}`
    : `Backpack slot ${addr.index + 1}`;

  const safeName = escapeHtml(item.name);
  const safeDesc = escapeHtml(item.description);
  const safeIcon = escapeHtml(item.icon);
  const safeKind = item.kind.toUpperCase();

  itemCardEl.innerHTML = `
    <div class="item-card-flash">SUPPLIES</div>
    <div class="item-card-row">
      <div class="item-card-icon" style="border-color:${item.color};color:${item.color};">${safeIcon}</div>
      <div class="item-card-title">
        <div class="item-card-name" style="color:${item.color};">${safeName}</div>
        <div class="item-card-kind">${safeKind} · ${item.slotKind.toUpperCase()}</div>
      </div>
    </div>
    <div class="item-card-desc">${safeDesc}</div>
    ${effectLines.length
      ? `<ul class="item-card-stats">${effectLines.map((l) => `<li>${escapeHtml(l)}</li>`).join('')}</ul>`
      : ''}
    <div class="item-card-stowed">Stowed: ${slotLabel}</div>
  `;
  itemCardEl.classList.add('visible');

  if (itemCardHideTimer !== null) window.clearTimeout(itemCardHideTimer);
  itemCardHideTimer = window.setTimeout(() => {
    itemCardEl.classList.remove('visible');
    itemCardHideTimer = null;
  }, 6000);
}

function hideItemCard(): void {
  if (itemCardHideTimer !== null) window.clearTimeout(itemCardHideTimer);
  itemCardHideTimer = null;
  itemCardEl?.classList.remove('visible');
}

function passiveStatLabel(stat: 'damage' | 'maxHp' | 'attackRange'): string {
  switch (stat) {
    case 'damage':      return 'Damage';
    case 'maxHp':       return 'Max HP';
    case 'attackRange': return 'Attack Range';
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) =>
    ch === '&' ? '&amp;' :
    ch === '<' ? '&lt;' :
    ch === '>' ? '&gt;' :
    ch === '"' ? '&quot;' :
                 '&#39;',
  );
}
