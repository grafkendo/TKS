// ============================================================================
// SpiderMech — low-poly spider drone with textured carapace and 8 legs.
//
// Used for enemy archetypes (grunt / scout). Implements MechAsset so gameplay
// code treats it like any other mech.
// ============================================================================

import * as THREE from 'three';

import {
  AnimationName,
  AttachPoint,
  MechAsset,
  MechConfig,
  TEAM_PALETTES,
  WeaponType,
  gameFacingToModelYaw,
} from './types';

const BODY_W = 0.82;
const BODY_H = 0.28;
const BODY_D = 0.62;
const LEG_LEN = 0.42;
const LEG_R = 0.045;
const EYE_COLOR = '#ff3a2e';

export class SpiderMech implements MechAsset {
  readonly config: MechConfig;
  readonly object: THREE.Group;

  private attachPoints = new Map<AttachPoint, THREE.Object3D>();
  private geometries: THREE.BufferGeometry[] = [];
  private materials: THREE.MeshStandardMaterial[] = [];
  private legs: THREE.Group[] = [];
  private bodyGroup!: THREE.Group;

  private fireRecoilT = 0;
  private hitShakeT = 0;
  private damageLevel = 0;
  private walkAmount = 0;
  private walkTarget = 0;
  private walkPhase = 0;
  private bodyMat!: THREE.MeshStandardMaterial;

  private constructor(config: MechConfig) {
    this.config = config;
    this.object = new THREE.Group();
    this.object.name = `spider_${config.team}`;
    this.build();
  }

  static async create(config: MechConfig): Promise<SpiderMech> {
    return new SpiderMech(config);
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
    const damaged = new THREE.Color('#2a2a2a').lerp(primary, 1 - this.damageLevel);
    if (this.bodyMat.userData.role === 'armor') {
      this.bodyMat.color.copy(damaged);
    }
  }

  playAnimation(name: AnimationName): boolean {
    switch (name) {
      case 'fire':
        this.fireRecoilT = 1;
        return true;
      case 'hit':
        this.hitShakeT = 1;
        return true;
      case 'destroyed':
        this.setDamageLevel(1);
        return true;
      case 'idle':
        this.walkTarget = 0;
        return true;
      case 'walk':
        this.walkTarget = 1;
        return true;
    }
  }

  tick(dt: number): void {
    const walkLerp = 1 - Math.exp(-dt * 8);
    this.walkAmount += (this.walkTarget - this.walkAmount) * walkLerp;
    if (this.walkAmount > 0.001) this.walkPhase += dt;

    const bob = Math.sin(this.walkPhase * (this.walkAmount > 0.1 ? 9 : 2)) * 0.02 * this.walkAmount;
    this.bodyGroup.position.y = BODY_H * 0.55 + bob + 0.02;

    for (let i = 0; i < this.legs.length; i++) {
      const leg = this.legs[i];
      const phase = this.walkPhase * 8 + i * Math.PI * 0.5;
      const lift = Math.max(0, Math.sin(phase)) * 0.35 * this.walkAmount;
      leg.rotation.x = -0.55 + lift;
    }

    if (this.fireRecoilT > 0) {
      this.fireRecoilT = Math.max(0, this.fireRecoilT - dt * 4);
      this.bodyGroup.position.z = -this.fireRecoilT * 0.06;
    } else {
      this.bodyGroup.position.z = 0;
    }

    if (this.hitShakeT > 0) {
      this.hitShakeT = Math.max(0, this.hitShakeT - dt * 3.5);
      const k = this.hitShakeT * 0.05;
      this.object.position.x += (Math.random() - 0.5) * k;
      this.object.position.z += (Math.random() - 0.5) * k;
    }
  }

  dispose(): void {
    for (const g of this.geometries) g.dispose();
    for (const m of this.materials) m.dispose();
    this.attachPoints.clear();
    this.object.parent?.remove(this.object);
  }

  private resolvedColors(): { primary: string; secondary: string; accent: string } {
    const teamDefaults = TEAM_PALETTES[this.config.team];
    return {
      primary: this.config.colorPrimary ?? teamDefaults.primary,
      secondary: this.config.colorSecondary ?? teamDefaults.secondary,
      accent: this.config.colorAccent ?? teamDefaults.accent,
    };
  }

  private trackGeom<T extends THREE.BufferGeometry>(g: T): T {
    this.geometries.push(g);
    return g;
  }

  private trackMat(m: THREE.MeshStandardMaterial): THREE.MeshStandardMaterial {
    this.materials.push(m);
    return m;
  }

