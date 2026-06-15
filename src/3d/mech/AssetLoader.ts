// ============================================================================
// AssetLoader — the factory the rest of the game uses.
//
// Strategy: by default, dispatch to PrimitiveMech (procedural geometry). When
// glTF assets become available, register them per (chassis, team) and they'll
// be used transparently.
//
// Usage:
//   const loader = new MechAssetLoader();
//   const mech = await loader.loadMech({ chassis: 'medium', team: 1, weaponRight: 'cannon' });
//
// Later:
//   loader.registerGltf('medium', '/assets/mechs/medium.glb');
//   // ...subsequent loadMech() for medium will use the glTF version.
// ============================================================================

import type { ChassisType, MechAsset, MechConfig, MechAssetLoader } from './types';
import { PrimitiveMech } from './PrimitiveMech';

type GltfRegistration = { url: string };

export class DefaultAssetLoader implements MechAssetLoader {
  private gltfRegistry = new Map<ChassisType, GltfRegistration>();

  /**
   * Register a glTF asset for a given chassis. Once registered, all
   * subsequent `loadMech()` calls for that chassis will use it instead of
   * the procedural fallback.
   *
   * NOT IMPLEMENTED YET — registration is accepted but currently still
   * returns PrimitiveMech (the GltfMech implementation is a TODO). The
   * placeholder exists so callers can be written now and "just work" later.
   */
  registerGltf(chassis: ChassisType, url: string): void {
    this.gltfRegistry.set(chassis, { url });
    console.warn(
      `[AssetLoader] registerGltf('${chassis}', ...) recorded but GltfMech not yet implemented.\n` +
      `Will continue using PrimitiveMech for now. See src/3d/mech/GltfMech.ts (TODO).`
    );
  }

  async loadMech(config: MechConfig): Promise<MechAsset> {
    const reg = this.gltfRegistry.get(config.chassis);
    if (reg) {
      // Future: dynamically import GltfMech, load url, return.
      // For now, fall through to PrimitiveMech.
      // const { GltfMech } = await import('./GltfMech');
      // return GltfMech.load(reg.url, config);
    }
    return new PrimitiveMech(config);
  }
}
