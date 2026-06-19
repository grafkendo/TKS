// ============================================================================
// Map selection preview — rotating miniature 3D board for the co-op lobby.
// ============================================================================

import * as THREE from 'three';

import { buildMapById, MAP_OPTIONS } from '../maps';
import { updateMapEnemyCards, stopMapEnemyCardPreviews } from '../debug/mapEnemyCards';
import { Board, TILE_TOP_Y } from '../scene/Board';
import { SKY_BACKDROP } from '../scene/miniaturePalette';
import { createTerrainFromSpec } from '../terrain/factory';

const PREVIEW_W = 280;
const PREVIEW_H = 220;

let activeMapPreview: MapPreviewHandle | null = null;
let activeMapCanvas: HTMLCanvasElement | null = null;

const mapSceneCache = new Map<string, THREE.Group>();

export interface MapPreviewHandle {
  setMap(mapId: string): void;
  stop(): void;
}

export function mapPreviewMeta(mapId: string): { name: string; description: string } {
  const opt = MAP_OPTIONS.find((m) => m.id === mapId);
  return {
    name: opt?.name ?? mapId,
    description: opt?.description ?? '',
  };
}

export function updateMapPreviewLabels(mapId: string): void {
  const meta = mapPreviewMeta(mapId);
  const title = document.getElementById('coop-map-preview-title');
  const desc = document.getElementById('coop-map-preview-desc');
  if (title) title.textContent = meta.name;
  if (desc) desc.textContent = meta.description;
}

function fitMapToPreview(root: THREE.Group): void {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z, 0.001);
  root.scale.multiplyScalar(9 / maxDim);
  root.updateMatrixWorld(true);
  box.setFromObject(root);
  const center = box.getCenter(new THREE.Vector3());
  root.position.x -= center.x;
  root.position.y -= box.min.y;
  root.position.z -= center.z;
}

function buildMapScene(mapId: string): THREE.Group {
  const built = buildMapById(mapId);
  const root = new THREE.Group();
  root.name = `map_preview_${mapId}`;

  const board = new Board(built.map.tiles());
  root.add(board.root);

  let i = 0;
  for (const spec of built.map.terrain()) {
    const piece = createTerrainFromSpec(`mpv_${mapId}_${i++}`, spec.hex, spec);
    const p = board.tileToWorld(spec.hex);
    piece.object.position.set(p.x, TILE_TOP_Y, p.z);
    root.add(piece.object);
  }

  const objectiveMat = new THREE.MeshStandardMaterial({
    color: 0xffce4d,
    emissive: 0xffce4d,
    emissiveIntensity: 0.45,
    roughness: 0.8,
    metalness: 0.05,
  });
  const objectiveGeom = new THREE.CylinderGeometry(0.22, 0.22, 0.12, 6);
  objectiveGeom.rotateY(Math.PI / 6);

  for (const h of built.objectiveTiles) {
    const marker = new THREE.Mesh(objectiveGeom, objectiveMat);
    const p = board.tileToWorld(h);
    marker.position.set(p.x, TILE_TOP_Y + 0.18, p.z);
    root.add(marker);
  }

  fitMapToPreview(root);
  return root;
}

function getOrBuildMapScene(mapId: string): THREE.Group {
  const hit = mapSceneCache.get(mapId);
  if (hit) return hit;
  const built = buildMapScene(mapId);
  mapSceneCache.set(mapId, built);
  return built;
}

function disposeObject3D(root: THREE.Object3D): void {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    mesh.geometry?.dispose();
    const mat = mesh.material;
    if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
    else mat?.dispose();
  });
}

function clearMapSceneCache(): void {
  for (const scene of mapSceneCache.values()) disposeObject3D(scene);
  mapSceneCache.clear();
}

function frameCamera(camera: THREE.PerspectiveCamera, targetY: number): void {
  camera.position.set(7.5, 8.5, 7.5);
  camera.lookAt(0, targetY, 0);
}

/** Start a continuously rotating map preview on a canvas. */
export function startMapPreview(
  mapId: string,
  canvas: HTMLCanvasElement,
  enemyCardsEl?: HTMLElement | null,
): MapPreviewHandle | null {
  if (activeMapCanvas === canvas && activeMapPreview) {
    activeMapPreview.setMap(mapId);
    return activeMapPreview;
  }
  stopActiveMapPreview();

  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  } catch (err) {
    console.warn('[mapSelectPreview] WebGL unavailable — skipping preview', err);
    return null;
  }
  const gl = renderer.getContext();
  if (!gl) {
    renderer.dispose();
    console.warn('[mapSelectPreview] WebGL context missing — skipping preview');
    return null;
  }
  renderer.setSize(PREVIEW_W, PREVIEW_H, false);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SKY_BACKDROP);

  const camera = new THREE.PerspectiveCamera(38, PREVIEW_W / PREVIEW_H, 0.1, 120);
  frameCamera(camera, 1.2);

  scene.add(new THREE.AmbientLight(0xffffff, 0.55));
  const overhead = new THREE.DirectionalLight(0xffffff, 0.6);
  overhead.position.set(0, 10, 0);
  scene.add(overhead);
  const key = new THREE.DirectionalLight(0xfff8f0, 0.95);
  key.position.set(5, 8, 4);
  scene.add(key);

  const pivot = new THREE.Group();
  scene.add(pivot);

  let running = true;
  let rafId = 0;
  let activeMapId: string | null = null;
  let activeMapRoot: THREE.Group | null = null;

  const mountMap = (nextMapId: string): void => {
    if (activeMapRoot) pivot.remove(activeMapRoot);
    activeMapRoot = getOrBuildMapScene(nextMapId);
    activeMapId = nextMapId;
    pivot.add(activeMapRoot);
    frameCamera(camera, 1.2);
  };

  mountMap(mapId);
  updateMapPreviewLabels(mapId);
  updateMapEnemyCards(mapId, enemyCardsEl ?? null);

  const tick = (): void => {
    if (!running) return;
    pivot.rotation.y += 0.008;
    renderer.render(scene, camera);
    rafId = requestAnimationFrame(tick);
  };
  rafId = requestAnimationFrame(tick);

  const handle: MapPreviewHandle = {
    setMap(nextMapId: string) {
      if (!running || nextMapId === activeMapId) {
        updateMapPreviewLabels(nextMapId);
        updateMapEnemyCards(nextMapId, enemyCardsEl ?? null);
        return;
      }
      mountMap(nextMapId);
      updateMapPreviewLabels(nextMapId);
      updateMapEnemyCards(nextMapId, enemyCardsEl ?? null);
    },
    stop() {
      if (!running) return;
      running = false;
      cancelAnimationFrame(rafId);
      if (activeMapRoot) pivot.remove(activeMapRoot);
      activeMapRoot = null;
      activeMapId = null;
      stopMapEnemyCardPreviews();
      renderer.dispose();
      renderer.forceContextLoss();
      disposeObject3D(scene);
      clearMapSceneCache();
      if (activeMapPreview === handle) {
        activeMapPreview = null;
        activeMapCanvas = null;
      }
    },
  };

  activeMapPreview = handle;
  activeMapCanvas = canvas;
  return handle;
}

/** Stop the singleton map lobby preview, if any. */
export function stopActiveMapPreview(): void {
  activeMapPreview?.stop();
  activeMapPreview = null;
  activeMapCanvas = null;
}
