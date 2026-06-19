// ============================================================================
// Enemy archetype preview — rotating solid-color glTF thumbnails for debug cards.
// ============================================================================

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';

import {
  ARCHETYPES,
  ENEMY_TEAM_VISUAL_SCALE,
  type ArchetypeKey,
} from '../enemies/archetypes';
import { MECH_GLTF_PATHS, usesFlatEnemyPrimary } from '../mech/mechAssets';
import { normalizeGltfToGround } from '../mech/gltfNormalize';
import { applySolidTeamMaterials, stripGltfTextures } from '../mech/solidMaterials';
import { TEAM_PALETTES, type ChassisType } from '../mech/types';

const PREVIEW_W = 140;
const PREVIEW_H = 100;

const PREVIEW_FIT: Partial<Record<ChassisType, number>> = {
  straznik: 1.2,
  cbp0: 1.2,
  cbp1: 1.2,
  cbp2: 1.2,
  cbp3: 1.15,
  cbp4: 1.2,
  cbp5: 1.2,
};

const loader = new GLTFLoader();
const templateCache = new Map<ArchetypeKey, THREE.Group>();

export interface EnemyPreviewHandle {
  stop(): void;
}

const activePreviews = new Map<HTMLCanvasElement, EnemyPreviewHandle>();

function clonePreviewModel(root: THREE.Group): THREE.Group {
  const hasSkinned = root.getObjectByProperty('type', 'SkinnedMesh') != null;
  return (hasSkinned ? cloneSkinned(root) : root.clone(true)) as THREE.Group;
}

function fitModelToPreview(root: THREE.Group, archetypeKey: ArchetypeKey): void {
  const arch = ARCHETYPES[archetypeKey];
  normalizeGltfToGround(root, arch.chassis);
  root.scale.multiplyScalar(arch.visualScale * ENEMY_TEAM_VISUAL_SCALE);
  root.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z, 0.001);
  const fit = PREVIEW_FIT[arch.chassis] ?? 1.2;
  root.scale.multiplyScalar(fit / maxDim);
  root.updateMatrixWorld(true);

  box.setFromObject(root);
  const center = box.getCenter(new THREE.Vector3());
  root.position.x -= center.x;
  root.position.y -= box.min.y;
  root.position.z -= center.z;
}

async function loadPreviewTemplate(archetypeKey: ArchetypeKey): Promise<THREE.Group> {
  const hit = templateCache.get(archetypeKey);
  if (hit) return clonePreviewModel(hit);

  const arch = ARCHETYPES[archetypeKey];
  const url = MECH_GLTF_PATHS[arch.chassis];
  if (!url) throw new Error(`no preview for ${arch.chassis}`);

  const gltf = await loader.loadAsync(url);
  const root = gltf.scene;
  stripGltfTextures(root);
  applySolidTeamMaterials(root, TEAM_PALETTES[2], usesFlatEnemyPrimary(arch.chassis) ? 'primary' : undefined);
  fitModelToPreview(root, archetypeKey);
  templateCache.set(archetypeKey, root);
  return clonePreviewModel(root);
}

function makeFallback(archetypeKey: ArchetypeKey): THREE.Group {
  const palette = TEAM_PALETTES[2];
  const arch = ARCHETYPES[archetypeKey];
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.55, 0.45, 0.45),
    new THREE.MeshStandardMaterial({ color: palette.primary, roughness: 0.86, metalness: 0.08 }),
  );
  body.position.y = 0.32;
  body.scale.setScalar(arch.visualScale);
  g.add(body);
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

export function archetypeCardStats(key: ArchetypeKey): string {
  const a = ARCHETYPES[key];
  const armor = a.armorThreshold > 0 ? ` · deflects < ${a.armorThreshold}` : '';
  const move =
    a.movementMode === 'burst'
      ? `${a.movementRange} hex dash`
      : 'per-hex';
  return `${a.apMax} AP · ${a.hpMax} HP · range ${a.attackRange} · ${move}${armor}`;
}

export function archetypeModelLabel(key: ArchetypeKey): string {
  const chassis = ARCHETYPES[key].chassis;
  if (chassis === 'straznik') return 'Iron Harvest Straznik';
  if (chassis.startsWith('cbp')) return `CBP Mech ${chassis.slice(3)}`;
  return chassis;
}

/** Start a continuously rotating enemy preview on a canvas. */
export function startEnemyPreview(
  archetypeKey: ArchetypeKey,
  canvas: HTMLCanvasElement,
): EnemyPreviewHandle {
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
      model = await loadPreviewTemplate(archetypeKey);
    } catch {
      model = makeFallback(archetypeKey);
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

  const handle: EnemyPreviewHandle = {
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

export function stopAllEnemyPreviews(): void {
  for (const handle of activePreviews.values()) handle.stop();
  activePreviews.clear();
}
