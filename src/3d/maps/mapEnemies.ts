// ============================================================================
// Per-map enemy roster — which archetypes can spawn on each battlefield.
// ============================================================================

import { SPAWNABLE_ENEMY_KEYS, type ArchetypeKey } from '../enemies/archetypes';
import type { MapOptionId } from './index';

/** Enemy archetypes that appear via starting units and orbital drop pads. */
export const MAP_ENEMY_ROSTER: Record<MapOptionId, readonly ArchetypeKey[]> = {
  quadrants: SPAWNABLE_ENEMY_KEYS,
  battlefield: SPAWNABLE_ENEMY_KEYS,
  urban: SPAWNABLE_ENEMY_KEYS,
};

export function enemiesForMap(mapId: string): readonly ArchetypeKey[] {
  return MAP_ENEMY_ROSTER[mapId as MapOptionId] ?? SPAWNABLE_ENEMY_KEYS;
}
