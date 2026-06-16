// ============================================================================
// AssetLoader — procedural fallback + optional glTF per chassis.
// ============================================================================

import type { ChassisType, MechAsset, MechConfig, MechAssetLoader } from './types';
import { GltfMech } from './GltfMech';
import { GltfTemplateCache } from './gltfCache';
import { PrimitiveMech } from './PrimitiveMech';

type GltfRegistration = { url: string };

export class DefaultAssetLoader implements MechAssetLoader {
  private gltfRegistry = new Map<ChassisType, GltfRegistration>();
  private readonly gltfCache = new GltfTemplateCache();

  /**
   * Register a glTF asset for a chassis. When the file exists on the server,
   * loadMech() uses GltfMech; otherwise it falls back to PrimitiveMech.
   */
  registerGltf(chassis: ChassisType, url: string): void {
    this.gltfRegistry.set(chassis, { url });
  }

  async loadMech(config: MechConfig): Promise<MechAsset> {
    const reg = this.gltfRegistry.get(config.chassis);
    if (reg) {
      try {
        const template = await this.gltfCache.get(reg.url);
        return await GltfMech.fromTemplate(template, config);
      } catch (err) {
        console.warn(
          `[AssetLoader] glTF '${reg.url}' unavailable for '${config.chassis}' — using PrimitiveMech.`,
          err,
        );
      }
    }
    return new PrimitiveMech(config);
  }
}
