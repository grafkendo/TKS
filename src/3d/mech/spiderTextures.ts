// ============================================================================
// Spider texture loader — shared albedo for all spider drone instances.
// ============================================================================

import * as THREE from 'three';

import { SPIDER_DRONE_ALBEDO_URL } from './spiderAssets';

let texture: THREE.Texture | null = null;
let pending: Promise<THREE.Texture> | null = null;

function configure(tex: THREE.Texture): void {
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 4;
}

export function preloadSpiderTexture(): Promise<void> {
  return loadSpiderTexture()
    .then(() => undefined)
    .catch(() => undefined);
}

export function loadSpiderTexture(): Promise<THREE.Texture> {
  if (texture) return Promise.resolve(texture);
  if (!pending) {
    pending = new THREE.TextureLoader().loadAsync(SPIDER_DRONE_ALBEDO_URL).then((tex) => {
      configure(tex);
      texture = tex;
      return tex;
    });
  }
  return pending;
}
