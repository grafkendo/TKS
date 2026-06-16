// Crate — procedural fallback mesh for supply boxes on the board.
//
// Primary visuals use TexturedCrate.ts (single box + albedo PNG).
// This multi-part procedural mesh remains as a fallback if the texture fails.

import * as THREE from 'three';
import type { PickupMeshHandle } from './PickupMesh';

const WOOD_COLOR = '#a07a4a';
const BAND_COLOR = '#3a2818';
const ACCENT_COLOR = '#ffce4d';

/** Procedural fallback when the glTF ammo crate is unavailable. */
export function createPrimitiveCrateMesh(): PickupMeshHandle {
  const group = new THREE.Group();

  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];

  function pushMat(mat: THREE.Material): THREE.Material {
    materials.push(mat);
    return mat;
  }

  const wood = pushMat(
    new THREE.MeshStandardMaterial({
      color: WOOD_COLOR,
      metalness: 0.2,
      roughness: 0.75,
    }),
  );
  const band = pushMat(
    new THREE.MeshStandardMaterial({
      color: BAND_COLOR,
      metalness: 0.6,
      roughness: 0.45,
    }),
  );
  const accentMat = new THREE.MeshStandardMaterial({
    color: ACCENT_COLOR,
    emissive: new THREE.Color(ACCENT_COLOR),
    emissiveIntensity: 0.9,
    metalness: 0.4,
    roughness: 0.5,
  });
  pushMat(accentMat);

  const body = new THREE.BoxGeometry(0.7, 0.55, 0.7);
  geometries.push(body);
  group.add(new THREE.Mesh(body, wood));

  const ringGeom = new THREE.BoxGeometry(0.74, 0.08, 0.74);
  geometries.push(ringGeom);
  const topRing = new THREE.Mesh(ringGeom, band);
  topRing.position.y = 0.23;
  const botRing = new THREE.Mesh(ringGeom, band);
  botRing.position.y = -0.23;
  group.add(topRing, botRing);

  // Two metal corner straps front-to-back.
  const strapGeom = new THREE.BoxGeometry(0.06, 0.58, 0.74);
  geometries.push(strapGeom);
  const s1 = new THREE.Mesh(strapGeom, band);
  s1.position.x = -0.30;
  const s2 = new THREE.Mesh(strapGeom, band);
  s2.position.x = 0.30;
  group.add(s1, s2);

  // Glowing accent stripe on top — the visual "open me" cue.
  const accentGeom = new THREE.BoxGeometry(0.72, 0.025, 0.18);
  geometries.push(accentGeom);
  const accent = new THREE.Mesh(accentGeom, accentMat);
  accent.position.y = 0.28;
  group.add(accent);

  // Soft point light pinned to the accent.
  const light = new THREE.PointLight(new THREE.Color(ACCENT_COLOR), 0.5, 1.4);
  light.position.set(0, 0.35, 0);
  group.add(light);

  // Sit on the ground (origin Y is at the box center → lift by half-height).
  group.position.y = 0.30;

  const baseY = group.position.y;

  return {
    group,
    tick(t: number) {
      // Subtle bob + small sway.
      group.position.y = baseY + Math.sin(t * 1.4) * 0.025;
      group.rotation.y = Math.sin(t * 0.4) * 0.08;
      // Accent stripe gently pulses.
      accentMat.emissiveIntensity = 0.6 + (Math.sin(t * 2.5) + 1) * 0.4;
    },
    dispose() {
      group.removeFromParent();
      for (const g of geometries) g.dispose();
      for (const m of materials) m.dispose();
      light.dispose();
    },
  };
}
