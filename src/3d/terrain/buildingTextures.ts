// ============================================================================
// Building facade textures — lazy-loaded and tiled on story walls.
// ============================================================================

import * as THREE from 'three';

import { BUILDING_TEXTURE_URLS } from './buildingAssets';
import type { BuildingStyle } from './types';

const loader = new THREE.TextureLoader();
const cache = new Map<BuildingStyle, THREE.Texture>();
const pending = new Map<BuildingStyle, Promise<THREE.Texture>>();

function configure(tex: THREE.Texture): void {
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 1);
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 4;
}

export function loadBuildingTexture(style: BuildingStyle): Promise<THREE.Texture> {
  const hit = cache.get(style);
  if (hit) return Promise.resolve(hit);

  let job = pending.get(style);
  if (!job) {
    job = loader.loadAsync(BUILDING_TEXTURE_URLS[style]).then((tex) => {
      configure(tex);
      cache.set(style, tex);
      pending.delete(style);
      return tex;
    });
    pending.set(style, job);
  }
  return job;
}

export function preloadBuildingTextures(): Promise<void> {
  const styles = Object.keys(BUILDING_TEXTURE_URLS) as BuildingStyle[];
  return Promise.all(styles.map(loadBuildingTexture)).then(() => undefined);
}

/** Apply a tiled facade once the PNG resolves; solid palette remains as fallback. */
export function applyBuildingTexture(
  material: THREE.MeshStandardMaterial,
  style: BuildingStyle,
  stories: number,
): void {
  loadBuildingTexture(style)
    .then((tex) => {
      const map = tex.clone();
      map.repeat.set(1, Math.max(1, stories));
      map.needsUpdate = true;
      material.map = map;
      material.color.set(0xffffff);
      material.needsUpdate = true;
    })
    .catch(() => {
      /* keep procedural palette */
    });
}
