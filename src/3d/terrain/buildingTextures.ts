// ============================================================================
// Building facade textures — disabled for miniature grey look (solid colors only).
// ============================================================================

import type { BuildingStyle } from './types';
import type * as THREE from 'three';

export function loadBuildingTexture(_style: BuildingStyle): Promise<null> {
  return Promise.resolve(null);
}

export function preloadBuildingTextures(): Promise<void> {
  return Promise.resolve();
}

export function applyBuildingTexture(
  _material: THREE.MeshStandardMaterial,
  _style: BuildingStyle,
  _stories: number,
): void {
  /* solid grey palette in Building.ts */
}
