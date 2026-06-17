// ============================================================================
// Mech selection preview — tiny glTF thumbnails for the co-op lobby cards.
// ============================================================================

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

import { MECH_GLTF_PATHS } from '../mech/mechAssets';
import type { ChassisKind } from '../coop/types';

const PREVIEW_W = 140;
const PREVIEW_H = 100;

/** Target max dimension in preview units — heavy models are scaled down more. */
const PREVIEW_FIT: Record<ChassisKind, number> = {
  light: 1.35,
  medium: 1.35,
  heavy: 1.05,
};

const loader = new GLTFLoader();
const cache = new Map<ChassisKind, THREE.Group>();

function fitModelToPreview(root: THREE.Group, chassis: ChassisKind): void {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z, 0.001);
  root.scale.multiplyScalar(PREVIEW_FIT[chassis] / maxDim);
  root.updateMatrixWorld(true);
  box.setFromObject(root);
  const center = box.getCenter(new THREE.Vector3());
  root.position.x -= center.x;
  root.position.y -= box.min.y;
  root.position.z -= center.z;
}

async function loadPreviewModel(chassis: ChassisKind): Promise<THREE.Group | null> {
  const hit = cache.get(chassis);
  if (hit) return hit.clone(true);

  const url = MECH_GLTF_PATHS[chassis];
  if (!url) return null;

  try {
    const gltf = await loader.loadAsync(url);
    const root = gltf.scene.clone(true);
    fitModelToPreview(root, chassis);
    cache.set(chassis, root);
    return root.clone(true);
  } catch {
    return null;
  }
}

function makeFallback(chassis: ChassisKind): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.6, 0.5, 0.5),
    new THREE.MeshStandardMaterial({ color: chassis === 'heavy' ? '#cc4543' : '#6a8ab8' }),
  );
  body.position.y = 0.35;
  g.add(body);
  const leg = new THREE.Mesh(
    new THREE.BoxGeometry(0.2, 0.35, 0.2),
    new THREE.MeshStandardMaterial({ color: '#333' }),
  );
  leg.position.set(0.2, 0.15, 0);
  g.add(leg);
  return g;
}

function frameCamera(camera: THREE.PerspectiveCamera, model: THREE.Object3D): void {
  const box = new THREE.Box3().setFromObject(model);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z, 0.5);
  const dist = maxDim * 2.4;
  camera.position.set(center.x + dist * 0.65, center.y + maxDim * 0.9, center.z + dist);
  camera.lookAt(center.x, center.y + size.y * 0.45, center.z);
}

/** Render a static preview into a canvas for lobby mech cards. */
export async function renderMechPreview(
  chassis: ChassisKind,
  canvas: HTMLCanvasElement,
): Promise<void> {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setSize(PREVIEW_W, PREVIEW_H, false);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(36, PREVIEW_W / PREVIEW_H, 0.1, 50);

  scene.add(new THREE.AmbientLight(0xffffff, 0.65));
  const key = new THREE.DirectionalLight(0xffffff, 1.1);
  key.position.set(2, 4, 3);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xffce4d, 0.35);
  rim.position.set(-2, 1, -2);
  scene.add(rim);

  const model = (await loadPreviewModel(chassis)) ?? makeFallback(chassis);
  scene.add(model);
  frameCamera(camera, model);

  renderer.render(scene, camera);

  renderer.dispose();
  scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    mesh.geometry?.dispose();
    const mat = mesh.material;
    if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
    else mat?.dispose();
  });
}

export const MECH_CARD_STATS: Record<ChassisKind, string> = {
  light: '3 AP · 3 HP · range 2',
  medium: '2 AP · 3 HP · range 2',
  heavy: '3 AP · 4 HP · range 1 · forward arc',
};
