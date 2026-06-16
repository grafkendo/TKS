// ============================================================================
// TexturedCrate — single box mesh with the ammo-crate albedo texture.
//
// One mesh avoids z-fighting from overlapping bands/straps in the Blender export.
// BoxGeometry is already triangulated (12 tris) — the GPU never sees quads.
// ============================================================================

import * as THREE from 'three';

import type { PickupMeshHandle } from './PickupMesh';

const CRATE_WIDTH = 0.7;
const CRATE_HEIGHT = 0.55;
const CRATE_DEPTH = 0.7;
/** Half-height + tiny lift so the bottom doesn't z-fight with the hex tile. */
const GROUND_LIFT = CRATE_HEIGHT / 2 + 0.02;
const ACCENT_COLOR = '#ffce4d';

export function configureCrateTexture(tex: THREE.Texture): void {
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 4;
}

export function createTexturedCrateMesh(texture: THREE.Texture): PickupMeshHandle {
  const geometry = new THREE.BoxGeometry(CRATE_WIDTH, CRATE_HEIGHT, CRATE_DEPTH);

  const material = new THREE.MeshStandardMaterial({
    map: texture,
    metalness: 0.1,
    roughness: 0.75,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = false;

  const group = new THREE.Group();
  group.add(mesh);
  group.position.y = GROUND_LIFT;

  const light = new THREE.PointLight(new THREE.Color(ACCENT_COLOR), 0.45, 1.4);
  light.position.set(0, CRATE_HEIGHT * 0.5 + 0.05, 0);
  group.add(light);

  const baseY = group.position.y;

  return {
    group,
    tick(t: number) {
      group.position.y = baseY + Math.sin(t * 1.4) * 0.02;
      group.rotation.y = Math.sin(t * 0.4) * 0.06;
      light.intensity = 0.35 + (Math.sin(t * 2.5) + 1) * 0.22;
    },
    dispose() {
      group.removeFromParent();
      geometry.dispose();
      material.dispose();
      light.dispose();
    },
  };
}
