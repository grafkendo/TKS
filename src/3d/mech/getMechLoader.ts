// ============================================================================
// Shared mech loader — registers glTF paths once per session.
// ============================================================================

import { DefaultAssetLoader } from './AssetLoader';
import { MECH_GLTF_PATHS } from './mechAssets';
import type { ChassisType } from './types';

let shared: DefaultAssetLoader | null = null;

export function getMechLoader(): DefaultAssetLoader {
  if (!shared) {
    shared = new DefaultAssetLoader();
    for (const [chassis, url] of Object.entries(MECH_GLTF_PATHS)) {
      if (url) shared.registerGltf(chassis as ChassisType, url);
    }
  }
  return shared;
}
