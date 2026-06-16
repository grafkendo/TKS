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
 *   public/assets/mechs/heavy.glb
 */
export const MECH_GLTF_PATHS: Partial<Record<ChassisType, string>> = {
  light: '/assets/mechs/light.glb',
  medium: '/assets/mechs/medium.glb',
  heavy: '/assets/mechs/heavy.glb',
};