  private build(): void {
    const colors = this.resolvedColors();

    this.bodyMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: new THREE.Color(colors.primary),
        roughness: 0.86,
        metalness: 0.08,
        flatShading: true,
      }),
    );
    this.bodyMat.userData.role = 'armor';

    const legMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: new THREE.Color(colors.secondary),
        roughness: 0.5,
        metalness: 0.55,
        flatShading: true,
      }),
    );

    const eyeMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: EYE_COLOR,
        emissive: new THREE.Color(EYE_COLOR),
        emissiveIntensity: 1.4,
        roughness: 0.25,
        metalness: 0.2,
      }),
    );

    this.bodyGroup = new THREE.Group();
    this.object.add(this.bodyGroup);

    const body = new THREE.Mesh(
      this.trackGeom(new THREE.BoxGeometry(BODY_W, BODY_H, BODY_D)),
      this.bodyMat,
    );
    body.position.y = BODY_H * 0.55;
    body.castShadow = true;
    body.receiveShadow = true;
    this.bodyGroup.add(body);

    const head = new THREE.Mesh(
      this.trackGeom(new THREE.BoxGeometry(BODY_W * 0.35, BODY_H * 0.7, BODY_D * 0.28)),
      this.bodyMat,
    );
    head.position.set(0, BODY_H * 0.62, BODY_D * 0.42);
    head.castShadow = true;
    this.bodyGroup.add(head);

    for (const side of [-1, 1] as const) {
      const eye = new THREE.Mesh(
        this.trackGeom(new THREE.SphereGeometry(0.04, 8, 8)),
        eyeMat,
      );
      eye.position.set(side * 0.08, BODY_H * 0.68, BODY_D * 0.54);
      this.bodyGroup.add(eye);
    }

    const legGeom = this.trackGeom(new THREE.CylinderGeometry(LEG_R, LEG_R * 0.7, LEG_LEN, 6));
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const hip = new THREE.Group();
      hip.position.set(
        Math.sin(angle) * BODY_W * 0.42,
        BODY_H * 0.35,
        Math.cos(angle) * BODY_D * 0.38,
      );
      hip.rotation.y = angle;

      const leg = new THREE.Mesh(legGeom, legMat);
      leg.position.set(0, -LEG_LEN / 2, LEG_LEN * 0.15);
      leg.rotation.x = -0.55;
      leg.castShadow = true;
      hip.add(leg);
      this.bodyGroup.add(hip);
      this.legs.push(hip);
    }

    const weapon = this.buildWeapon(this.config.weaponRight, colors.accent);
    weapon.position.set(0, BODY_H * 0.45, BODY_D * 0.52);
    this.bodyGroup.add(weapon);

    const torso = new THREE.Object3D();
    torso.position.y = BODY_H * 0.55;
    this.bodyGroup.add(torso);
    this.attachPoints.set('torso', torso);

    const headPt = new THREE.Object3D();
    headPt.position.set(0, BODY_H * 0.7, BODY_D * 0.45);
    this.bodyGroup.add(headPt);
    this.attachPoints.set('head', headPt);

    const ground = new THREE.Object3D();
    ground.position.y = 0.02;
    this.object.add(ground);
    this.attachPoints.set('rootGround', ground);

    const muzzle = new THREE.Object3D();
    muzzle.position.set(0, 0, 0.22);
    weapon.add(muzzle);
    this.attachPoints.set('rightHand', muzzle);
    this.attachPoints.set('leftHand', muzzle);
  }

  private buildWeapon(weapon: WeaponType, accent: string): THREE.Group {
    const group = new THREE.Group();
    const accentMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: accent,
        emissive: new THREE.Color(accent).multiplyScalar(0.35),
        roughness: 0.35,
        metalness: 0.6,
        flatShading: true,
      }),
    );
    const barrelMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: '#3a3f44',
        roughness: 0.45,
        metalness: 0.7,
        flatShading: true,
      }),
    );

    if (weapon === 'beam') {
      const rod = new THREE.Mesh(
        this.trackGeom(new THREE.CylinderGeometry(0.03, 0.03, 0.28, 8)),
        accentMat,
      );
      rod.rotation.x = Math.PI / 2;
      group.add(rod);
    } else if (weapon === 'missiles') {
      for (const side of [-1, 1]) {
        const pod = new THREE.Mesh(
          this.trackGeom(new THREE.BoxGeometry(0.06, 0.06, 0.2)),
          barrelMat,
        );
        pod.position.x = side * 0.07;
        group.add(pod);
      }
    } else {
      const barrel = new THREE.Mesh(
        this.trackGeom(new THREE.CylinderGeometry(0.05, 0.06, 0.3, 8)),
        barrelMat,
      );
      barrel.rotation.x = Math.PI / 2;
      group.add(barrel);
      const muzzleGlow = new THREE.Mesh(
        this.trackGeom(new THREE.CylinderGeometry(0.035, 0.035, 0.04, 8)),
        accentMat,
      );
      muzzleGlow.rotation.x = Math.PI / 2;
      muzzleGlow.position.z = 0.17;
      group.add(muzzleGlow);
    }
    return group;
  }
}
