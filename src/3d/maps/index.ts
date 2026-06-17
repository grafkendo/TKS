import { buildUrbanMap } from './urban';
import { buildBattlefieldMap } from './battlefield';
import { buildQuadrantsMap } from './quadrants';
import type { MapBuildResult } from './types';

export type { MapBuildResult, MapSpawns } from './types';

const MAP_BUILDERS: Record<string, () => MapBuildResult> = {
  urban: buildUrbanMap,
  battlefield: buildBattlefieldMap,
  quadrants: buildQuadrantsMap,
};

/**
 * Pick a map from the URL query (`?map=quadrants` | `?map=battlefield` | `?map=urban`).
 * Defaults to the four-quadrant capture layout.
 */
export function buildMapFromUrl(): MapBuildResult {
  const params = new URLSearchParams(
    typeof window !== 'undefined' ? window.location.search : '',
  );
  const id = params.get('map') ?? 'quadrants';
  const build = MAP_BUILDERS[id] ?? buildQuadrantsMap;
  return build();
}

export function buildMapById(id: string): MapBuildResult {
  const build = MAP_BUILDERS[id] ?? buildQuadrantsMap;
  return build();
}

/** Launcher / UI map picker entries. */
export const MAP_OPTIONS = [
  {
    id: 'quadrants',
    name: 'Four Quadrants',
    description: 'Wide map, cross roads, capture all 4 objectives to win.',
  },
  {
    id: 'battlefield',
    name: 'Battlefield',
    description: 'Large city core, dense cover, elimination-focused.',
  },
  {
    id: 'urban',
    name: 'Urban',
    description: 'Compact disk — fast skirmishes, no objectives.',
  },
] as const;

export type MapOptionId = (typeof MAP_OPTIONS)[number]['id'];
