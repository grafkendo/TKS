// ============================================================================
// GltfMech — loads Blender-exported .glb files implementing MechAsset.
//
// Blender checklist: public/assets/mechs/README.md
// ============================================================================

import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';

import type { GltfTemplate } from './gltfCache';
import {
  AnimationName,
  AttachPoint,
  MechAsset,
  MechConfig,
  TEAM_PALETTES,
  gameFacingToModelYaw,
} from './types';

/** Target standing height in world units (matches PrimitiveMech ~1.6). */
const TARGET_HEIGHT = 1.6;

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

const TEAM_MAT_NAMES: Record<'primary' | 'secondary' | 'accent', string[]> = {
  primary: ['teamprimary', 'primary', 'armor', 'body'],
  secondary: ['teamsecondary', 'secondary', 'joint'],
  accent: ['teamaccent', 'accent', 'visor', 'light'],
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

function normalizeToGround(root: THREE.Object3D, targetHeight: number): void {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  if (box.isEmpty()) return;

  const size = box.getSize(new THREE.Vector3());
  if (size.y > 0.001) {
    const s = targetHeight / size.y;
    root.scale.multiplyScalar(s);
  }

  root.updateMatrixWorld(true);
  box.setFromObject(root);
  root.position.y -= box.min.y;

  box.setFromObject(root);
  const center = box.getCenter(new THREE.Vector3());
  root.position.x -= center.x;
  root.position.z -= center.z;
}

function applyTeamPalette(root: THREE.Object3D, palette: { primary: string; secondary: string; accent: string }): void {
  const colorMap: Record<string, string> = {};
  for (const [role, names] of Object.entries(TEAM_MAT_NAMES) as Array<
    ['primary' | 'secondary' | 'accent', string[]]
  >) {
    for (const n of names) colorMap[norm(n)] = palette[role];
  }

  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || !mesh.material) return;

    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const mat of materials) {
      if (!(mat instanceof THREE.MeshStandardMaterial)) continue;
      const matKey = norm(mat.name);
      const meshKey = norm(mesh.name);
      let hex: string | undefined;
      for (const [key, color] of Object.entries(colorMap)) {
        if (matKey.includes(key) || meshKey.includes(key)) {
          hex = color;
          break;
        }
      }
      if (!hex && matKey.length === 0 && meshKey.includes('armor')) hex = palette.primary;
      if (hex) {
        mat.color.set(hex);
        mat.userData.role = 'armor';
        mat.userData.baseColor = hex;
      }
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }
  });
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
    this.object.name = `gltf_mech_${config.chassis}_team${config.team}`;

    this.resolveAttachPoints();
    this.setupAnimations(clips);
    this.collectTintMaterials();
  }

  static async fromTemplate(template: GltfTemplate, config: MechConfig): Promise<GltfMech> {
    const root = cloneScene(template.scene);
    normalizeToGround(root, TARGET_HEIGHT);

    const teamDefaults = TEAM_PALETTES[config.team];
    applyTeamPalette(root, {
      primary: config.colorPrimary ?? teamDefaults.primary,
      secondary: config.colorSecondary ?? teamDefaults.secondary,
      accent: config.colorAccent ?? teamDefaults.accent,
    });

    return new GltfMech(root, config, template.animations);
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
