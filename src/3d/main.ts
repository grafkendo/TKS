// ============================================================================
// Tackticus 3D — demo entry point.
//
// TURN-BASED RULES
// ----------------
//  - Teams alternate turns. End your turn with the "End Turn" button.
//  - Every mech refills to MAX AP at the start of its team's turn.
//  - Firing costs 1 AP and does `unit.damage.effective` damage.
//  - If a shot's hex line passes through a destructible building, damage
//    is HALVED per building crossed.
//  - Shooting rubble (1 HP) clears it and opens the path.
//  - HIGH GROUND: when the shooter is on elevated terrain (a platform) AND
//    the target is lower than them, the attack does +1 damage. The bonus
//    is added BEFORE the cover multiplier — high-ground through cover is
//    `(base + 1) * 0.5`.
//
// UNIT ARCHETYPES (see ./enemies/archetypes.ts)
// --------------------------------------------
//  - ELITE   : 3 AP, 3 HP, per-hex movement (1 AP / clear hex, 2 / rubble)
//  - GRUNT   : 1 AP, 1 HP, burst-move 1 hex per action
//  - SCOUT   : 1 AP, 1 HP, burst-move 2 hexes per action
//  - ARMORED : 1 AP, 2 HP, burst-move 1 hex per action, ARMOR THRESHOLD 2
//              (any single shot dealing < 2 damage is DEFLECTED → 0 damage).
//    "Burst" movement = the whole move action costs ONE AP regardless of
//    distance, with a per-action cap = movementRange hexes.
//  - Allied mechs are PASSABLE: they don't block each other's paths but
//    can't share a hex.
//
// ORBITAL DROP POINTS (see ./spawn/SpawnPoint.ts)
// -----------------------------------------------
//  - Red ground-pads scattered across team 2's side.
//  - At the start of EVERY team-2 turn, every clear drop point
//    materializes a new enemy of a random archetype. The only gate
//    is the global alive cap (MAX_TEAM2_ALIVE) and per-tile occupancy.
//
// CRATE TRAPS (see ./items/crateTraps.ts)
// --------------------------------------
//  - ~25% of supply-crate opens trigger a trap INSTEAD of a drop.
//    The AP is still spent. Trap kinds:
//      - EXPLOSION : mega-damage that bypasses armor
//      - STUN      : opener loses their next own-team turn
//      - ENEMY     : a hostile mech drops in adjacent to the opener
//  - All three are revealed via a red-themed reveal card on the right
//    of the screen, mirroring the normal item card.
//
// STUN (see Unit.stunnedTurns)
// ---------------------------
//  - Affected units start their next own-team turn with 0 AP and
//    `stunnedTurns--`. They can be selected to inspect but can't move,
//    fire, open crates, or use items.
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
import { getMechLoader } from './mech/getMechLoader';
import { BasicEffects } from './fx/BasicEffects';
import { Picker } from './Picker';
import { Pathfinder } from './movement/Pathfinder';
import { ATTACK_RANGE_BASE } from './mech/types';
import type { MechAsset, ChassisType, WeaponType } from './mech/types';
import { Stat } from './stats/Stat';
import {
  HexCoord,
  HEX_DIRS,
  hexDistance,
  hexEquals,
  hexFacingDegrees,
  hexFromKey,
  hexKey,
  hexNeighbor,
} from './hex/HexCoord';
import { hexLineBetween } from './hex/HexLine';
import {
  hexesInForwardCone,
  isInForwardArc,
  facingDegToDirIndex,
} from './hex/hexFacing';

import { buildMapFromUrl } from './maps';
import { createTerrainFromSpec } from './terrain/factory';
import { Rubble } from './terrain/Rubble';
import type { TerrainPiece } from './terrain/types';
import { evaluateOutcome, type GameOutcome } from './rules/winCondition';
import {
  apBonusFromKills,
  killsUntilNextMilestone,
  TECH_POINTS_PER_KILL,
  techModifierSource,
} from './rules/techProgress';
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
  makeDemoCharge,
  makeDemoCharge,
  makeTacticalNuke,
} from './items/factory';
import { rollItem } from './items/randomItem';
import { rollCrateTrap, type CrateTrapOutcome } from './items/crateTraps';
import { getCrateLoader } from './items/getCrateLoader';
import { preloadBuildingTextures } from './terrain/buildingTextures';
import { preloadSpiderTexture } from './mech/spiderTextures';
import { createPlacedMineMesh, type PickupMeshHandle } from './items/PickupMesh';
import { nukeBlastHexes, resolveNukeTrajectory } from './items/nukeBlast';
import {
  ARCHETYPES,
  ELITE,
  rollEnemyArchetype,
  applyArmor,
  type EnemyArchetype,
  type ArchetypeKey,
  type MovementMode,
} from './enemies/archetypes';
import { createSpawnMesh, createSpawnFlash, type SpawnMeshHandle } from './spawn/SpawnPoint';
import { createObjectiveMesh, type ObjectiveMeshHandle } from './objects/Objective';
import {
  parseCoopParams,
  initCoopSession,
  isCoopActive,
  canControlUnit,
  sendCoopAction,
  coopServerState,
  coopPlayerId,
} from './coop/coopSession';
import type { CoopGameState, CoopItemSpec } from './coop/types';

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
const hudToggleBtn = document.getElementById('hud-toggle') as HTMLButtonElement;
const hudBodyEl = document.getElementById('hud-body') as HTMLDivElement;
const moveCostLayerEl = document.getElementById('move-cost-layer') as HTMLDivElement;
const showMoveCostCheckbox = document.getElementById('setting-show-move-cost') as HTMLInputElement;

const pivotControlsEl = document.createElement('div');
pivotControlsEl.className = 'pivot-controls';
pivotControlsEl.hidden = true;
const pivotLeftBtn = document.createElement('button');
pivotLeftBtn.type = 'button';
pivotLeftBtn.className = 'pivot-btn';
pivotLeftBtn.textContent = '↺';
pivotLeftBtn.title = 'Turn left';
const pivotRightBtn = document.createElement('button');
pivotRightBtn.type = 'button';
pivotRightBtn.className = 'pivot-btn';
pivotRightBtn.textContent = '↻';
pivotRightBtn.title = 'Turn right';
const pivotCostEl = document.createElement('span');
pivotCostEl.className = 'pivot-cost';
pivotControlsEl.append(pivotLeftBtn, pivotCostEl, pivotRightBtn);
moveCostLayerEl.appendChild(pivotControlsEl);

pivotLeftBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  if (!selectedId) return;
  const u = units.find((x) => x.id === selectedId);
  if (u) doTurnUnit(u, 'right');
});
pivotRightBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  if (!selectedId) return;
  const u = units.find((x) => x.id === selectedId);
  if (u) doTurnUnit(u, 'left');
});

/**
 * Persisted user preferences. Each entry maps directly to a checkbox in
 * the hamburger settings panel. Default values are the initial checked
 * state of the inputs in the HTML.
 */
const settings = {
  /** Render per-hex AP cost labels around the selected mech. */
  showMoveCost: showMoveCostCheckbox?.checked ?? true,
};

// Hamburger toggle: collapse / expand the entire instructional body.
if (hudToggleBtn && hudBodyEl) {
  hudToggleBtn.addEventListener('click', () => {
    const willCollapse = !hudBodyEl.classList.contains('collapsed');
    hudBodyEl.classList.toggle('collapsed', willCollapse);
    hudToggleBtn.setAttribute('aria-expanded', String(!willCollapse));
  });
}
if (showMoveCostCheckbox) {
  showMoveCostCheckbox.addEventListener('change', () => {
    settings.showMoveCost = showMoveCostCheckbox.checked;
    updateMoveCostOverlay();
  });
}

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

const mapConfig = buildMapFromUrl();
const { map, spawns: SPAWN } = mapConfig;
isoCam.setZoom(mapConfig.cameraZoom);

/** Zoom level when framing a selected player mech (closer than map default). */
const SELECT_FOCUS_ZOOM_FACTOR = 0.58;
const CAMERA_OVERVIEW_TARGET = new THREE.Vector3(0, 0.5, 0);

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

/**
 * AP cost to step onto a hex.
 *   2 AP — intact rubble pile (slow to scramble through)
 *   2 AP — fully-destroyed building stage 3 ("rough terrain"): the
 *          ash-and-girders pad left behind after a nuke / sustained fire
 *   1 AP — clear ground (and rubble that has been further cleared by
 *          shooting it, which sets destroyed = true)
 */
