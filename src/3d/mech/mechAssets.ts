// ============================================================================
// Mech glTF paths — drop Blender exports into public/assets/mechs/.
// ============================================================================

import type { ChassisType } from './types';

/**
 * Relative URLs (served from /public). Missing files fall back to PrimitiveMech.
 *
 * Export one file per chassis:
 *   public/assets/mechs/light.glb
 *   public/assets/mechs/medium.glb
 *   public/assets/mechs/heavy.glb   (W9231 Combat Mech — see w9231_license.txt)
 *   public/assets/mechs/straznik.glb  (Iron Harvest Straznik — enemy bots)
 *   public/assets/mechs/atreides.glb  (Atreides Combat Tank — tank enemy)
 */
export const MECH_GLTF_PATHS: Partial<Record<ChassisType, string>> = {
  light: '/assets/mechs/light.glb',
  medium: '/assets/mechs/medium.glb',
  heavy: '/assets/mechs/heavy.glb',
  straznik: '/assets/mechs/straznik.glb',
  atreides: '/assets/mechs/atreides.glb',
};
