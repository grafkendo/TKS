// ============================================================================
// Shared crate loader — textured box with procedural fallback.
// ============================================================================

import * as THREE from 'three';

import { createPrimitiveCrateMesh } from './Crate';
import { CRATE_ALBEDO_URL } from './crateAssets';
import { configureCrateTexture, createTexturedCrateMesh } from './TexturedCrate';
import type { PickupMeshHandle } from './PickupMesh';

class CrateLoader {
  private readonly textureLoader = new THREE.TextureLoader();
  private texture: THREE.Texture | null = null;
  private texturePromise: Promise<THREE.Texture> | null = null;

  /** Warm the texture cache so the first crate appears without a hitch. */
  preload(): Promise<void> {
    return this.getTexture()
      .then(() => undefined)
      .catch(() => undefined);
  }

  private getTexture(): Promise<THREE.Texture> {
    if (this.texture) return Promise.resolve(this.texture);
    if (!this.texturePromise) {
      this.texturePromise = this.textureLoader.loadAsync(CRATE_ALBEDO_URL).then((tex) => {
        configureCrateTexture(tex);
        this.texture = tex;
        return tex;
      });
    }
    return this.texturePromise;
  }

  async createMesh(): Promise<PickupMeshHandle> {
    try {
      const texture = await this.getTexture();
      return createTexturedCrateMesh(texture);
    } catch (err) {
      console.warn('[CrateLoader] texture unavailable — using procedural crate.', err);
      return createPrimitiveCrateMesh();
    }
  }
}

let shared: CrateLoader | null = null;

export function getCrateLoader(): CrateLoader {
  if (!shared) shared = new CrateLoader();
  return shared;
}
