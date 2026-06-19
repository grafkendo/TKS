// ============================================================================
// glTF import normalization — upright, scale-to-height, foot grounding.
// Shared by in-game GltfMech and lobby previews.
// ============================================================================

import * as THREE from 'three';

import {
  ENEMY_CHASSIS_HEIGHT,
  MECH_GLTF_CORRECTIONS,
  PLAYER_CHASSIS_HEIGHT,
} from './mechAssets';
import type { ChassisType } from './types';

/** Legacy default — used when chassis has no explicit height table entry. */
export const GLTF_TARGET_HEIGHT = 1.6;

const FOOT_NAME_HINTS = ['foot', 'feet', 'toe', 'ankle'];

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function targetHeightFor(chassis: ChassisType): number {
  if (chassis === 'light' || chassis === 'medium' || chassis === 'heavy') {
    return PLAYER_CHASSIS_HEIGHT[chassis];
  }
  return ENEMY_CHASSIS_HEIGHT[chassis] ?? GLTF_TARGET_HEIGHT;
}

export function orientModelUpright(root: THREE.Object3D): void {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  if (box.isEmpty()) return;
  const size = box.getSize(new THREE.Vector3());
  const horiz = Math.max(size.x, size.z);
  if (horiz > 0.001 && size.y < horiz * 0.25) {
    if (size.z >= size.x) root.rotation.x = -Math.PI / 2;
    else root.rotation.z = Math.PI / 2;
  }
}

function applyImportCorrection(root: THREE.Object3D, chassis: ChassisType): void {
  const corr = MECH_GLTF_CORRECTIONS[chassis];
  if (!corr) return;
  if (corr.rotXDeg) root.rotation.x += THREE.MathUtils.degToRad(corr.rotXDeg);
  if (corr.rotYDeg) root.rotation.y += THREE.MathUtils.degToRad(corr.rotYDeg);
  if (corr.rotZDeg) root.rotation.z += THREE.MathUtils.degToRad(corr.rotZDeg);
}

/** Lowest Y among foot meshes; null if none found. */
function groundYFromFeet(root: THREE.Object3D): number | null {
  root.updateMatrixWorld(true);
  let minY = Infinity;
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    const n = norm(mesh.name);
    if (!FOOT_NAME_HINTS.some((h) => n.includes(h))) return;
    const box = new THREE.Box3().setFromObject(mesh);
    if (!box.isEmpty()) minY = Math.min(minY, box.min.y);
  });
  return minY === Infinity ? null : minY;
}

/** Lowest world Y across all mesh geometry in the hierarchy. */
function groundYFromMeshes(root: THREE.Object3D): number | null {
  root.updateMatrixWorld(true);
  let minY = Infinity;
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    const box = new THREE.Box3().setFromObject(mesh);
    if (!box.isEmpty()) minY = Math.min(minY, box.min.y);
  });
  return minY === Infinity ? null : minY;
}

function resolveGroundY(root: THREE.Object3D): number {
  const footY = groundYFromFeet(root);
  const meshY = groundYFromMeshes(root);
  if (footY != null && meshY != null) return Math.min(footY, meshY);
  if (meshY != null) return meshY;
  if (footY != null) return footY;
  const box = new THREE.Box3().setFromObject(root);
  return box.isEmpty() ? 0 : box.min.y;
}

/** Align the lowest mesh point of an object to a world-space floor height. */
export function alignObjectFeetToY(object: THREE.Object3D, floorY: number): void {
  object.updateMatrixWorld(true);
  const groundY = resolveGroundY(object);
  object.position.y += floorY - groundY;
}

/** Scale to chassis target height, ground on feet, center on tile origin. */
export function normalizeGltfToGround(root: THREE.Object3D, chassis: ChassisType): void {
  applyImportCorrection(root, chassis);
  orientModelUpright(root);

  const targetHeight = targetHeightFor(chassis);

  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  if (box.isEmpty()) return;

  const size = box.getSize(new THREE.Vector3());
  if (size.y > 0.001) {
    root.scale.multiplyScalar(targetHeight / size.y);
  }

  root.updateMatrixWorld(true);
  root.position.y -= resolveGroundY(root);

  root.updateMatrixWorld(true);
  const grounded = new THREE.Box3().setFromObject(root);
  const center = grounded.getCenter(new THREE.Vector3());
  root.position.x -= center.x;
  root.position.z -= center.z;

  const lift = MECH_GLTF_CORRECTIONS[chassis]?.groundYOffset;
  if (lift) root.position.y += lift;
}
