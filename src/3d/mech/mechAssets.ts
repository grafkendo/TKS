// ============================================================================
// Mech glTF paths — drop Blender exports into public/assets/mechs/.
// ============================================================================

import type { ChassisType } from './types';

/**
 * Relative URLs (served from /public). Missing files fall back to PrimitiveMech.
 *
 * Export one file per chassis:
 *   public/assets/mechs/light.glb   (w82yuu Mecha — see light_license.txt)
 *   public/assets/mechs/medium.glb  (leoxx300 mech model — see medium_license.txt)
 *   public/assets/mechs/heavy.glb   (W9231 Combat Mech — see w9231_license.txt)
 *   public/assets/mechs/straznik.glb  (Iron Harvest Straznik — enemy bots)
 *   public/assets/mechs/cbp0.glb … cbp5.glb  (CBP 10 LP pack — enemy mechs)
 */
export const PLAYER_MECH_GLTF_PATHS = {
  light: '/assets/mechs/light.glb',
  medium: '/assets/mechs/medium.glb',
  heavy: '/assets/mechs/heavy.glb',
} as const satisfies Record<'light' | 'medium' | 'heavy', string>;

export const ENEMY_MECH_GLTF_PATHS = {
  straznik: '/assets/mechs/straznik.glb',
  cbp0: '/assets/mechs/cbp0.glb',
  cbp1: '/assets/mechs/cbp1.glb',
  cbp2: '/assets/mechs/cbp2.glb',
  cbp3: '/assets/mechs/cbp3.glb',
  cbp4: '/assets/mechs/cbp4.glb',
  cbp5: '/assets/mechs/cbp5.glb',
} as const;

export const MECH_GLTF_PATHS: Partial<Record<ChassisType, string>> = {
  ...PLAYER_MECH_GLTF_PATHS,
  ...ENEMY_MECH_GLTF_PATHS,
};

/** Player chassis preloaded at boot; enemies load on first spawn. */
export const BOOT_PRELOAD_CHASSIS = Object.keys(PLAYER_MECH_GLTF_PATHS) as Array<
  keyof typeof PLAYER_MECH_GLTF_PATHS
>;

/** Optional Euler correction (degrees) applied after auto-upright heuristics. */
export interface GltfImportCorrection {
  rotXDeg?: number;
  rotYDeg?: number;
  rotZDeg?: number;
  /** Extra lift after foot grounding (world units). */
  groundYOffset?: number;
}

/** Normalized standing heights for player chassis (world units). */
export const PLAYER_CHASSIS_HEIGHT = {
  light: 1.05,
  medium: 1.0,
  heavy: 1.55,
} as const satisfies Record<'light' | 'medium' | 'heavy', number>;

/** Normalized heights for enemy glTF chassis (before team visual multiplier). */
export const ENEMY_CHASSIS_HEIGHT: Partial<Record<ChassisType, number>> = {
  straznik: 1.32,
  spider: 0.95,
  cbp0: 1.0,
  cbp1: 1.0,
  cbp2: 1.0,
  cbp3: 1.0,
  cbp4: 1.0,
  cbp5: 1.0,
};

/** Enemy meshes that use one flat team color for the whole model. */
export function usesFlatEnemyPrimary(chassis: ChassisType): boolean {
  return chassis === 'light' || chassis === 'straznik' || chassis.startsWith('cbp');
}

export const MECH_GLTF_CORRECTIONS: Partial<Record<ChassisType, GltfImportCorrection>> = {};
