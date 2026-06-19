// ============================================================================
// Mech selection preview — rotating solid-color glTF thumbnails for lobby cards.
// ============================================================================

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';

import { MECH_GLTF_PATHS } from '../mech/mechAssets';
import { normalizeGltfToGround } from '../mech/gltfNormalize';
import { applySolidTeamMaterials, stripGltfTextures } from '../mech/solidMaterials';
import { TEAM_PALETTES } from '../mech/types';
import type { ChassisKind } from '../coop/types';

const PREVIEW_W = 140;
const PREVIEW_H = 100;

const PREVIEW_FIT: Record<ChassisKind, number> = {
  light: 1.35,
  medium: 1.35,
  heavy: 1.05,
};

const loader = new GLTFLoader();
const templateCache = new Map<ChassisKind, THREE.Group>();

export interface MechPreviewHandle {
  stop(): void;
}

const activePreviews = new Map<HTMLCanvasElement, MechPreviewHandle>();

function clonePreviewModel(root: THREE.Group): THREE.Group {
  const hasSkinned = root.getObjectByProperty('type', 'SkinnedMesh') != null;
  return (hasSkinned ? cloneSkinned(root) : root.clone(true)) as THREE.Group;
}

function fitModelToPreview(root: THREE.Group, chassis: ChassisKind): void {
  normalizeGltfToGround(root, chassis);
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

async function loadPreviewTemplate(chassis: ChassisKind): Promise<THREE.Group> {
  const hit = templateCache.get(chassis);
  if (hit) return clonePreviewModel(hit);

  const url = MECH_GLTF_PATHS[chassis];
  if (!url) throw new Error(`no preview for ${chassis}`);

  const gltf = await loader.loadAsync(url);
  const root = gltf.scene;
  stripGltfTextures(root);
  applySolidTeamMaterials(root, TEAM_PALETTES[1], chassis === 'light' ? 'primary' : undefined);
  fitModelToPreview(root, chassis);
  templateCache.set(chassis, root);
  return clonePreviewModel(root);
}

function makeFallback(chassis: ChassisKind): THREE.Group {
  const palette = TEAM_PALETTES[1];
  const g = new THREE.Group();
  const bodyColor = chassis === 'heavy' ? palette.primary : palette.secondary;
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.6, 0.5, 0.5),
    new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.86, metalness: 0.08 }),
  );
  body.position.y = 0.35;
  g.add(body);
  const leg = new THREE.Mesh(
    new THREE.BoxGeometry(0.2, 0.35, 0.2),
    new THREE.MeshStandardMaterial({ color: palette.secondary, roughness: 0.86, metalness: 0.08 }),
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

function disposeScene(scene: THREE.Scene): void {
  scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    mesh.geometry?.dispose();
    const mat = mesh.material;
    if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
    else mat?.dispose();
  });
}

/** Start a continuously rotating solid-color preview on a canvas. */
export function startMechPreview(
  chassis: ChassisKind,
  canvas: HTMLCanvasElement,
): MechPreviewHandle {
  const existing = activePreviews.get(canvas);
  existing?.stop();

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setSize(PREVIEW_W, PREVIEW_H, false);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(36, PREVIEW_W / PREVIEW_H, 0.1, 50);

  scene.add(new THREE.AmbientLight(0xffffff, 0.55));
  const overhead = new THREE.DirectionalLight(0xffffff, 0.65);
  overhead.position.set(0, 6, 0);
  scene.add(overhead);
  const key = new THREE.DirectionalLight(0xfff8f0, 1.0);
  key.position.set(2, 4, 3);
  scene.add(key);

  const pivot = new THREE.Group();
  scene.add(pivot);

  let model: THREE.Group | null = null;
  let running = true;
  let rafId = 0;

  void (async () => {
    try {
      model = await loadPreviewTemplate(chassis);
    } catch {
      model = makeFallback(chassis);
    }
    if (!running) return;
    pivot.add(model);
    frameCamera(camera, model);
  })();

  const tick = (): void => {
    if (!running) return;
    pivot.rotation.y += 0.014;
    renderer.render(scene, camera);
    rafId = requestAnimationFrame(tick);
  };
  rafId = requestAnimationFrame(tick);

  const handle: MechPreviewHandle = {
    stop() {
      if (!running) return;
      running = false;
      cancelAnimationFrame(rafId);
      activePreviews.delete(canvas);
      renderer.dispose();
      renderer.forceContextLoss();
      disposeScene(scene);
    },
  };
  activePreviews.set(canvas, handle);
  return handle;
}

/** @deprecated Use startMechPreview for rotating cards. */
export async function renderMechPreview(
  chassis: ChassisKind,
  canvas: HTMLCanvasElement,
): Promise<void> {
  startMechPreview(chassis, canvas);
}

export function stopAllMechPreviews(): void {
  for (const handle of activePreviews.values()) handle.stop();
  activePreviews.clear();
}

export const MECH_CARD_STATS: Record<ChassisKind, string> = {
  light: '3 AP · 3 HP · range 2',
  medium: '2 AP · 3 HP · range 2',
  heavy: '3 AP · 4 HP · range 1 · forward arc',
};
