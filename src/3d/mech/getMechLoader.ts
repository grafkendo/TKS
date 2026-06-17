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

/** Warm the glTF cache so first enemy spawn doesn't hitch. */
export async function preloadMechGltfs(): Promise<void> {
  const loader = getMechLoader();
  await Promise.allSettled(
    (Object.keys(MECH_GLTF_PATHS) as ChassisType[]).map((chassis) => loader.preloadGltf(chassis)),
  );
}
