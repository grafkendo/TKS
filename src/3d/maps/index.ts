import { buildUrbanMap } from './urban';
import { buildBattlefieldMap } from './battlefield';
import type { MapBuildResult } from './types';

export type { MapBuildResult, MapSpawns } from './types';

/**
 * Pick a map from the URL query (`?map=urban` | `?map=battlefield`).
 * Defaults to the large battlefield layout.
 */
export function buildMapFromUrl(): MapBuildResult {
  const params = new URLSearchParams(
    typeof window !== 'undefined' ? window.location.search : '',
  );
  const id = params.get('map') ?? 'battlefield';
  if (id === 'urban') return buildUrbanMap();
  return buildBattlefieldMap();
}
