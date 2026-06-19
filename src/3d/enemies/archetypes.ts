// ============================================================================
// Enemy archetypes — stat profiles for non-player mechs.
// ============================================================================

import type { ChassisType, WeaponType } from '../mech/types';

export type ArchetypeKey =
  | 'elite'
  | 'grunt'
  | 'scout'
  | 'armored'
  | 'tank'
  | 'striker'
  | 'brute';

export type MovementMode = 'per-hex' | 'burst';

export interface EnemyArchetype {
  key: ArchetypeKey;
  displayName: string;
  description: string;

  apMax: number;
  hpMax: number;
  damage: number;
  attackRange: number;
  armorThreshold: number;

  movementMode: MovementMode;
  movementRange: number;

  chassis: ChassisType;
  weaponRight: WeaponType;
  weaponLeft?: WeaponType;
  visualScale: number;
  haloColor: string;
}

/** Extra multiplier for team-2 mech meshes (on top of archetype visualScale). */
export const ENEMY_TEAM_VISUAL_SCALE = 2.0;

/** Player mech mesh scale (team 1) — applied after height normalization. */
export const PLAYER_TEAM_VISUAL_SCALE = 1.0;

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
  movementRange: 99,
  chassis: 'straznik',
  weaponRight: 'cannon',
  visualScale: 1.0,
  haloColor: '#ffce4d',
};

/** Grunt — basic fodder, dies in one hit. */
export const GRUNT: EnemyArchetype = {
  key: 'grunt',
  displayName: 'Grunt',
  description: '1 AP, 1 hex, 1 HP. Fragile fodder — rush it down.',
  apMax: 1,
  hpMax: 1,
  damage: 1,
  attackRange: 1,
  armorThreshold: 0,
  movementMode: 'burst',
  movementRange: 1,
  chassis: 'cbp0',
  weaponRight: 'beam',
  visualScale: 0.51,
  haloColor: '#7a8a9b',
};

/** Scout — fast dash harasser. */
export const SCOUT: EnemyArchetype = {
  key: 'scout',
  displayName: 'Scout',
  description: '1 AP, 2-hex dash, 1 HP. Fast scout mech.',
  apMax: 1,
  hpMax: 1,
  damage: 1,
  attackRange: 1,
  armorThreshold: 0,
  movementMode: 'burst',
  movementRange: 2,
  chassis: 'cbp1',
  weaponRight: 'cannon',
  visualScale: 0.9,
  haloColor: '#4dc0ff',
};

/** Armored — frontline bulwark. */
export const ARMORED: EnemyArchetype = {
  key: 'armored',
  displayName: 'Armored',
  description: '1 AP, 1 hex, 2 HP, deflects damage below 2. Blocks lanes until cracked.',
  apMax: 1,
  hpMax: 2,
  damage: 1,
  attackRange: 1,
  armorThreshold: 2,
  movementMode: 'burst',
  movementRange: 1,
  chassis: 'cbp2',
  weaponRight: 'cannon',
  visualScale: 1.05,
  haloColor: '#ff5c6c',
};

/** Tank — tough and armored. */
export const TANK: EnemyArchetype = {
  key: 'tank',
  displayName: 'Tank',
  description: '1 AP, 1 hex, 3 HP, deflects damage below 2. Heavy combat mech.',
  apMax: 1,
  hpMax: 3,
  damage: 1,
  attackRange: 2,
  armorThreshold: 2,
  movementMode: 'burst',
  movementRange: 1,
  chassis: 'cbp3',
  weaponRight: 'cannon',
  visualScale: 0.6,
  haloColor: '#d4a44a',
};

/** Striker — fast assault variant. */
export const STRIKER: EnemyArchetype = {
  key: 'striker',
  displayName: 'Striker',
  description: '1 AP, 2-hex dash, 1 HP. Aggressive flanker.',
  apMax: 1,
  hpMax: 1,
  damage: 1,
  attackRange: 1,
  armorThreshold: 0,
  movementMode: 'burst',
  movementRange: 2,
  chassis: 'cbp4',
  weaponRight: 'beam',
  visualScale: 0.85,
  haloColor: '#9b6cff',
};

/** Brute — armored brawler. */
export const BRUTE: EnemyArchetype = {
  key: 'brute',
  displayName: 'Brute',
  description: '1 AP, 1 hex, 2 HP, deflects damage below 2. Slow but durable.',
  apMax: 1,
  hpMax: 2,
  damage: 1,
  attackRange: 1,
  armorThreshold: 2,
  movementMode: 'burst',
  movementRange: 1,
  chassis: 'cbp5',
  weaponRight: 'cannon',
  visualScale: 1.1,
  haloColor: '#e85d3a',
};

export const ARCHETYPES: Record<ArchetypeKey, EnemyArchetype> = {
  elite: ELITE,
  grunt: GRUNT,
  scout: SCOUT,
  armored: ARMORED,
  tank: TANK,
  striker: STRIKER,
  brute: BRUTE,
};

export const SPAWNABLE_ENEMY_KEYS: ReadonlyArray<ArchetypeKey> = [
  'grunt',
  'scout',
  'armored',
  'tank',
  'striker',
  'brute',
];

export const SPAWN_WEIGHTS: ReadonlyArray<{ key: ArchetypeKey; weight: number }> = [
  { key: 'grunt', weight: 25 },
  { key: 'scout', weight: 18 },
  { key: 'armored', weight: 18 },
  { key: 'tank', weight: 15 },
  { key: 'striker', weight: 14 },
  { key: 'brute', weight: 10 },
];

export function rollEnemyArchetype(rand: () => number = Math.random): EnemyArchetype {
  const total = SPAWN_WEIGHTS.reduce((s, e) => s + e.weight, 0);
  let r = rand() * total;
  for (const e of SPAWN_WEIGHTS) {
    r -= e.weight;
    if (r <= 0) return ARCHETYPES[e.key];
  }
  return ARCHETYPES[SPAWN_WEIGHTS[SPAWN_WEIGHTS.length - 1].key];
}

export function applyArmor(rawDamage: number, armorThreshold: number): number {
  if (rawDamage <= 0) return 0;
  if (rawDamage < armorThreshold) return 0;
  return rawDamage;
}