function apCostToEnter(h: HexCoord): number {
  const t = terrainAt(h);
  if (!t) return AP_COST.clearGround;
  if (t.kind === 'rubble'   && !t.destroyed) return AP_COST.rubble;
  if (t.kind === 'building' &&  t.destroyed) return AP_COST.rubble;
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

async function spawnCrate(tile: HexCoord): Promise<CrateEntity> {
  const id = `crate-${++_crateSeq}`;
  const mesh = await getCrateLoader().createMesh();
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
  /**
   * Number of own-team turns the unit will skip. Decremented and the
   * AP zeroed at the start of every own-team turn while > 0.
   * 0 = not stunned.
   */
  stunnedTurns: number;
  facingDeg: number;

  // Identity / behavior — comes from ./enemies/archetypes.ts
  archetypeKey: ArchetypeKey;
  /** Display name (e.g. "Mech", "Grunt", "Scout", "Armored"). */
  className: string;

  // Combat attributes (Stats — modifiable via devtools)
  maxAp: Stat;
  maxHp: Stat;
  damage: Stat;
  attackRange: Stat;

  /**
   * Incoming damage below this value is deflected (zero HP loss). 0 = no armor.
   */
  armorThreshold: number;

  // Movement
  movementMode: MovementMode;
  /**
   * For 'burst' movement: max hexes per single move action.
   * For 'per-hex' movement: just an informational cap (gated by AP).
   */
  movementRange: number;

  // Running state (plain numbers — refilled on turn start / decremented by play)
  ap: number;
  hp: number;

  /** Enemy kills credited to this mech for per-unit tech progression. */
  techKills: number;

  /** 6-slot grid: 2 hands + 4 backpack. See ./items/inventory.ts. */
  inventory: Inventory;

  /** Co-op: human player id that owns this mech (team 1 only). */
  ownerId?: string | null;
}

const units: Unit[] = [];

function unitAt(h: HexCoord): Unit | undefined {
  return units.find((u) => !u.destroyed && hexEquals(u.tile, h));
}

/**
 * Build a Pathfinder configured for `forUnit`. The configuration differs
 * by movement mode:
 *   - per-hex: per-hex AP cost (1 clear, 2 rubble), budget = unit.ap.
 *   - burst  : flat cost of 1 per hex, budget = movementRange. The AP
 *              cost (always 1 per action) is handled separately in
 *              `walkUnitTo`.
 * Hostile units are HARD-blocked. Allied units are SOFT-blocked
 * (passable but not stoppable).
 */
function makePathfinder(forUnit: Unit): Pathfinder {
  return new Pathfinder({
    inBounds: (h) => map.hasTile(h),
    isBlocked: (h) => {
      if (hexEquals(h, forUnit.tile)) return false;
      const other = unitAt(h);
      if (other && other.team !== forUnit.team) return true;
      return blockingTerrainAt(h);
    },
    canStop: (h) => {
      if (hexEquals(h, forUnit.tile)) return true;
      const other = unitAt(h);
      // Allies block landing but not passage; hostiles already handled
      // by isBlocked above.
      if (other && other.team === forUnit.team) return false;
      return true;
    },
    costToEnter: forUnit.movementMode === 'burst' ? () => 1 : apCostToEnter,
  });
}

/** Budget passed to reachable()/findPath() — depends on movement mode. */
function moveBudget(unit: Unit): number {
  return unit.movementMode === 'burst' ? unit.movementRange : unit.ap;
}

/** AP a move ACTION will cost (for can-I-afford checks). */
function moveActionApCost(unit: Unit, path: HexCoord[]): number {
  if (unit.movementMode === 'burst') return path.length > 0 ? 1 : 0;
  // per-hex: sum of step costs
  let total = 0;
  for (const h of path) total += apCostToEnter(h);
  return total;
}

// ----- Spawn mechs ---------------------------------------------------------

async function placeMech(spec: {
  id: string;
  team: 1 | 2;
  tile: HexCoord;
  facingDeg: number;
  /** Defaults to ELITE — applied to AP/HP/damage/range/movement. */
  archetype?: EnemyArchetype;
  /** Override the archetype's chassis. */
  chassis?: ChassisType;
  /** Override the archetype's primary weapon. */
  weaponRight?: WeaponType;
  weaponLeft?: WeaponType;
}): Promise<Unit> {
  const archetype = spec.archetype ?? ELITE;
  const chassis = spec.chassis ?? archetype.chassis;
  const weaponRight = spec.weaponRight ?? archetype.weaponRight;
  const weaponLeft = spec.weaponLeft ?? archetype.weaponLeft;

  const loader = getMechLoader();
  const mech = await loader.loadMech({
    chassis,
    team: spec.team,
    weaponRight,
    weaponLeft,
  });

  const pos = board.tileToWorld(spec.tile);
  mech.object.position.copy(pos);
  mech.object.position.y = TILE_TOP_Y + elevationAt(spec.tile);
  mech.setFacing(spec.facingDeg);
  mech.object.scale.setScalar(archetype.visualScale);

  // Insignia — a small colored marker floating above the mech head so
  // the player can tell a Grunt from a Scout at a glance.
  if (archetype.key !== 'elite') {
    attachArchetypeInsignia(mech.object, archetype);
  }

  stage.scene.add(mech.object);
  picker.registerUnit(spec.id, mech.object);

  const maxAp = new Stat(archetype.apMax, { min: 0 });
  const maxHp = new Stat(archetype.hpMax, { min: 1 });
  const damage = new Stat(archetype.damage, { min: 0 });
  const attackRange = new Stat(archetype.attackRange, { min: 0 });

  const unit: Unit = {
    id: spec.id,
    mech,
    tile: spec.tile,
    team: spec.team,
    chassis,
    destroyed: false,
    immobilised: false,
    stunnedTurns: 0,
    facingDeg: spec.facingDeg,
    archetypeKey: archetype.key,
    className: archetype.displayName,
    maxAp,
    maxHp,
    damage,
    attackRange,
    armorThreshold: archetype.armorThreshold,
    movementMode: archetype.movementMode,
    movementRange: archetype.movementRange,
    ap: maxAp.effective,
    hp: maxHp.effective,
    techKills: 0,
    inventory: createEmptyInventory(),
  };
  units.push(unit);

  stage.addTicker((dt) => mech.tick(dt));
  return unit;
}

/**
 * Attach a small floating colored cube above the mech's head so the
 * player can identify minion types at a glance. The cube sits in mech
 * local space, so it scales/moves/rotates with the unit.
 */
function attachArchetypeInsignia(mechRoot: THREE.Object3D, arch: EnemyArchetype): void {
  // Place the insignia above the body — well above the standard mech
  // bounding height (~2.4 world units). It scales with mech.visualScale.
  const color = new THREE.Color(arch.haloColor);
  const geom = new THREE.OctahedronGeometry(0.12, 0);
  const mat = new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 1.0,
    metalness: 0.4,
    roughness: 0.4,
  });
  const insignia = new THREE.Mesh(geom, mat);
  insignia.position.set(0, 2.55, 0);
  insignia.userData.tackticus_insignia = true;
  insignia.userData.kind = 'insignia';
  mechRoot.add(insignia);

  // Slight idle bob — added via a per-tick action through stage.addTicker
  // in placeMech's existing ticker chain would require a closure. Keep
  // it simple: rotate continuously (looks like a marker).
  const baseY = insignia.position.y;
  stage.addTicker((_dt, total) => {
    insignia.rotation.y = total * 1.8;
    insignia.position.y = baseY + Math.sin(total * 2.0) * 0.05;
  });
}

/**
 * Initial crate spawn positions — provided by the active map builder.
 */
async function spawnInitialCrates(): Promise<void> {
  await getCrateLoader().preload();
  for (const tile of mapConfig.crateTiles) {
    if (!map.hasTile(tile)) continue;
    if (blockingTerrainAt(tile)) continue;
    await spawnCrate(tile);
  }
}

// ----- Enemy spawn points ---------------------------------------------------

interface SpawnPointEntity {
  id: string;
  tile: HexCoord;
  team: 2;
  mesh: SpawnMeshHandle;
}

const spawnPoints: SpawnPointEntity[] = [];
let _spawnedEnemySeq = 0;
const activeSpawnFlashes: Array<ReturnType<typeof createSpawnFlash>> = [];

/**
 * Hard cap on total alive team-2 mechs. The orbital drop points keep
 * dropping reinforcements every enemy turn UNTIL we hit this ceiling;
 * once the board clears (or you kill enough) the next enemy turn fills
 * the empty pads again.
 */
const MAX_TEAM2_ALIVE = 8;

function spawnInitialSpawnPoints(): void {
  for (const tile of mapConfig.spawnPointTiles) {
    if (!map.hasTile(tile)) continue;
    if (blockingTerrainAt(tile)) continue;
    placeSpawnPoint(tile);
  }
}

function placeSpawnPoint(tile: HexCoord): SpawnPointEntity {
  const mesh = createSpawnMesh('#ff5c6c');
  const p = board.tileToWorld(tile);
  mesh.group.position.set(p.x, TILE_TOP_Y - 0.02, p.z);
  stage.scene.add(mesh.group);
  const id = `spawn-${spawnPoints.length + 1}`;
  const sp: SpawnPointEntity = { id, tile, team: 2, mesh };
  spawnPoints.push(sp);
  return sp;
}

// ----- Capture objectives ---------------------------------------------------

interface ObjectiveEntity {
  id: string;
  tile: HexCoord;
  /** null = neutral; otherwise the team that currently holds the point. */
  ownerTeam: 1 | 2 | null;
  mesh: ObjectiveMeshHandle;
}

const objectives: ObjectiveEntity[] = [];
let _objectiveSeq = 0;

function objectiveAt(h: HexCoord): ObjectiveEntity | undefined {
  return objectives.find((o) => hexEquals(o.tile, h));
}

function placeObjective(tile: HexCoord): ObjectiveEntity {
  const mesh = createObjectiveMesh();
  const p = board.tileToWorld(tile);
  mesh.group.position.set(p.x, TILE_TOP_Y, p.z);
  stage.scene.add(mesh.group);
  const id = `obj-${++_objectiveSeq}`;
  const obj: ObjectiveEntity = { id, tile, ownerTeam: null, mesh };
  objectives.push(obj);
  return obj;
}

function spawnInitialObjectives(): void {
  for (const tile of mapConfig.objectiveTiles) {
    if (!map.hasTile(tile)) continue;
    if (blockingTerrainAt(tile)) continue;
    placeObjective(tile);
  }
}

/**
 * Claim a neutral objective or flip an enemy-held one when a mech ends
 * movement on its hex.
 */
function tryCaptureObjective(unit: Unit): void {
  const obj = objectiveAt(unit.tile);
  if (!obj || unit.destroyed) return;
  if (obj.ownerTeam === unit.team) return;

  const wasNeutral = obj.ownerTeam === null;
  const prevOwner = obj.ownerTeam;
  obj.ownerTeam = unit.team;
  obj.mesh.setOwner(unit.team);

  if (wasNeutral) {
    setStatus(
      `${describeUnit(unit)} captured objective at (${obj.tile.q},${obj.tile.r}).`,
    );
  } else {
    setStatus(
      `${describeUnit(unit)} seized objective from ${teamName(prevOwner!)} ` +
      `at (${obj.tile.q},${obj.tile.r}).`,
    );
  }
  renderTurnInfo();
}

function objectivesCapturedBy(team: 1 | 2): number {
  return objectives.filter((o) => o.ownerTeam === team).length;
}

// Pulse objective beacons.
stage.addTicker((_dt, total) => {
  for (const obj of objectives) obj.mesh.tick(total);
});

// ----- Tech progress (per-mech kills → bonus AP) ---------------------------

function applyTechApBonusForUnit(unit: Unit): void {
  if (unit.team !== 1 || unit.destroyed) return;
  const bonus = apBonusFromKills(unit.techKills);
  const source = techModifierSource(unit.id);
  unit.maxAp.removeModifier(source);
  if (bonus > 0) {
    unit.maxAp.addModifier({
      source,
      delta: bonus,
      label: `Tech +${bonus} AP`,
    });
  }
  if (unit.ap > unit.maxAp.effective) unit.ap = unit.maxAp.effective;
}

function techStatusSuffix(unit: Unit): string {
  const techPts = unit.techKills * TECH_POINTS_PER_KILL;
  const apBonus = apBonusFromKills(unit.techKills);
  const next = killsUntilNextMilestone(unit.techKills);
  const parts = [`Tech ${techPts}`, `+${apBonus} AP`];
  if (next !== null) parts.push(`${next - unit.techKills} kills to next bonus`);
  return parts.join(' · ');
}

/**
 * Register a kill scored by a red-team mech. Awards tech to that mech only.
 * Returns a short suffix for the combat status line.
 */
