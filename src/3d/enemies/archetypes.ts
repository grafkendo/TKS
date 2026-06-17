// ============================================================================
// Enemy archetypes — stat profiles for non-player mechs.
//
// Each archetype bundles together the combat parameters that distinguish
// one enemy type from another:
//   - apMax        : action budget per turn
//   - hpMax        : starting / max hit points
//   - damage       : damage per shot
//   - attackRange  : firing range in hexes
//   - movementMode :
//       'per-hex'  → each hex step costs `apCostPerStep` (player-style)
//       'burst'    → one move ACTION costs 1 AP and walks up to
//                    `movementRange` hexes (minion-style)
//   - movementRange: max hexes per move action (burst) OR informational
//                    cap for per-hex units
//   - armorThreshold: incoming shots below this damage value are
//                    DEFLECTED (deal 0 HP damage). Default 0 = unarmored.
//   - chassis / visualScale / accentColor: how the procedural mech is
//                    rendered for this archetype.
//
// PURE data + lookup. No Three.js, no DOM.
// ============================================================================

import type { ChassisType, WeaponType } from '../mech/types';

export type ArchetypeKey = 'elite' | 'grunt' | 'scout' | 'armored' | 'tank';
export type MovementMode = 'per-hex' | 'burst';

export interface EnemyArchetype {
  key: ArchetypeKey;
  displayName: string;
  description: string;

  // Combat stats
  apMax: number;
  hpMax: number;
  damage: number;
  attackRange: number;
  armorThreshold: number;

  // Movement
  movementMode: MovementMode;
  movementRange: number;

  // Render
  chassis: ChassisType;
  weaponRight: WeaponType;
  weaponLeft?: WeaponType;
  visualScale: number;
  /** Hex-color tint applied to the under-disc ring. Helps identify minions. */
  haloColor: string;
}

/** Extra multiplier for team-2 mech meshes (on top of archetype visualScale). */
export const ENEMY_TEAM_VISUAL_SCALE = 2.5;

/** Player mech mesh scale (team 1). */
export const PLAYER_TEAM_VISUAL_SCALE = 0.85;

/** The original team-1 / team-2 mech statline. Player-grade — three AP, per-hex movement. */
export const ELITE: EnemyArchetype = {
  key: 'elite',
  displayName: 'Mech',
  description: 'Standard-issue tactical mech. 3 AP, per-hex movement.',
  apMax: 3,
  hpMax: 3,
  damage: 1,
  attackRange: 2,
  armorThreshold: 0,
  movementMode: 'per-hex',
  movementRange: 99, // effectively gated by AP
  chassis: 'straznik',
  weaponRight: 'cannon',
  visualScale: 1.0,
  haloColor: '#ffce4d',
};

/** Light, fragile, single-hex shuffler. */
export const GRUNT: EnemyArchetype = {
  key: 'grunt',
  displayName: 'Grunt',
  description: '1 AP, moves 1 hex per turn, 1 HP. Basic spider drone.',
  apMax: 1,
  hpMax: 1,
  damage: 1,
  attackRange: 1,
  armorThreshold: 0,
  movementMode: 'burst',
  movementRange: 1,
  chassis: 'straznik',
  weaponRight: 'beam',
  visualScale: 0.85,
  haloColor: '#7a8a9b',
};

/** Same fragility as grunt, but covers two hexes in a single 1-AP dash. */
export const SCOUT: EnemyArchetype = {
  key: 'scout',
  displayName: 'Scout',
  description: '1 AP, dashes 2 hexes per move, 1 HP. Fast Straznik scout.',
  apMax: 1,
  hpMax: 1,
  damage: 1,
  attackRange: 1,
  armorThreshold: 0,
  movementMode: 'burst',
  movementRange: 2,
  chassis: 'straznik',
  weaponRight: 'cannon',
  visualScale: 0.9,
  haloColor: '#4dc0ff',
};

/**
 * Slow but armored: deflects any single shot of damage < 2.
 * Use cannons / weapons of damage ≥ 2 to break it.
 */
export const ARMORED: EnemyArchetype = {
  key: 'armored',
  displayName: 'Armored',
  description: '1 AP, 1 hex, 2 HP, deflects all damage below 2 (mega-damage required).',
  apMax: 1,
  hpMax: 2,
  damage: 1,
  attackRange: 1,
  armorThreshold: 2,
  movementMode: 'burst',
  movementRange: 1,
  chassis: 'straznik',
  weaponRight: 'cannon',
  visualScale: 1.05,
  haloColor: '#ff5c6c',
};

/**
 * Heavy combat tank — slow, tough, needs high-damage weapons to pierce armor.
 * Uses the Atreides Combat Tank model.
 */
export const TANK: EnemyArchetype = {
  key: 'tank',
  displayName: 'Tank',
  description: '1 AP, 1 hex, 3 HP, deflects damage below 2. Atreides combat tank.',
  apMax: 1,
  hpMax: 3,
  damage: 1,
  attackRange: 2,
  armorThreshold: 2,
  movementMode: 'burst',
  movementRange: 1,
  chassis: 'atreides',
  weaponRight: 'cannon',
  visualScale: 1.0,
  haloColor: '#d4a44a',
};

export const ARCHETYPES: Record<ArchetypeKey, EnemyArchetype> = {
  elite: ELITE,
  grunt: GRUNT,
  scout: SCOUT,
  armored: ARMORED,
  tank: TANK,
};

/** Spawnable enemy types (excludes 'elite'). */
export const SPAWNABLE_ENEMY_KEYS: ReadonlyArray<ArchetypeKey> = [
  'grunt', 'scout', 'armored', 'tank',
];

/**
 * Weighted spawn table — armored is intentionally rare since it's the
 * tankiest type (mega-damage required to break it). Tune freely; sum
 * is irrelevant.
 */
export const SPAWN_WEIGHTS: ReadonlyArray<{ key: ArchetypeKey; weight: number }> = [
  { key: 'grunt',   weight: 50 },
  { key: 'scout',   weight: 30 },
  { key: 'armored', weight: 8 },
  { key: 'tank',    weight: 12 },
];

/**
 * Roll a random spawnable enemy. `rand` is injectable for tests.
 * Selection is weighted by {@link SPAWN_WEIGHTS}.
 */
export function rollEnemyArchetype(rand: () => number = Math.random): EnemyArchetype {
  const total = SPAWN_WEIGHTS.reduce((s, e) => s + e.weight, 0);
  let r = rand() * total;
  for (const e of SPAWN_WEIGHTS) {
    r -= e.weight;
    if (r <= 0) return ARCHETYPES[e.key];
  }
  return ARCHETYPES[SPAWN_WEIGHTS[SPAWN_WEIGHTS.length - 1].key];
}

/**
 * Apply the archetype's armor rule to an incoming damage value.
 * Returns the actual HP loss after the threshold check.
 *
 * Pure function so it's trivially testable.
 */
export function applyArmor(rawDamage: number, armorThreshold: number): number {
  if (rawDamage <= 0) return 0;
  if (rawDamage < armorThreshold) return 0;
  return rawDamage;
}
