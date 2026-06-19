// ============================================================================
// GltfMech — loads Blender-exported .glb files implementing MechAsset.
//
// Blender checklist: public/assets/mechs/README.md
// ============================================================================

import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';

import type { GltfTemplate } from './gltfCache';
import { normalizeGltfToGround } from './gltfNormalize';
import { usesFlatEnemyPrimary } from './mechAssets';
import { applySolidTeamMaterials } from './solidMaterials';
import {
  AnimationName,
  AttachPoint,
  MechAsset,
  MechConfig,
  TEAM_PALETTES,
  gameFacingToModelYaw,
} from './types';

const ATTACH_NAMES: Record<AttachPoint, string[]> = {
  rightHand: ['righthand', 'right_hand', 'muzzle_r', 'weapon_r', 'hand_r', 'straznikmg', 'mg', 'turret', 'atreidestankturret'],
  leftHand: ['lefthand', 'left_hand', 'muzzle_l', 'weapon_l', 'hand_l'],
  shoulderR: ['shoulderr', 'shoulder_r', 'turret_r'],
  shoulderL: ['shoulderl', 'shoulder_l', 'turret_l'],
  torso: ['torso', 'chest', 'body'],
  head: ['head', 'cockpit', 'visor'],
  rootGround: ['rootground', 'root_ground', 'feet', 'ground', 'origin'],
};

const ANIM_NAMES: Record<AnimationName, string[]> = {
  idle: ['idle'],
  walk: ['walk', 'walking', 'run'],
  fire: ['fire', 'shoot', 'attack'],
  hit: ['hit', 'damage', 'hurt'],
  destroyed: ['destroyed', 'death', 'die', 'dead'],
};

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function findByNames(root: THREE.Object3D, candidates: string[]): THREE.Object3D | null {
  const want = new Set(candidates.map(norm));
  let found: THREE.Object3D | null = null;
  root.traverse((obj) => {
    if (found) return;
    const n = norm(obj.name);
    if (n && want.has(n)) found = obj;
  });
  return found;
}

function cloneScene(template: THREE.Group): THREE.Group {
  const hasSkinned = template.getObjectByProperty('type', 'SkinnedMesh') != null;
  return (hasSkinned ? cloneSkinned(template) : template.clone(true)) as THREE.Group;
}

function hasSkinnedMesh(root: THREE.Object3D): boolean {
  return root.getObjectByProperty('type', 'SkinnedMesh') != null;
}

/**
 * Skinned glTF rigs (heavy mech) keep large internal bone offsets after
 * normalizeGltfToGround. seatMechOnTile sets world position on the root, so
 * wrap the normalized scene in an outer group we actually move in the world.
 */
function wrapSkinnedRoot(root: THREE.Group, config: MechConfig): THREE.Group {
  if (!hasSkinnedMesh(root)) return root;
  const wrapper = new THREE.Group();
  wrapper.name = `gltf_mech_${config.chassis}_team${config.team}`;
  wrapper.add(root);
  return wrapper;
}

function findClip(clips: THREE.AnimationClip[], name: AnimationName): THREE.AnimationClip | null {
  const want = new Set(ANIM_NAMES[name].map(norm));
  return clips.find((c) => want.has(norm(c.name))) ?? null;
}

export class GltfMech implements MechAsset {
  readonly config: MechConfig;
  readonly object: THREE.Group;

  private attachPoints = new Map<AttachPoint, THREE.Object3D>();
  private mixer: THREE.AnimationMixer | null = null;
  private actions = new Map<AnimationName, THREE.AnimationAction>();
  private activeAnim: AnimationName | null = null;
  private damageLevel = 0;
  private tintMaterials: THREE.MeshStandardMaterial[] = [];

  private constructor(root: THREE.Group, config: MechConfig, clips: THREE.AnimationClip[]) {
    this.config = config;
    this.object = root;
    if (!hasSkinnedMesh(root)) {
      this.object.name = `gltf_mech_${config.chassis}_team${config.team}`;
    }

    this.resolveAttachPoints();
    this.setupAnimations(clips);
    this.collectTintMaterials();
  }