function registerPlayerKill(killer: Unit | undefined): string {
  if (!killer || killer.team !== 1) return '';

  const prevBonus = apBonusFromKills(killer.techKills);
  killer.techKills += 1;
  applyTechApBonusForUnit(killer);

  const newBonus = apBonusFromKills(killer.techKills);
  const gained = newBonus - prevBonus;
  if (gained > 0 && currentTeam === 1 && killer.ap < killer.maxAp.effective) {
    killer.ap = Math.min(killer.ap + gained, killer.maxAp.effective);
  }

  renderTurnInfo();
  renderDashboard();

  const parts: string[] = [`${killer.id.toUpperCase()} tech ${killer.techKills}`];
  if (gained > 0) parts.push(`+${gained} max AP unlocked`);
  const next = killsUntilNextMilestone(killer.techKills);
  if (next !== null) parts.push(`${next - killer.techKills} kills to next bonus`);
  return ` (${parts.join(' · ')})`;
}

function despawnSpawnPoint(sp: SpawnPointEntity): void {
  const idx = spawnPoints.indexOf(sp);
  if (idx < 0) return;
  spawnPoints.splice(idx, 1);
  stage.scene.remove(sp.mesh.group);
  sp.mesh.dispose();
}

function aliveCount(team: 1 | 2): number {
  return units.filter((u) => u.team === team && !u.destroyed).length;
}

/**
 * Called at the start of every team-2 turn. Every clear spawn point
 * deploys one fresh enemy of a random archetype — no cooldown, no
 * dice roll. The gates are:
 *   - the global alive cap (`MAX_TEAM2_ALIVE`)
 *   - the tile must be free of blocking terrain
 *   - the tile must NOT have a player (team 1) mech standing on it —
 *     "squatting" on an enemy drop pad is a real tactic that should
 *     suppress that pad for the turn
 *   - the tile must not be occupied by an existing enemy mech (its
 *     own kind would just block the warp anyway)
 *
 * Returns the count of new enemies dropped (for status reporting).
 */
async function tickSpawnPoints(): Promise<number> {
  let dropped = 0;
  const dropNames: string[] = [];
  let blockedByPlayer = 0;
  let blockedByEnemy = 0;
  let blockedByTerrain = 0;

  for (const sp of spawnPoints) {
    if (aliveCount(2) >= MAX_TEAM2_ALIVE) break;

    const standing = unitAt(sp.tile);
    if (standing) {
      // Player squatters block drops outright — call it out separately
      // so the player gets clear feedback that the tactic is working.
      if (standing.team === 1) blockedByPlayer++;
      else                     blockedByEnemy++;
      continue;
    }
    if (blockingTerrainAt(sp.tile)) {
      blockedByTerrain++;
      continue;
    }

    const arch = rollEnemyArchetype();
    const id = `s${++_spawnedEnemySeq}`;
    await placeMech({ id, team: 2, tile: sp.tile, facingDeg: 90, archetype: arch });
    dropped += 1;
    dropNames.push(arch.displayName);

    // Warp-in beam.
    const flash = createSpawnFlash(arch.haloColor);
    const p = board.tileToWorld(sp.tile);
    flash.group.position.set(p.x, TILE_TOP_Y, p.z);
    stage.scene.add(flash.group);
    activeSpawnFlashes.push(flash);
  }

  // Compose a single status line that summarises both what dropped AND
  // what was blocked so the player understands the cause-and-effect.
  const fragments: string[] = [];
  if (dropped > 0) {
    fragments.push(
      `Orbital drop: ${dropped} new enemy mech${dropped > 1 ? 's' : ''} ` +
      `(${dropNames.join(', ')})`,
    );
  }
  if (blockedByPlayer > 0) {
    fragments.push(
      `${blockedByPlayer} drop pad${blockedByPlayer > 1 ? 's' : ''} ` +
      `suppressed by your mech${blockedByPlayer > 1 ? 's' : ''}`,
    );
  }
  if (blockedByEnemy > 0) {
    fragments.push(
      `${blockedByEnemy} pad${blockedByEnemy > 1 ? 's' : ''} blocked by other enemies`,
    );
  }
  if (blockedByTerrain > 0) {
    fragments.push(
      `${blockedByTerrain} pad${blockedByTerrain > 1 ? 's' : ''} blocked by terrain`,
    );
  }
  if (fragments.length > 0) setStatus(fragments.join('. ') + '.');

  renderDashboard();
  return dropped;
}

// Pulsing pad animation + "player is squatting" lockdown visual. The
// pad turns green and the rising rings retract whenever any unit (in
// practice a red mech holding the pad) stands on it — that's the
// at-a-glance feedback that the drop is suppressed for the turn.
stage.addTicker((_dt, total) => {
  for (const sp of spawnPoints) {
    const occupant = unitAt(sp.tile);
    sp.mesh.setSuppressed(!!occupant);
    sp.mesh.tick(total);
  }
});

// Drive + reap one-shot warp flashes.
stage.addTicker((dt) => {
  for (let i = activeSpawnFlashes.length - 1; i >= 0; i--) {
    const done = activeSpawnFlashes[i].tick(dt);
    if (done) {
      activeSpawnFlashes[i].dispose();
      activeSpawnFlashes.splice(i, 1);
    }
  }
});

// ----- Turn state (must be declared before boot IIFE) ----------------------

let currentTeam: 1 | 2 = 1;
let turnNumber = 1;

/** Who's at the controls for each team. */
type TeamController = 'human' | 'ai';
const teamControllers: Record<1 | 2, TeamController> = { 1: 'human', 2: 'ai' };

/** True while the AI is processing its turn. Locks player input. */
let aiActive = false;

const coopParams = parseCoopParams();

function applyCoopLoadout(unit: Unit, specs: CoopItemSpec[]): void {
  for (const spec of specs) {
    switch (spec.kind) {
      case 'repairKit':
        addItem(unit.inventory, makeRepairKit(spec.amount));
        break;
      case 'weapon':
        addItem(unit.inventory, makeWeapon(spec.bonus, spec.label));
        break;
      case 'armor':
        addItem(unit.inventory, makeArmor(spec.bonus, spec.label));
        break;
      case 'rangeModule':
        addItem(unit.inventory, makeRangeModule(spec.bonus, spec.label));
        break;
      case 'mine':
        addItem(unit.inventory, makeMine(spec.damage));
        break;
      case 'tacticalNuke':
        addItem(unit.inventory, makeTacticalNuke());
        break;
      case 'demoCharge':
        addItem(unit.inventory, makeDemoCharge());
        break;
    }
  }
}

async function syncFromCoopServer(state: CoopGameState): Promise<void> {
  for (const su of state.units) {
    let u = units.find((x) => x.id === su.id);
    if (!u) {
      const arch = su.team === 1 ? ELITE : ARCHETYPES.grunt;
      u = await placeMech({
        id: su.id,
        team: su.team,
        tile: su.tile,
        facingDeg: su.facingDeg,
        archetype: arch,
        chassis: su.chassis,
      });
      u.ownerId = su.ownerId;
      if (su.team === 1 && su.items.length > 0) {
        applyCoopLoadout(u, su.items);
      }
    }

    u.ownerId = su.ownerId;
    u.tile = { ...su.tile };
    u.ap = su.ap;
    u.hp = su.hp;
    u.techKills = su.techKills;
    u.facingDeg = su.facingDeg;
    u.destroyed = su.destroyed;
    u.maxAp.setBase(su.maxAp);
    u.maxHp.setBase(su.maxHp);
    u.damage.setBase(su.damage);
    u.attackRange.setBase(su.attackRange);
    applyTechApBonusForUnit(u);

    const p = board.tileToWorld(su.tile);
    u.mech.object.position.set(p.x, TILE_TOP_Y + elevationAt(su.tile), p.z);
    u.mech.setFacing(su.facingDeg);
    u.mech.object.visible = !su.destroyed;
    if (su.destroyed) u.mech.playAnimation('destroyed');
  }

  currentTeam = state.phase === 'ai' ? 2 : 1;
  turnNumber = state.turnNumber;
  aiActive = state.phase === 'ai';

  const myPhase =
    state.phase === 'human' && state.activePlayerId === coopPlayerId();
  endTurnBtn.disabled =
    state.outcome.ended || (isCoopActive() && !myPhase);

  if (state.outcome.ended) {
    gameOver = state.outcome;
    endTurnBtn.disabled = true;
    renderGameOver();
  }

  renderTurnInfo();
  renderDashboard();
  if (selectedId) {
    const sel = units.find((u) => u.id === selectedId);
    if (!sel || sel.destroyed || (isCoopActive() && !canControlUnit(sel.id))) {
      deselect();
    } else {
      recomputeReachable(sel);
    }
  }
  refreshTileVisuals(null);

  const active = state.players.find((p) => p.id === state.activePlayerId);
  if (state.phase === 'human' && active) {
    const mine = state.activePlayerId === coopPlayerId();
    setStatus(
      mine
        ? `Your sub-phase — move your mechs, then End Turn.`
        : `Waiting for ${active.name}…`,
    );
  } else if (state.phase === 'ai') {
    setStatus('Enemy turn…');
  }
}

(async () => {
  await Promise.all([
    getCrateLoader().preload(),
    preloadBuildingTextures(),
    preloadSpiderTexture(),
  ]);

  if (coopParams) {
    spawnInitialObjectives();
    spawnInitialSpawnPoints();
    setStatus('Connecting to co-op room…');
    initCoopSession(coopParams, {
      setStatus,
      applyServerState: syncFromCoopServer,
    });
    return;
  }

  // Red team — elite player mechs (3 AP, per-hex movement).
  await placeMech({ id: 'r1', team: 1, tile: SPAWN.r1, facingDeg: 270, archetype: ELITE, chassis: 'light', weaponRight: 'beam' });
  await placeMech({ id: 'r2', team: 1, tile: SPAWN.r2, facingDeg: 270, archetype: ELITE, chassis: 'heavy', weaponRight: 'cannon', weaponLeft: 'missiles' });

  // Blue team — starts with two grunts. Spawn points feed reinforcements.
  await placeMech({ id: 'b1', team: 2, tile: SPAWN.b1, facingDeg: 90,  archetype: ARCHETYPES.grunt });
  await placeMech({ id: 'b2', team: 2, tile: SPAWN.b2, facingDeg: 90,  archetype: ARCHETYPES.grunt });

  // Each player mech starts with a tactical nuke and one repair kit.
  for (const u of units) {
    if (u.team === 1 && u.archetypeKey === 'elite') {
      addItem(u.inventory, makeTacticalNuke());
      addItem(u.inventory, makeRepairKit(2));
    }
  }

  await spawnInitialCrates();
  spawnInitialSpawnPoints();
  spawnInitialObjectives();

  renderTurnInfo();
  renderDashboard();
  const objHint = mapConfig.objectiveTiles.length > 0
    ? ' Capture objective boxes in the city. Kills earn tech — +1 AP at 3 and 5 kills.'
    : '';
  setStatus(
    `${mapConfig.displayName}: Red team's turn. Each mech carries a nuke and repair kit.` +
    objHint,
  );
})();

