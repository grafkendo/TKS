import { describe, expect, it } from 'vitest';

import { SPAWNABLE_ENEMY_KEYS } from '../enemies/archetypes';
import { enemiesForMap, MAP_ENEMY_ROSTER } from './mapEnemies';

describe('mapEnemies', () => {
  it('lists all spawnable enemies on each playable map', () => {
    for (const mapId of Object.keys(MAP_ENEMY_ROSTER)) {
      expect(enemiesForMap(mapId)).toEqual(SPAWNABLE_ENEMY_KEYS);
    }
  });

  it('falls back to spawnable keys for unknown map ids', () => {
    expect(enemiesForMap('missing')).toEqual(SPAWNABLE_ENEMY_KEYS);
  });
});
