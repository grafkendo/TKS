// ============================================================================
// glTF template cache — load each .glb once, clone per mech instance.
// ============================================================================

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

import { stripGltfTextures } from './solidMaterials';

export interface GltfTemplate {
  scene: THREE.Group;
  animations: THREE.AnimationClip[];
}

export class GltfTemplateCache {
  private readonly loader = new GLTFLoader();
  private readonly pending = new Map<string, Promise<GltfTemplate>>();
  private readonly loaded = new Map<string, GltfTemplate>();

  async get(url: string): Promise<GltfTemplate> {
    const hit = this.loaded.get(url);
    if (hit) return hit;

    let job = this.pending.get(url);
    if (!job) {
      job = this.loader.loadAsync(url).then((gltf) => {
        const scene = gltf.scene;
        scene.name = scene.name || 'gltf_root';
        stripGltfTextures(scene);
        const template: GltfTemplate = { scene, animations: gltf.animations };
        this.loaded.set(url, template);
        this.pending.delete(url);
        return template;
      });
      this.pending.set(url, job);
    }
    return job;
  }

  dispose(): void {
    for (const tpl of this.loaded.values()) {
      tpl.scene.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        mesh.geometry?.dispose();
        const mat = mesh.material;
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else mat?.dispose();
      });
    }
    this.loaded.clear();
    this.pending.clear();
  }
}