function endTurn(): void {
  if (mode === 'animating') return;
  if (gameOver) return;
  if (aiActive) return; // AI will end its own turn
  doEndTurn();
}

/** Internal — the actual turn-flip logic, callable by both UI + AI. */
function doEndTurn(): void {
  if (gameOver) return;
  if (isCoopActive()) {
    sendCoopAction({ kind: 'endPhase' });
    return;
  }
  // Cancel any in-progress nuke targeting — you don't get to lob it
  // across turn boundaries.
  if (mode === 'nukeTargeting') {
    nukeContext = null;
    mode = selectedId ? 'selected' : 'idle';
  }
  // Switch teams; turnNumber increments only when blue → red wraps.
  currentTeam = currentTeam === 1 ? 2 : 1;
  if (currentTeam === 1) turnNumber += 1;

  // Refill AP for the new active team. STUNNED units burn one stun
  // tick instead of refilling — they wake up next turn but lose this
  // one. Immobilised units still refill (kept for symmetry if they're
  // released later); they just can't spend AP.
  for (const u of units) {
    if (u.team !== currentTeam || u.destroyed) continue;
    if (u.stunnedTurns > 0) {
      u.ap = 0;
      u.stunnedTurns -= 1;
    } else {
      u.ap = u.maxAp.effective;
    }
  }

  // (Spawn + AI handoff are dispatched together at the bottom — we need
  //  to await spawn point ticks BEFORE the AI starts so it can plan
  //  around the new arrivals.)

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

  // Start-of-turn pipeline (spawn → AI). Always async so we don't block
  // the click handler.
  void runStartOfTurn();
}

/**
 * Runs at the start of every turn (after teams have already flipped).
 * Handles spawn-point ticks for team 2, then hands off to the AI if
 * the active team is computer-controlled.
 */
async function runStartOfTurn(): Promise<void> {
  if (isCoopActive()) return;
  if (currentTeam === 2) {
    await tickSpawnPoints();
    if (gameOver) return;
  }
  if (teamControllers[currentTeam] === 'ai') {
    await runAiTurn();
  }
}
endTurnBtn.addEventListener('click', endTurn);

function teamName(team: 1 | 2): string {
  return team === 1 ? 'Red' : 'Blue';
}

