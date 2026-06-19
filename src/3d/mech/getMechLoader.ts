// ============================================================================
// Shared mech loader — registers glTF paths once per session.
// ============================================================================

import { DefaultAssetLoader } from './AssetLoader';
import { BOOT_PRELOAD_CHASSIS, MECH_GLTF_PATHS } from './mechAssets';
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

/** Preload player mechs at boot (lobby + first spawn). Enemy glbs load on demand. */
export async function preloadPlayerMechGltfs(): Promise<void> {
  const loader = getMechLoader();
  await Promise.allSettled(BOOT_PRELOAD_CHASSIS.map((chassis) => loader.preloadGltf(chassis)));
}

/** Warm a single chassis into the glTF cache (e.g. before a wave spawns). */
export async function preloadMechGltf(chassis: ChassisType): Promise<void> {
  await getMechLoader().preloadGltf(chassis);
}
