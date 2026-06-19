// ============================================================================
// Co-op enemy unit factory — rolls archetype stats for team-2 spawns.
// ============================================================================

import { ARCHETYPES, rollEnemyArchetype, type ArchetypeKey } from '../enemies/archetypes';
import type { CoopUnit } from './types';

const FACING = 90;

export function makeCoopEnemy(
  id: string,
  tile: { q: number; r: number },
  rand: () => number = Math.random,
  archetypeKey?: ArchetypeKey,
): CoopUnit {
  const arch = archetypeKey ? ARCHETYPES[archetypeKey] : rollEnemyArchetype(rand);
  return {
    id,
    team: 2,
    ownerId: null,
    tile,
    chassis: 'medium',
    hp: arch.hpMax,
    maxHp: arch.hpMax,
    ap: arch.apMax,
    maxAp: arch.apMax,
    damage: arch.damage,
    attackRange: arch.attackRange,
    facingDeg: FACING,
    destroyed: false,
    techKills: 0,
    items: [],
    archetypeKey: arch.key,
  };
}