function renderTurnInfo(): void {
  const color = currentTeam === 1 ? '#ff7a7a' : '#7aa8ff';
  const tag = teamControllers[currentTeam] === 'ai' ? ' <span style="color:#ffce4d;font-size:11px">[AI]</span>' : '';
  const coop = coopServerState();
  const coopLine = coop && coop.phase !== 'lobby'
    ? `<br><span style="font-size:11px;color:#b8c4d0">` +
      (coop.phase === 'human' && coop.activePlayerId
        ? `Sub-phase: ${coop.players.find((p) => p.id === coop.activePlayerId)?.name ?? '—'}`
        : coop.phase === 'ai' ? 'AI turn' : '') +
      ` · Turn ${coop.turnNumber}</span>`
    : '';
  const sel = selectedId ? units.find((u) => u.id === selectedId) : undefined;
  const techLine = sel && sel.team === 1 && !sel.destroyed
    ? `<br><span style="font-size:11px;color:#b8c4d0">${sel.id.toUpperCase()}: ${techStatusSuffix(sel)}</span>`
    : '';
  const objLine = objectives.length > 0
    ? `<br><span style="font-size:11px;color:#b8c4d0">` +
      `Objectives ${objectivesCapturedBy(1)}/${objectives.length} held` +
      `</span>`
    : '';
  turnInfoEl.innerHTML =
    `Turn ${turnNumber} — <span style="color:${color};font-weight:600">` +
    `${teamName(currentTeam)} team</span>${tag}${coopLine}${techLine}${objLine}`;
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

type InteractionMode = 'idle' | 'selected' | 'animating' | 'nukeTargeting';

let selectedId: string | null = null;
let mode: InteractionMode = 'idle';

/** Map "q_r" → AP cost to reach, set when a unit is selected. */
let reachableForSelected: Map<string, number> = new Map();

/**
 * When a player clicks a tactical nuke in inventory, we transition to
 * 'nukeTargeting' mode. We need to remember who's holding the nuke and
 * which slot it lives in so a successful detonation consumes the right
 * item. `range` is the maximum hex distance the player can lob.
 */
interface NukeTargetingContext {
  unit: Unit;
  item: Item;
  addr: SlotAddress;
  range: number;
}
let nukeContext: NukeTargetingContext | null = null;
const NUKE_RANGE = 3;

picker.setEvents({
  onTileHover(tile) {
    if (mode === 'animating' || gameOver || aiActive) return;
    refreshTileVisuals(tile);
  },

  onUnitClick(unitId) {
    if (mode === 'animating' || gameOver || aiActive) return;
    // Clicking anything other than a tile while nuke-targeting cancels
    // the launch (no propagation — keep clicks predictable).
    if (mode === 'nukeTargeting') {
      cancelNukeTargeting('Nuke launch cancelled.');
      return;
    }

    const target = units.find((u) => u.id === unitId);
    if (!target || target.destroyed) return;

    if (isCoopActive()) {
      if (selectedId === null) {
        if (!canControlUnit(target.id)) {
          setStatus('Not your mech or sub-phase.');
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
        if (canControlUnit(target.id)) selectUnit(target);
        return;
      }
      if (shooter.team === target.team) {
        if (!canControlUnit(target.id)) {
          setStatus('Not your mech or sub-phase.');
          return;
        }
        selectUnit(target);
        setStatus(`Switched selection to ${describeUnit(target)}.`);
        return;
      }
      if (!canControlUnit(shooter.id)) {
        setStatus('Not your sub-phase.');
        return;
      }
      void fireAtUnit(shooter, target);
      return;
    }

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
    if (mode === 'nukeTargeting') {
      cancelNukeTargeting('Nuke launch cancelled.');
      return;
    }
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
    if (mode === 'nukeTargeting') {
      cancelNukeTargeting('Nuke launch cancelled.');
      return;
    }
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

    if (mode === 'nukeTargeting') {
      if (!nukeContext) {
        cancelNukeTargeting();
        return;
      }
      if (!isValidNukeTarget(tile)) {
        cancelNukeTargeting('Nuke launch cancelled — target out of range.');
        return;
      }
      void fireTacticalNuke(tile);
      return;
    }

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
  if (isCoopActive() && !canControlUnit(unit.id)) {
    setStatus('Not your mech or sub-phase.');
    return;
  }
  selectedId = unit.id;
  mode = 'selected';
  recomputeReachable(unit);
  refreshTileVisuals(null);
  renderDashboard();
  if (unit.team === 1 && teamControllers[1] === 'human') {
    focusCameraOnUnit(unit);
  }
  setStatus(describeSelection(unit));
}

/** Smoothly pan and zoom the camera toward a mech's hex. */
function focusCameraOnUnit(unit: Unit): void {
  const p = board.tileToWorld(unit.tile);
  const elev = elevationAt(unit.tile);
  isoCam.setTarget(new THREE.Vector3(p.x, TILE_TOP_Y + elev + 0.9, p.z));
  isoCam.setZoom(mapConfig.cameraZoom * SELECT_FOCUS_ZOOM_FACTOR);
}

/** Pull back to the map overview after deselecting. */
function restoreCameraOverview(): void {
  isoCam.setTarget(CAMERA_OVERVIEW_TARGET);
  isoCam.setZoom(mapConfig.cameraZoom);
}

function describeSelection(unit: Unit): string {
  const head =
    `${describeUnit(unit)} — ` +
    `AP ${unit.ap}/${unit.maxAp.effective}, ` +
    `HP ${unit.hp}/${unit.maxHp.effective}, ` +
    `range ${unit.attackRange.effective}, dmg ${unit.damage.effective}. `;
  if (unit.immobilised) return head + `IMMOBILISED — cannot act this game.`;
  if (unit.stunnedTurns > 0) {
    return head + `STUNNED — skipping ${unit.stunnedTurns} more own-team turn${unit.stunnedTurns > 1 ? 's' : ''}.`;
  }

  const crate = crateAt(unit.tile);
  if (crate && unit.ap >= CRATE_OPEN_AP_COST) {
    return head + `Click your tile (or the crate) to open it for 1 AP — beware traps.`;
  }
  const arcHint = requiresForwardArc(unit)
    ? `Heavy: fires forward arc only — pivot with , / . (1 AP). `
    : '';
  return head + arcHint + (unit.ap > 0
    ? `Green = move, light green = fire arc, red = shoot.`
    : `Out of AP — end the turn.`);
}

function deselect(): void {
  // If we were mid-nuke launch, abort cleanly before wiping state.
  if (mode === 'nukeTargeting') nukeContext = null;
  selectedId = null;
  mode = 'idle';
  reachableForSelected = new Map();
  board.clearAllStates();
  restoreCameraOverview();
  renderDashboard();
}

function recomputeReachable(unit: Unit): void {
  if (unit.immobilised || unit.ap <= 0) {
    // Start hex only — no other reachable tiles.
    reachableForSelected = new Map([[hexKey(unit.tile), 0]]);
    return;
  }
  const pf = makePathfinder(unit);
  reachableForSelected = pf.reachable(unit.tile, moveBudget(unit));
}

/** Heavy chassis mechs may only shoot within their forward 3-face arc. */
function requiresForwardArc(unit: Unit): boolean {
  return unit.chassis === 'heavy';
}

function canShootAtTile(shooter: Unit, targetTile: HexCoord): boolean {
  const range = shooter.attackRange.effective;
  if (hexDistance(shooter.tile, targetTile) > range) return false;
  if (!requiresForwardArc(shooter)) return true;
  return isInForwardArc(
    shooter.tile,
    targetTile,
    shooter.facingDeg,
    range,
    (t) => board.has(t),
  );
}

function refreshTileVisuals(hover: HexCoord | null): void {
  board.clearAllStates();
  if (gameOver) return;

  // Nuke-targeting overlay short-circuits the normal selection visuals:
  // we light up every tile within nuke range and let the firer's own
  // tile read as the launch point. Hover still highlights the cursor.
  if (mode === 'nukeTargeting' && nukeContext) {
    const u = nukeContext.unit;
    for (const tile of board.hexes) {
      if (hexDistance(u.tile, tile) <= nukeContext.range && !hexEquals(tile, u.tile)) {
        board.setTileState(tile, 'attack');
      }
    }
    board.setTileState(u.tile, 'selected');
    if (hover && board.has(hover)) board.setTileState(hover, 'hover');
    return;
  }

  const sel = selectedId ? units.find((u) => u.id === selectedId) : null;

  // Green: reachable hexes (skipped entirely for immobilised mechs).
  if (sel && !sel.immobilised) {
    for (const k of reachableForSelected.keys()) {
      const h = hexFromKey(k);
      if (hexEquals(sel.tile, h)) continue;
      if (unitAt(h)) continue;
      if (blockingTerrainAt(h)) continue;
      board.setTileState(h, 'move');
    }
  }

  // Lighter green: heavy mech forward fire cone (3 at range 1, 8 at range 2+).
  if (sel && !sel.immobilised && requiresForwardArc(sel) && sel.ap >= AP_COST.shoot) {
    const range = sel.attackRange.effective;
    for (const h of hexesInForwardCone(sel.tile, sel.facingDeg, range, (t) => board.has(t))) {
      if (hexEquals(sel.tile, h)) continue;
      board.setTileState(h, 'fireArc');
    }
  }

  // Red: enemies + destructible terrain in range (and forward arc for heavy).
  if (sel && !sel.immobilised && sel.ap >= AP_COST.shoot) {
    for (const target of units) {
      if (target.destroyed || target.team === sel.team) continue;
      if (canShootAtTile(sel, target.tile)) {
        board.setTileState(target.tile, 'attack');
      }
    }
    for (const t of terrainPieces) {
      if (t.destroyed || t.hp === undefined) continue;
      if (canShootAtTile(sel, t.tile)) {
        board.setTileState(t.tile, 'attack');
      }
    }
  }

  if (sel) board.setTileState(sel.tile, 'selected');

  if (hover && board.has(hover)) board.setTileState(hover, 'hover');
}

// ----- Move-cost overlay ---------------------------------------------------
//
// Renders semi-transparent AP badges on every reachable hex for the
// selected mech (not just immediate neighbors). Lives in DOM so labels
// stay crisp at any zoom. Toggled via the hamburger settings panel.

const _projectVec = new THREE.Vector3();
const moveCostLabels: HTMLDivElement[] = [];

function ensureMoveCostLabel(idx: number): HTMLDivElement {
  let el = moveCostLabels[idx];
  if (el) return el;
  el = document.createElement('div');
  el.className = 'move-cost-label';
  el.style.display = 'none';
  moveCostLayerEl.appendChild(el);
  moveCostLabels[idx] = el;
  return el;
}

function hideAllMoveCostLabels(): void {
  for (const el of moveCostLabels) {
    if (el) el.style.display = 'none';
  }
  pivotControlsEl.hidden = true;
}

/**
 * Recompute label positions + visibility for the current selection.
 * Safe to call every frame; bails out fast when nothing's selected
 * or the setting is off.
 */
function updateMoveCostOverlay(): void {
  if (
    !settings.showMoveCost ||
    !selectedId ||
    mode === 'nukeTargeting' ||
    mode === 'animating' ||
    aiActive ||
    gameOver
  ) {
    hideAllMoveCostLabels();
    return;
  }
  const sel = units.find((u) => u.id === selectedId);
  if (!sel || sel.destroyed || sel.immobilised) {
    hideAllMoveCostLabels();
    return;
  }
  // Only show for the active human team so it doesn't get used as an
  // intel cheat-sheet during enemy turns.
  if (sel.team !== currentTeam || teamControllers[currentTeam] !== 'human') {
    hideAllMoveCostLabels();
    return;
  }

  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (w === 0 || h === 0) {
    hideAllMoveCostLabels();
    return;
  }

  for (let i = 0; i < reachableForSelected.size; i++) {
    ensureMoveCostLabel(i);
  }

  let labelIdx = 0;
  for (const [k, pathCost] of reachableForSelected) {
    if (pathCost === 0) continue;
    const tile = hexFromKey(k);
    const el = ensureMoveCostLabel(labelIdx++);

    if (!board.has(tile) || blockingTerrainAt(tile) || unitAt(tile)) {
      el.style.display = 'none';
      continue;
    }

    const cost = sel.movementMode === 'burst' ? 1 : pathCost;
    const world = board.tileToWorld(tile);
    _projectVec.set(world.x, world.y + 0.55, world.z);
    _projectVec.project(isoCam.camera);

    if (_projectVec.z < -1 || _projectVec.z > 1) {
      el.style.display = 'none';
      continue;
    }

    const x = ((_projectVec.x + 1) / 2) * w;
    const y = ((-_projectVec.y + 1) / 2) * h;

    el.textContent = `${cost} AP`;
    el.classList.toggle('expensive', cost >= 2);
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.display = 'block';
  }

  for (let i = labelIdx; i < moveCostLabels.length; i++) {
    const el = moveCostLabels[i];
    if (el) el.style.display = 'none';
  }

  updatePivotControls();
}

/** On-screen ↺ / ↻ buttons for heavy mech pivot (below selected unit). */
function updatePivotControls(): void {
  const hide =
    !settings.showMoveCost ||
    !selectedId ||
    mode === 'nukeTargeting' ||
    mode === 'animating' ||
    aiActive ||
    gameOver;

  if (hide) {
    pivotControlsEl.hidden = true;
    return;
  }

  const sel = units.find((u) => u.id === selectedId);
  if (
    !sel ||
    sel.destroyed ||
    sel.immobilised ||
    sel.chassis !== 'heavy' ||
    sel.team !== currentTeam ||
    teamControllers[currentTeam] !== 'human'
  ) {
    pivotControlsEl.hidden = true;
    return;
  }

  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (w === 0 || h === 0) {
    pivotControlsEl.hidden = true;
    return;
  }

  const world = board.tileToWorld(sel.tile);
  const elev = elevationAt(sel.tile);
  _projectVec.set(world.x, world.y + elev + 0.55, world.z);
  _projectVec.project(isoCam.camera);

  if (_projectVec.z < -1 || _projectVec.z > 1) {
    pivotControlsEl.hidden = true;
    return;
  }

  const x = ((_projectVec.x + 1) / 2) * w;
  const y = ((-_projectVec.y + 1) / 2) * h;

  pivotControlsEl.style.left = `${x}px`;
  pivotControlsEl.style.top = `${y + 34}px`;

  const cost = turnApCost(sel);
  pivotCostEl.textContent = cost > 0 ? `${cost} AP` : 'free';
  const canTurn =
    sel.stunnedTurns === 0 &&
    (cost === 0 || sel.ap >= cost);
  pivotLeftBtn.disabled = !canTurn;
  pivotRightBtn.disabled = !canTurn;
  pivotControlsEl.hidden = false;
}

// ----- Turn-in-place action ------------------------------------------------
//
// After moving, a mech faces its last step direction automatically. To
// re-orient WITHOUT moving, pivot one hex direction with [,] / [.] or the
// on-screen buttons. Heavy chassis pay 1 AP per pivot.

function turnApCost(unit: Unit): number {
  return unit.chassis === 'heavy' ? 1 : 0;
}

/**
 * Pivot the unit's facing by one hex direction (60° on the grid). Returns
 * true on success. Validates AP / team / stun / etc.
 */
function doTurnUnit(unit: Unit, direction: 'left' | 'right'): boolean {
  if (gameOver || mode === 'animating' || aiActive) return false;
  if (mode === 'nukeTargeting') return false;
  if (unit.destroyed) return false;
  if (isCoopActive()) {
    if (!canControlUnit(unit.id)) {
      setStatus('Not your sub-phase or mech.');
      return false;
    }
    sendCoopAction({ kind: 'pivot', unitId: unit.id, direction });
    return true;
  }
  if (unit.team !== currentTeam || teamControllers[currentTeam] !== 'human') {
    setStatus(`Not ${teamName(unit.team)}'s turn.`);
    return false;
  }
  if (unit.immobilised) {
    setStatus(`${describeUnit(unit)} is immobilised and cannot turn.`);
    return false;
  }
  if (unit.stunnedTurns > 0) {
    setStatus(`${describeUnit(unit)} is stunned — can't turn this turn.`);
    return false;
  }

  const cost = turnApCost(unit);
  if (cost > 0 && unit.ap < cost) {
    setStatus(
      `${describeUnit(unit)} needs ${cost} AP to pivot (heavy chassis). ` +
      `Has ${unit.ap}.`,
    );
    return false;
  }

  const centerDir = facingDegToDirIndex(unit.facingDeg);
  const newDirIdx = direction === 'left'
    ? (centerDir + 5) % 6
    : (centerDir + 1) % 6;
  const faceTile = hexNeighbor(unit.tile, newDirIdx);
  unit.facingDeg = hexFacingDegrees(unit.tile, faceTile);
  unit.mech.setFacing(unit.facingDeg);

  if (cost > 0) {
    unit.ap -= cost;
    setStatus(
      `${describeUnit(unit)} pivoted ${direction} (-${cost} AP). ` +
      `(${unit.ap}/${unit.maxAp.effective} AP left.)`,
    );
  } else {
    setStatus(`${describeUnit(unit)} pivoted ${direction}.`);
  }

  refreshTileVisuals(null);
  updateMoveCostOverlay();
  updatePivotControls();
  renderDashboard();
  return true;
}

// Global keybindings for unit pivot.
window.addEventListener('keydown', (e) => {
  if (e.key !== ',' && e.key !== '.') return;
  const tag = (e.target as HTMLElement | null)?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'BUTTON') return;
  if (!selectedId) return;
  const u = units.find((x) => x.id === selectedId);
  if (!u) return;
  e.preventDefault();
  doTurnUnit(u, e.key === ',' ? 'left' : 'right');
});

function describeUnit(u: Unit): string {
  return `${teamName(u.team)} ${u.className} ${u.id.toUpperCase()}`;
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
  if (unit.stunnedTurns > 0) {
    setStatus(`${describeUnit(unit)} is stunned — can't move this turn.`);
    return;
  }
  const pf = makePathfinder(unit);
  const path = pf.findPath(unit.tile, dest, moveBudget(unit));
  if (!path || path.length === 0) return;

  const apCost = moveActionApCost(unit, path);
  if (apCost > unit.ap) {
    setStatus(
      `Move costs ${apCost} AP but ${describeUnit(unit)} only has ${unit.ap}.`,
    );
    return;
  }

  if (isCoopActive()) {
    if (!canControlUnit(unit.id)) {
      setStatus('Not your mech or sub-phase.');
      return;
    }
    sendCoopAction({ kind: 'move', unitId: unit.id, to: dest });
    return;
  }

  mode = 'animating';
  board.clearAllStates();
  const costLabel = unit.movementMode === 'burst'
    ? `1 AP / ${path.length} hex`
    : `${apCost} AP`;
  setStatus(`${describeUnit(unit)} moving (${costLabel})…`);

  unit.mech.playAnimation('walk');

  // Burst-move units pay the AP up-front and the per-step deduction is
  // skipped; per-hex units keep the existing pay-as-you-go behavior.
  if (unit.movementMode === 'burst') unit.ap -= 1;

  for (const step of path) {
    await animateStep(unit, step);
    unit.tile = step;
    if (unit.movementMode === 'per-hex') unit.ap -= apCostToEnter(step);
    renderDashboard();

    // Step-on effects: only mines auto-trigger. Supply crates require
    // an explicit "open" action (1 AP) so the player can choose when
    // to spend the AP and whether to risk a slot-full waste.
    const killedByMine = triggerMineFor(unit);
    if (killedByMine) break;

    tryCaptureObjective(unit);
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
 * success: rolls for a trap first; if no trap, rolls a random item
 * and routes it to the inventory. Either way the crate despawns.
 *
 * Traps replace the item drop (you spent the AP but get a bad outcome
 * instead). Trap kinds:
 *   - 'enemy'     : warps in a hostile mech adjacent to the opener
 *   - 'explosion' : mega-damage to the opener (bypasses armor)
 *   - 'stun'      : opener loses their next own-team turn
 */
function openCrate(unit: Unit, crate: CrateEntity): void {
  if (gameOver || mode === 'animating' || aiActive) return;
  if (unit.destroyed) return;
  if (unit.immobilised) {
    setStatus(`${describeUnit(unit)} is immobilised and cannot interact.`);
    return;
  }
  if (unit.stunnedTurns > 0) {
    setStatus(`${describeUnit(unit)} is stunned — can't open crates this turn.`);
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

  // Roll for trap BEFORE inventory check — the player can trip a trap
  // even with a full pack (you don't need slot space for a booby trap).
  const trap = rollCrateTrap();

  if (!trap) {
    // Normal item drop — requires at least one free slot.
    const space = inventorySpace(unit);
    if (!space.handFree && !space.backpackFree) {
      setStatus(`${describeUnit(unit)}'s inventory is full — drop something or use a consumable first.`);
      return;
    }
    unit.ap -= CRATE_OPEN_AP_COST;
    completeCrateAsItem(unit, crate, space);
    return;
  }

  // Trapped! Spend the AP, despawn the crate, fire the effect.
  unit.ap -= CRATE_OPEN_AP_COST;
  completeCrateAsTrap(unit, crate, trap);
}

/** Normal-item completion of an open (already AP-deducted). */
function completeCrateAsItem(
  unit: Unit,
  crate: CrateEntity,
  space: { handFree: boolean; backpackFree: boolean },
): void {
  const item = rollItem(space);
  if (!item) {
    setStatus(`Crate was empty.`);
    renderDashboard();
    return;
  }
  const addr = addItem(unit.inventory, item);
  if (!addr) {
    setStatus(`${describeUnit(unit)} couldn't fit ${item.name}.`);
    renderDashboard();
    return;
  }
  applyItemPassive(unit, item);

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

/** Trap completion of an open (already AP-deducted). */
function completeCrateAsTrap(
  unit: Unit,
  crate: CrateEntity,
  trap: CrateTrapOutcome,
): void {
  const crateWorld = new THREE.Vector3();
  crate.mesh.group.getWorldPosition(crateWorld);

  despawnCrate(crate);
  showTrapCard(trap);

  switch (trap.kind) {
    case 'explosion':
      void runExplosionTrap(unit, trap, crateWorld);
      break;
    case 'stun':
      runStunTrap(unit, trap, crateWorld);
      break;
    case 'enemy':
      void runEnemyAmbushTrap(unit, trap, crate.tile);
      break;
  }
}

/**
 * Booby-trap: deals trap.damage to the opener (bypasses armor — it's a
 * point-blank explosive, not a ranged shot).
 */
async function runExplosionTrap(
  unit: Unit,
  trap: CrateTrapOutcome,
  blast: THREE.Vector3,
): Promise<void> {
  fx.impact({ position: blast });
  fx.explosion({ position: blast, scale: 1.4 });
  unit.mech.playAnimation('hit');

  const dmg = trap.damage;
  unit.hp = Math.max(0, unit.hp - dmg);
  unit.mech.setDamageLevel(
    Math.min(1, (unit.maxHp.effective - unit.hp) / unit.maxHp.effective),
  );

  if (unit.hp <= 0) {
    unit.destroyed = true;
    unit.mech.playAnimation('destroyed');
    setStatus(`${describeUnit(unit)} triggered ${trap.label} for ${dmg} damage — destroyed!`);
    sinkUnitWreckage(unit);
    renderDashboard();
    checkWinCondition();
    return;
  }

  setStatus(
    `${describeUnit(unit)} triggered ${trap.label} for ${dmg} damage. ` +
    `(HP ${unit.hp}/${unit.maxHp.effective})`,
  );
  refreshAfterAction();
  renderDashboard();
}

/** Stun-trap: opener loses their next own-team turn. */
function runStunTrap(unit: Unit, trap: CrateTrapOutcome, where: THREE.Vector3): void {
  fx.impact({ position: where });
  unit.stunnedTurns = Math.max(unit.stunnedTurns, trap.stunTurns);
  unit.mech.playAnimation('hit');
  setStatus(
    `${describeUnit(unit)} hit by ${trap.label} — stunned for ${trap.stunTurns} turn` +
    (trap.stunTurns > 1 ? 's' : '') + `.`,
  );
  refreshAfterAction();
  renderDashboard();
}

/**
 * Ambush-trap: spawn a hostile mech on a random adjacent empty tile.
 * Falls back to an explosion if there's no spot to drop the new mech.
 */
async function runEnemyAmbushTrap(
  unit: Unit,
  trap: CrateTrapOutcome,
  crateTile: HexCoord,
): Promise<void> {
  const spotTile = findAdjacentSpawnTile(crateTile);
  if (!spotTile) {
    // Crate is wedged in — no room to ambush; fall back to a small boom.
    const where = new THREE.Vector3();
    unit.mech.object.getWorldPosition(where);
    where.y = TILE_TOP_Y + 0.4;
    fx.explosion({ position: where, scale: 1.0 });
    setStatus(`${trap.label} fizzles — no adjacent tile to drop an attacker.`);
    refreshAfterAction();
    renderDashboard();
    return;
  }

  const arch = rollEnemyArchetype();
  const id = `s${++_spawnedEnemySeq}`;

  // Face the new arrival toward the opener for menace.
  const facing = hexFacingDegrees(spotTile, crateTile);
  await placeMech({ id, team: 2, tile: spotTile, facingDeg: facing, archetype: arch });

  // Warp-in beam.
  const flash = createSpawnFlash(arch.haloColor);
  const p = board.tileToWorld(spotTile);
  flash.group.position.set(p.x, TILE_TOP_Y, p.z);
  stage.scene.add(flash.group);
  activeSpawnFlashes.push(flash);

  setStatus(`${trap.label}! A ${arch.displayName} drops in at (${spotTile.q},${spotTile.r}).`);
  refreshAfterAction();
  renderDashboard();
}

/** Pick a random adjacent hex that's in-bounds, empty, and walkable. */
function findAdjacentSpawnTile(origin: HexCoord): HexCoord | null {
  const candidates: HexCoord[] = [];
  for (const dir of HEX_DIRS) {
    const h: HexCoord = { q: origin.q + dir.q, r: origin.r + dir.r };
    if (!map.hasTile(h)) continue;
    if (unitAt(h)) continue;
    if (blockingTerrainAt(h)) continue;
    candidates.push(h);
  }
  if (candidates.length === 0) return null;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

/**
 * Triggers any enemy mine on `unit.tile`. Returns true if the unit was
 * destroyed by the blast (so the walk loop can short-circuit).
 */
function triggerMineFor(unit: Unit): boolean {
  const mine = mineAt(unit.tile);
  if (!mine) return false;
  if (mine.placerTeam === unit.team) return false; // friendly mine — inert

  const rawDmg = mine.damage;
  const dmg = applyArmor(rawDmg, unit.armorThreshold);
  const deflected = rawDmg > 0 && dmg === 0;

  const p = board.tileToWorld(unit.tile);
  const blast = new THREE.Vector3(p.x, TILE_TOP_Y + 0.4, p.z);
  fx.impact({ position: blast });
  fx.explosion({ position: blast, scale: 1.25 });

  unit.hp = Math.max(0, unit.hp - dmg);
  unit.mech.setDamageLevel(
    Math.min(1, (unit.maxHp.effective - unit.hp) / unit.maxHp.effective),
  );

  despawnMine(mine);

  if (deflected) {
    unit.mech.playAnimation('hit');
    setStatus(
      `${describeUnit(unit)} stepped on a mine — ARMOR DEFLECTED ${formatDamage(rawDmg)} damage.`,
    );
    renderDashboard();
    return false;
  }

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
  if (unit.stunnedTurns > 0) {
    setStatus(`${describeUnit(unit)} is stunned — can't use items this turn.`);
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
    case 'heal':         doHeal(unit, item, addr); return;
    case 'placeMine':    doPlaceMine(unit, item, addr); return;
    case 'destroySpawn': doDestroySpawn(unit, item, addr); return;
    case 'tacticalNuke': enterNukeTargeting(unit, item, addr); return;
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

/**
 * Demo charge — destroys the closest orbital drop point within 1 hex
 * of the user (i.e. on the user's tile or any neighbor). If no drop
 * pad is in range, the item is NOT consumed (it's too valuable to
 * fat-finger).
 */
function doDestroySpawn(unit: Unit, item: Item, addr: SlotAddress): void {
  const candidates = spawnPoints
    .filter((sp) => hexDistance(unit.tile, sp.tile) <= 1)
    .sort((a, b) => hexDistance(unit.tile, a.tile) - hexDistance(unit.tile, b.tile));

  if (candidates.length === 0) {
    setStatus(
      `${describeUnit(unit)} can't plant ${item.name} here — no orbital ` +
      `drop point on or adjacent to this hex.`,
    );
    return;
  }

  const target = candidates[0];
  unit.ap -= item.active!.apCost;
  consumeItem(unit, item, addr);

  // Visual flourish — flash + impact + a one-shot warp-style burst.
  const padWorld = new THREE.Vector3();
  target.mesh.group.getWorldPosition(padWorld);
  fx.impact({ position: padWorld });
  fx.explosion({ position: padWorld, scale: 1.2 });
  const flash = createSpawnFlash('#ff9b4d', 0.7);
  flash.group.position.copy(padWorld);
  stage.scene.add(flash.group);
  activeSpawnFlashes.push(flash);

  despawnSpawnPoint(target);

  setStatus(
    `${describeUnit(unit)} planted ${item.name} on the orbital drop pad at ` +
    `(${target.tile.q},${target.tile.r}) — pad destroyed, no more reinforcements from there.`,
  );
  refreshAfterAction();
  renderDashboard();
}

/**
 * Enter the nuke-targeting interaction mode. Tile clicks become launch
 * commands; everything else cancels (handled centrally in the picker
 * event handlers).
 */
function enterNukeTargeting(unit: Unit, item: Item, addr: SlotAddress): void {
  if (mode === 'nukeTargeting' && nukeContext && nukeContext.item.id === item.id) {
    // Same nuke clicked twice → toggle off.
    cancelNukeTargeting('Nuke launch cancelled.');
    return;
  }
  if (mode === 'nukeTargeting') {
    // Different nuke / different unit — drop the previous context first.
    cancelNukeTargeting();
  }

  selectedId = unit.id;
  mode = 'nukeTargeting';
  nukeContext = { unit, item, addr, range: NUKE_RANGE };
  refreshTileVisuals(null);
  renderDashboard();
  setStatus(
    `${describeUnit(unit)} arming ${item.name}. Click a red tile within ` +
    `${nukeContext.range} hexes to launch — anywhere else cancels. ` +
    `${item.active!.amount} GIGA-damage in a 3-hex blast, bypasses armor.`,
  );
}

function cancelNukeTargeting(reason?: string): void {
  if (mode !== 'nukeTargeting') return;
  nukeContext = null;
  mode = selectedId ? 'selected' : 'idle';
  refreshTileVisuals(null);
  renderDashboard();
  if (reason) setStatus(reason);
}

function isValidNukeTarget(tile: HexCoord): boolean {
  if (!nukeContext) return false;
  if (!board.has(tile)) return false;
  if (hexEquals(tile, nukeContext.unit.tile)) return false; // can't target your own hex
  return hexDistance(nukeContext.unit.tile, tile) <= nukeContext.range;
}

/**
 * Fully resolve a tactical nuke launch. We snapshot the context up front
 * because mode flips out from under us during the animation phase.
 *
 * Damage model:
 *   - 3-hex blast pattern (`nukeBlastHexes`): target + the two farthest
 *     adjacents from the firer.
 *   - `damage` HP per affected hex — same per unit, per terrain piece.
 *   - GIGA damage: armor threshold is ignored. Friendly fire applies.
 *   - Buildings on the LINE between firer and target absorb the warhead
 *     (`resolveNukeTrajectory`) — the nuke detonates on the blocker
 *     instead of the requested tile.
 */
async function fireTacticalNuke(target: HexCoord): Promise<void> {
  if (!nukeContext) return;
  const ctx = nukeContext;
  const { unit, item, addr } = ctx;
  const damage = item.active!.amount;

  // 1) Spend AP + consume the item up front so a mid-animation game
  // over still resolves cleanly.
  unit.ap -= item.active!.apCost;
  consumeItem(unit, item, addr);
  nukeContext = null;
  mode = 'animating';
  refreshTileVisuals(null);
  renderDashboard();

  // 2) Resolve trajectory — does a building intercept the warhead?
  const isBuildingBlocker = (h: HexCoord): boolean => {
    const t = terrainAt(h);
    return !!t && !t.destroyed && t.kind === 'building';
  };
  const traj = resolveNukeTrajectory(
    unit.tile,
    target,
    hexLineBetween,
    isBuildingBlocker,
    hexKey,
  );
  const effective = traj.effectiveTarget;

  // 3) Pick the 3-hex blast pattern around the effective target.
  const blastHexes = nukeBlastHexes(unit.tile, effective, (h) => board.has(h));
  const uniqueKeys = new Set<string>();
  const blastUnique: HexCoord[] = [];
  for (const h of blastHexes) {
    const k = hexKey(h);
    if (uniqueKeys.has(k)) continue;
    uniqueKeys.add(k);
    blastUnique.push(h);
  }

  // 4) Big synchronous fireworks — impact + explosion on every hex.
  for (const h of blastUnique) {
    const p = board.tileToWorld(h);
    const where = new THREE.Vector3(p.x, TILE_TOP_Y + 0.4, p.z);
    fx.impact({ position: where });
    fx.explosion({ position: where, scale: 1.5 });
  }

  // 5) Apply damage. Track hit log for the status line.
  const hitLog: string[] = [];
  for (const h of blastUnique) {
    // Units
    const target = unitAt(h);
    if (target && !target.destroyed) {
      const before = target.hp;
      target.hp = Math.max(0, target.hp - damage); // bypass armor
      target.mech.setDamageLevel(
        Math.min(1, (target.maxHp.effective - target.hp) / target.maxHp.effective),
      );
      target.mech.playAnimation('hit');

      if (target.hp <= 0) {
        target.destroyed = true;
        const techMsg = (target.team === 2 && unit.team === 1)
          ? registerPlayerKill(unit)
          : '';
        const torso = target.mech.getAttachPoint('torso');
        if (torso) {
          const w = new THREE.Vector3();
          torso.getWorldPosition(w);
          fx.explosion({ position: w, scale: 1.4 });
        }
        target.mech.playAnimation('destroyed');
        sinkUnitWreckage(target);
        hitLog.push(`destroyed ${describeUnit(target)}${techMsg}`);
      } else {
        hitLog.push(`${describeUnit(target)} -${before - target.hp} HP`);
      }
    }

    // Terrain
    const t = terrainAt(h);
    if (t && t.hp !== undefined && !t.destroyed) {
      const wasDestroyed = t.takeDamage(damage);
      if (wasDestroyed && t.kind !== 'building') {
        replaceWithRubble(t);
      }
    }
  }

  // 6) Also damage any building that absorbed the warhead in flight.
  if (traj.blockedByTileKey) {
    const blocker = terrainPieces.find(
      (t) => !t.destroyed && hexKey(t.tile) === traj.blockedByTileKey,
    );
    if (blocker && blocker.hp !== undefined) {
      const p = board.tileToWorld(blocker.tile);
      fx.explosion({ position: new THREE.Vector3(p.x, TILE_TOP_Y + 0.4, p.z), scale: 1.3 });
      const wasDestroyed = blocker.takeDamage(damage);
      if (wasDestroyed && blocker.kind !== 'building') {
        replaceWithRubble(blocker);
      }
    }
  }

  // 7) Status line.
  const trajMsg = traj.blockedByTileKey
    ? ` (warhead clipped a building en route at ${traj.blockedByTileKey.replace('_', ',')})`
    : '';
  const summary = hitLog.length > 0 ? hitLog.join('; ') : 'no targets caught in the blast';
  setStatus(
    `${describeUnit(unit)} launched ${item.name} → ` +
    `(${effective.q},${effective.r})${trajMsg}. ${summary}.`,
  );

  // 8) Hand control back.
  mode = selectedId ? 'selected' : 'idle';
  if (selectedId) {
    const s = units.find((u) => u.id === selectedId);
    if (s && !s.destroyed) recomputeReachable(s);
  }
  refreshAfterAction();
  renderDashboard();
  checkWinCondition();
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
  if (shooter.stunnedTurns > 0) {
    setStatus(`${describeUnit(shooter)} is stunned — can't fire this turn.`);
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
  if (!canShootAtTile(shooter, target.tile)) {
    setStatus(
      `${describeUnit(shooter)} can only fire forward — pivot with , / . ` +
      `(heavy costs 1 AP per turn).`,
    );
    return;
  }

  if (isCoopActive()) {
    if (!canControlUnit(shooter.id)) {
      setStatus('Not your sub-phase.');
      return;
    }
    sendCoopAction({
      kind: 'shoot',
      unitId: shooter.id,
      targetUnitId: target.id,
    });
    return;
  }

  const { mult, buildingsCrossed } = coverMultiplier(shooter.tile, target.tile);
  const hg = highGroundBonus(shooter, target);
  const rawDamage = (shooter.damage.effective + hg) * mult;
  // Armor threshold applies LAST — after cover and high-ground are baked
  // into a single per-shot value. Sub-threshold shots fully deflect.
  const damage = applyArmor(rawDamage, target.armorThreshold);
  const deflected = rawDamage > 0 && damage === 0;

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

  if (deflected) {
    setStatus(
      `${describeUnit(target)} ARMOR DEFLECTS ${formatDamage(rawDamage)} damage ` +
      `(needs ≥ ${target.armorThreshold} per shot).`,
    );
  } else if (target.hp <= 0) {
    target.destroyed = true;
    const techMsg = target.team === 2 ? registerPlayerKill(shooter) : '';
    if (torsoTgt) fx.explosion({ position: targetWorld, scale: 1.4 });
    target.mech.playAnimation('destroyed');
    setStatus(
      `${describeUnit(target)} destroyed by ${describeUnit(shooter)}${modStr}.${techMsg}`,
    );
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
  if (shooter.stunnedTurns > 0) {
    setStatus(`${describeUnit(shooter)} is stunned — can't fire this turn.`);
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
  if (!canShootAtTile(shooter, terrain.tile)) {
    setStatus(
      `${describeUnit(shooter)} can only fire forward — pivot with , / . ` +
      `(heavy costs 1 AP per turn).`,
    );
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
  // Buildings self-transform across four destruction stages (intact →
  // bombed-out → heavy rubble → rough terrain) — they own their own
  // visual + walkability flips, so we never swap them out.
  if (terrain.kind === 'building') return;

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
  const slots = isCoopActive() && coopPlayerId()
    ? units.filter((u) => u.ownerId === coopPlayerId() && u.team === 1)
    : units.filter((u) => u.team === dashboardTeam).slice(0, DASHBOARD_SLOTS);

  dashboardEl.innerHTML = '';

  for (const u of slots) {
    const slot = buildDashSlot(u);
    dashboardEl.appendChild(slot);
  }

  if (!isCoopActive()) {
    for (let i = slots.length; i < DASHBOARD_SLOTS; i++) {
      const empty = document.createElement('div');
      empty.className = 'dash-empty';
      empty.textContent = '— empty slot —';
      dashboardEl.appendChild(empty);
    }
  }
}

function buildDashSlot(u: Unit): HTMLElement {
  const slot = document.createElement('div');
  slot.className = 'dash-slot';
  slot.dataset.unitId = u.id;

  if (u.id === selectedId) slot.classList.add('selected');
  if (u.destroyed) slot.classList.add('destroyed');
  else if (u.immobilised) slot.classList.add('immobilised');

  const playerTurn = isCoopActive()
    ? canControlUnit(u.id)
    : teamControllers[currentTeam] === 'human' && currentTeam === u.team;
  const cardClickable = !u.destroyed && !gameOver && !aiActive && playerTurn;
  if (!cardClickable) slot.classList.add('locked');

  const maxHp = u.maxHp.effective;
  const maxAp = u.maxAp.effective;
  const hpPct = maxHp > 0 ? Math.max(0, (u.hp / maxHp) * 100) : 0;
  const apPct = maxAp > 0 ? Math.max(0, (u.ap / maxAp) * 100) : 0;

  const onCrate = !u.destroyed && !u.immobilised && !u.stunnedTurns && crateAt(u.tile);
  const armorBadge = u.armorThreshold > 0
    ? `<span class="tag armored" title="Deflects damage below ${u.armorThreshold} per shot">ARMOR ${u.armorThreshold}</span>`
    : '';
  const statusTag = u.destroyed
    ? '<span class="tag destroyed">DESTROYED</span>'
    : u.immobilised
      ? '<span class="tag immobilised">IMMOBILE</span>'
      : u.stunnedTurns > 0
        ? `<span class="tag stunned">STUNNED (${u.stunnedTurns})</span>`
        : onCrate
          ? '<span class="tag crate">ON CRATE</span>'
          : `<span class="tag">${u.className.toUpperCase()}</span>`;

  const techBonus = apBonusFromKills(u.techKills);
  const techTag = u.team === 1
    ? `<div class="dash-bar dash-tech"><label>T</label><span>${u.techKills} kills · +${techBonus} AP</span></div>`
    : '';

  // Header + bars (click-to-select on header area).
  const header = document.createElement('div');
  header.className = 'dash-head';
  header.innerHTML = `
    <div class="dash-name">
      <span>${teamName(u.team)} ${u.id.toUpperCase()}</span>
      <span class="tag-row">${armorBadge}${statusTag}</span>
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
    ${techTag}
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

    // 1) In range, in arc (heavy), and can afford a shot → fire.
    if (
      dist <= range &&
      mech.ap >= AP_COST.shoot &&
      canShootAtTile(mech, target.tile)
    ) {
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
  const reach = pf.reachable(mech.tile, moveBudget(mech));

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
    archetype: ArchetypeKey; className: string;
    destroyed: boolean; immobilised: boolean; stunnedTurns: number;
    armorThreshold: number;
    movementMode: MovementMode; movementRange: number;
    ap: number; hp: number;
    maxAp: StatSnapshot; maxHp: StatSnapshot; damage: StatSnapshot; attackRange: StatSnapshot;
    inventory: InventorySnapshot;
  }>;
  terrain(): Array<{
    id: string; kind: string; tile: HexCoord; destroyed: boolean;
    hp?: number; maxHp?: number; blocksMovement: boolean; walkable: boolean; topY: number;
    /** Buildings expose 0-3 (intact → rough terrain). Other pieces: undefined. */
    destructionStage?: 0 | 1 | 2 | 3;
  }>;
  crates(): Array<{ id: string; tile: HexCoord }>;
  mines(): Array<{ tile: HexCoord; damage: number; placerTeam: 1 | 2 }>;
  /** List the team-2 orbital drop points. */
  spawnPoints(): Array<{ id: string; tile: HexCoord }>;
  /** Manually destroy a drop point by id. Returns true on success. */
  destroySpawnPoint(id: string): boolean;
  /**
   * Detonate a tactical nuke from `unitId`'s position at the given
   * target tile. Bypasses targeting UI / range / AP checks — purely
   * for testing the blast resolution. Returns true on launch.
   */
  fireNuke(unitId: string, target: HexCoord, damage?: number): Promise<boolean>;
  /**
   * Force a drop-point cycle right now (independent of the turn flow).
   * Returns the number of enemies dropped.
   */
  tickSpawnPoints(): Promise<number>;
  /** Manually warp in an enemy of any archetype at any tile. */
  spawnEnemy(archetype: ArchetypeKey, tile: HexCoord): Promise<string | null>;
  /** Apply a stun (skip own-team turns) to a unit. Returns success. */
  stun(unitId: string, turns: number): boolean;
  /**
   * Pivot the unit 60° in the given direction. Heavy chassis spends 1 AP,
   * light/medium are free. Returns true on success.
   */
  turnUnit(unitId: string, direction: 'left' | 'right'): boolean;
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
  | { kind: 'weapon';       damage: number; name?: string }
  | { kind: 'armor';        hp: number;     name?: string }
  | { kind: 'rangeModule';  range: number;  name?: string }
  | { kind: 'repairKit';    heal: number;   name?: string }
  | { kind: 'mine';         damage: number; name?: string }
  | { kind: 'demoCharge';   name?: string }
  | { kind: 'tacticalNuke'; damage?: number; name?: string };

function buildItemFromSpec(spec: GiveItemSpec): Item {
  switch (spec.kind) {
    case 'weapon':       return makeWeapon(spec.damage, spec.name);
    case 'armor':        return makeArmor(spec.hp, spec.name);
    case 'rangeModule':  return makeRangeModule(spec.range, spec.name);
    case 'repairKit':    return makeRepairKit(spec.heal, spec.name);
    case 'mine':         return makeMine(spec.damage, spec.name);
    case 'demoCharge':   return makeDemoCharge(spec.name);
    case 'tacticalNuke': return makeTacticalNuke(spec.damage ?? 3, spec.name);
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
      archetype: u.archetypeKey, className: u.className,
      destroyed: u.destroyed, immobilised: u.immobilised, stunnedTurns: u.stunnedTurns,
      armorThreshold: u.armorThreshold,
      movementMode: u.movementMode, movementRange: u.movementRange,
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
      destructionStage: t.getDestructionStage?.(),
    })),
  crates: () =>
    crates.map((c) => ({ id: c.id, tile: { ...c.tile } })),
  mines: () =>
    mines.map((m) => ({ tile: { ...m.tile }, damage: m.damage, placerTeam: m.placerTeam })),
  spawnPoints: () =>
    spawnPoints.map((sp) => ({ id: sp.id, tile: { ...sp.tile } })),
  destroySpawnPoint(id) {
    const sp = spawnPoints.find((s) => s.id === id);
    if (!sp) return false;
    despawnSpawnPoint(sp);
    setStatus(`Devtools: destroyed orbital drop pad ${id}.`);
    return true;
  },
  async fireNuke(unitId, target, damage) {
    const u = units.find((x) => x.id === unitId);
    if (!u || u.destroyed) return false;
    // Synthesize a one-shot context that doesn't require the item to
    // exist in inventory — devtools bypasses the targeting UI entirely.
    const item = makeTacticalNuke(damage ?? 3);
    const addr = addItem(u.inventory, item);
    if (!addr) return false; // inventory full
    nukeContext = { unit: u, item, addr, range: 999 };
    mode = 'nukeTargeting';
    await fireTacticalNuke(target);
    return true;
  },
  tickSpawnPoints: () => tickSpawnPoints(),
  async spawnEnemy(archetypeKey, tile) {
    const arch = ARCHETYPES[archetypeKey];
    if (!arch) return null;
    if (!map.hasTile(tile)) return null;
    if (unitAt(tile)) return null;
    if (blockingTerrainAt(tile)) return null;
    const id = `s${++_spawnedEnemySeq}`;
    await placeMech({ id, team: 2, tile, facingDeg: 90, archetype: arch });
    renderDashboard();
    return id;
  },
  stun(unitId, turns) {
    const u = units.find((x) => x.id === unitId);
    if (!u || u.destroyed) return false;
    u.stunnedTurns = Math.max(0, Math.floor(turns));
    if (u.team === currentTeam) u.ap = 0;
    renderDashboard();
    if (selectedId === u.id) setStatus(describeSelection(u));
    return true;
  },
  turnUnit(unitId, direction) {
    const u = units.find((x) => x.id === unitId);
    if (!u) return false;
    return doTurnUnit(u, direction);
  },
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

// Move-cost overlay: keep AP labels glued to reachable hexes as the camera moves.
stage.addTicker(() => {
  updateMoveCostOverlay();
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
  itemCardEl?.classList.remove('visible', 'trap');
}

/**
 * Trap version of the reveal card. Same DOM node, red theme, "TRAP!"
 * banner instead of "SUPPLIES".
 */
function showTrapCard(trap: CrateTrapOutcome): void {
  if (!itemCardEl) return;

  const icon =
    trap.kind === 'enemy' ? '!' :
    trap.kind === 'explosion' ? '\u2620' : // skull
                                '\u26A1';   // bolt
  const color =
    trap.kind === 'enemy' ? '#ff5c6c' :
    trap.kind === 'explosion' ? '#ff9b4d' :
                                '#ffce4d';

  const effectLines: string[] = [];
  if (trap.damage > 0)    effectLines.push(`Mega-damage: ${trap.damage} (bypasses armor)`);
  if (trap.stunTurns > 0) effectLines.push(`Stun: skip ${trap.stunTurns} own-team turn` + (trap.stunTurns > 1 ? 's' : ''));
  if (trap.kind === 'enemy') effectLines.push('Hostile reinforcement deployed adjacent');

  itemCardEl.innerHTML = `
    <div class="item-card-flash">! TRAP TRIGGERED !</div>
    <div class="item-card-row">
      <div class="item-card-icon" style="border-color:${color};color:${color};">${icon}</div>
      <div class="item-card-title">
        <div class="item-card-name" style="color:${color};">${escapeHtml(trap.label)}</div>
        <div class="item-card-kind">${trap.kind.toUpperCase()} TRAP</div>
      </div>
    </div>
    <div class="item-card-desc">${escapeHtml(trap.description)}</div>
    ${effectLines.length
      ? `<ul class="item-card-stats">${effectLines.map((l) => `<li>${escapeHtml(l)}</li>`).join('')}</ul>`
      : ''}
  `;
  itemCardEl.classList.add('visible', 'trap');

  if (itemCardHideTimer !== null) window.clearTimeout(itemCardHideTimer);
  itemCardHideTimer = window.setTimeout(() => {
    itemCardEl.classList.remove('visible', 'trap');
    itemCardHideTimer = null;
  }, 7000);
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
