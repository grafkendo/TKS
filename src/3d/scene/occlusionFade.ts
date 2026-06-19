// ============================================================================
// Occlusion fade — dim buildings/walls between camera and a focused unit.
// ============================================================================

import * as THREE from 'three';

import type { TerrainPiece } from '../terrain/types';

const FADE_OPACITY = 0.28;
const FADE_TAG = 'tackticus_occlusion_fade';

interface FadeEntry {
  mesh: THREE.Mesh;
  materials: THREE.Material[];
  originals: Array<{ transparent: boolean; opacity: number; depthWrite: boolean }>;
}

const faded = new Map<THREE.Mesh, FadeEntry>();

function collectMeshes(root: THREE.Object3D, out: THREE.Mesh[]): void {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.isMesh && mesh.material) out.push(mesh);
  });
}

function fadeMesh(mesh: THREE.Mesh): void {
  if (faded.has(mesh)) return;
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  const originals = materials.map((m) => ({
    transparent: m.transparent,
    opacity: m.opacity,
    depthWrite: m.depthWrite,
  }));
  for (const m of materials) {
    m.transparent = true;
    m.opacity = FADE_OPACITY;
    m.depthWrite = false;
    m.needsUpdate = true;
  }
  faded.set(mesh, { mesh, materials, originals });
}

function restoreAll(): void {
  for (const entry of faded.values()) {
    entry.materials.forEach((m, i) => {
      const orig = entry.originals[i];
      m.transparent = orig.transparent;
      m.opacity = orig.opacity;
      m.depthWrite = orig.depthWrite;
      m.needsUpdate = true;
    });
  }
  faded.clear();
}

function blocksLine(
  piece: TerrainPiece,
  from: THREE.Vector3,
  to: THREE.Vector3,
): boolean {
  if (piece.destroyed) return false;
  if (piece.kind !== 'building' && piece.kind !== 'wall' && piece.kind !== 'solidWall') {
    return false;
  }
  const box = new THREE.Box3().setFromObject(piece.object);
  if (box.isEmpty()) return false;
  const ray = new THREE.Ray(from.clone(), to.clone().sub(from).normalize());
  const hit = new THREE.Vector3();
  return ray.intersectBox(box, hit) !== null;
}

/**
 * Fade terrain pieces that sit between the camera and the unit torso.
 * Call with `unitRoot = null` to restore everything.
 */
export function updateOcclusionFade(
  camera: THREE.Camera,
  unitRoot: THREE.Object3D | null,
  terrain: readonly TerrainPiece[],
): void {
  restoreAll();
  if (!unitRoot) return;

  const torso = unitRoot.getObjectByName('torso')
    ?? unitRoot.children.find((c) => c.type === 'Mesh')
    ?? unitRoot;
  const unitPos = new THREE.Vector3();
  torso.getWorldPosition(unitPos);
  unitPos.y += 0.6;

  const camPos = camera.position.clone();

  for (const piece of terrain) {
    if (!blocksLine(piece, camPos, unitPos)) continue;
    const meshes: THREE.Mesh[] = [];
    collectMeshes(piece.object, meshes);
    for (const mesh of meshes) {
      mesh.userData[FADE_TAG] = true;
      fadeMesh(mesh);
    }
  }
}