  static async fromTemplate(template: GltfTemplate, config: MechConfig): Promise<GltfMech> {
    const root = cloneScene(template.scene);
    normalizeGltfToGround(root, config.chassis);

    const teamDefaults = TEAM_PALETTES[config.team];
    applySolidTeamMaterials(root, {
      primary: config.colorPrimary ?? teamDefaults.primary,
      secondary: config.colorSecondary ?? teamDefaults.secondary,
      accent: config.colorAccent ?? teamDefaults.accent,
    }, usesFlatEnemyPrimary(config.chassis) ? 'primary' : undefined);

    const object = wrapSkinnedRoot(root, config);
    return new GltfMech(object, config, template.animations);
  }

  getAttachPoint(name: AttachPoint): THREE.Object3D | null {
    return this.attachPoints.get(name) ?? null;
  }

  setFacing(degrees: number): void {
    const modelYaw = gameFacingToModelYaw(degrees);
    this.object.rotation.y = THREE.MathUtils.degToRad(modelYaw);
  }

  setDamageLevel(level: number): void {
    this.damageLevel = Math.max(0, Math.min(1, level));
    const primary = new THREE.Color(
      this.config.colorPrimary ?? TEAM_PALETTES[this.config.team].primary,
    );
    const damaged = new THREE.Color('#3a3a3a').lerp(primary, 1 - this.damageLevel);
    for (const m of this.tintMaterials) {
      if (m.userData.role === 'armor') m.color.copy(damaged);
    }
  }

  playAnimation(name: AnimationName): boolean {
    if (name === 'destroyed') {
      this.setDamageLevel(1);
    }

    const action = this.actions.get(name);
    if (!action) {
      if (name === 'fire' || name === 'hit') return false;
      return name === 'idle' || name === 'walk';
    }

    if (this.activeAnim && this.activeAnim !== name) {
      const prev = this.actions.get(this.activeAnim);
      prev?.fadeOut(0.15);
    }

    action.reset().fadeIn(0.12).play();
    if (name === 'fire' || name === 'hit') {
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
    } else {
      action.setLoop(THREE.LoopRepeat, Infinity);
    }

    this.activeAnim = name;
    return true;
  }

  tick(dt: number): void {
    this.mixer?.update(dt);
  }

  dispose(): void {
    this.mixer?.stopAllAction();
    this.object.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      mesh.geometry?.dispose();
      const mat = mesh.material;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else mat?.dispose();
    });
    this.attachPoints.clear();
    this.object.parent?.remove(this.object);
  }

  private resolveAttachPoints(): void {
    for (const [point, names] of Object.entries(ATTACH_NAMES) as Array<[AttachPoint, string[]]>) {
      const found = findByNames(this.object, names);
      if (found) {
        this.attachPoints.set(point, found);
        continue;
      }
    }

    // Fallback attach points so FX still work without Blender empties.
    if (!this.attachPoints.has('torso')) {
      const box = new THREE.Box3().setFromObject(this.object);
      const torso = new THREE.Object3D();
      const center = box.getCenter(new THREE.Vector3());
      torso.position.copy(center);
      this.object.add(torso);
      this.attachPoints.set('torso', torso);
    }
    if (!this.attachPoints.has('rightHand')) {
      this.attachPoints.set('rightHand', this.attachPoints.get('torso')!);
    }
    if (!this.attachPoints.has('rootGround')) {
      const ground = new THREE.Object3D();
      ground.position.set(0, 0.05, 0);
      this.object.add(ground);
      this.attachPoints.set('rootGround', ground);
    }
  }

  private setupAnimations(clips: THREE.AnimationClip[]): void {
    if (clips.length === 0) return;
    this.mixer = new THREE.AnimationMixer(this.object);
    for (const animName of Object.keys(ANIM_NAMES) as AnimationName[]) {
      const clip = findClip(clips, animName);
      if (!clip) continue;
      this.actions.set(animName, this.mixer.clipAction(clip));
    }
    this.playAnimation('idle');
  }

  private collectTintMaterials(): void {
    this.object.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh || !mesh.material) return;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const mat of materials) {
        if (mat instanceof THREE.MeshStandardMaterial && mat.userData.role === 'armor') {
          this.tintMaterials.push(mat);
        }
      }
    });
  }
}
