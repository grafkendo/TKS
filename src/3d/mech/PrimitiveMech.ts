// ============================================================================
// PrimitiveMech — procedural low-poly mech built from Three.js primitives.
//
// No external asset files needed: every piece is BoxGeometry / CylinderGeometry
// / IcosahedronGeometry composed in a `THREE.Group`. Flat shading + chunky
// proportions = readable mech silhouette without art assets.
//
// Three chassis presets (`light`, `medium`, `heavy`) and three weapon shapes
// (`cannon`, `missiles`, `beam`). Mix-and-match. Team colors blend in via the
// MechConfig palette.
//
// Animation right now is gentle (idle bob, fire recoil, hit shake). All
// time-based — driven by tick(dt).
//
// When we swap in glTF assets later (see GltfMech.ts — TODO), the rest of the
// game doesn't change because both implement the MechAsset interface.
// ============================================================================

import * as THREE from 'three';

import {
  AnimationName,
  AttachPoint,
  ChassisType,
  MechAsset,
  MechConfig,
  TEAM_PALETTES,
  WeaponType,
} from './types';

// ----- Chassis dimensions table --------------------------------------------
// All sizes are in world units (1 tile = ~2 units; mechs ~1.6 tall).

interface ChassisDims {
  torsoW: number; torsoH: number; torsoD: number;
  cockpitR: number;
  shoulderW: number; shoulderH: number;
  armL: number; armR: number;     // arm length
  legH: number; legR: number;
  totalScale: number;
}

const CHASSIS: Record<ChassisType, ChassisDims> = {
  light: {
    torsoW: 0.7, torsoH: 0.55, torsoD: 0.55,
    cockpitR: 0.22,
    shoulderW: 0.15, shoulderH: 0.18,
    armL: 0.55, armR: 0.10,
    legH: 0.70, legR: 0.14,
    totalScale: 1.0,
  },
  medium: {
    torsoW: 0.95, torsoH: 0.75, torsoD: 0.70,
    cockpitR: 0.26,
    shoulderW: 0.20, shoulderH: 0.22,
    armL: 0.65, armR: 0.14,
    legH: 0.80, legR: 0.18,
    totalScale: 1.0,
  },
  heavy: {
    torsoW: 1.25, torsoH: 0.95, torsoD: 0.95,
    cockpitR: 0.30,
    shoulderW: 0.28, shoulderH: 0.28,
    armL: 0.70, armR: 0.20,
    legH: 0.85, legR: 0.24,
    totalScale: 1.05,
  },
};

// ============================================================================

export class PrimitiveMech implements MechAsset {
  readonly config: MechConfig;
  readonly object: THREE.Group;

  private attachPoints = new Map<AttachPoint, THREE.Object3D>();
  private materials: THREE.MeshStandardMaterial[] = [];
  private geometries: THREE.BufferGeometry[] = [];

  // Animation state
  private timeSec = 0;
  private fireRecoilT = 0;   // 0..1 → cooldown of recent fire animation
  private hitShakeT = 0;     // 0..1 → recent hit shake
  private damageLevel = 0;   // 0 = pristine, 1 = wreckage
  private walkAmount = 0;    // 0 stationary → 1 fully walking (smoothed)
  private walkTarget = 0;    // 0 or 1 — set by setWalking()
  private walkPhase = 0;     // local time for leg swing (Hz-driven)

  private torsoGroup!: THREE.Group;
  private armRightGroup!: THREE.Group;
  private armLeftGroup?: THREE.Group;
  private legGroup!: THREE.Group;
  private legLeft?: THREE.Object3D;
  private legRight?: THREE.Object3D;

  constructor(config: MechConfig) {
    this.config = config;
    this.object = new THREE.Group();
    this.object.name = `mech_${config.chassis}_team${config.team}`;
    this.build();
  }

  // ---------------------------------------------------------------------------
  // MechAsset interface
  // ---------------------------------------------------------------------------

  getAttachPoint(name: AttachPoint): THREE.Object3D | null {
    return this.attachPoints.get(name) ?? null;
  }

  setFacing(degrees: number): void {
    this.object.rotation.y = THREE.MathUtils.degToRad(degrees);
  }

  setDamageLevel(level: number): void {
    this.damageLevel = Math.max(0, Math.min(1, level));
    // Tint armor toward gray as damage rises.
    const palette = this.resolvedColors();
    const primary = new THREE.Color(palette.primary);
    const damaged = new THREE.Color('#3a3a3a').lerp(primary, 1 - this.damageLevel);
    for (const m of this.materials) {
      if (m.userData?.role === 'armor') {
        m.color.copy(damaged);
      }
    }
  }

  playAnimation(name: AnimationName): boolean {
    switch (name) {
      case 'fire':
        this.fireRecoilT = 1.0;
        return true;
      case 'hit':
        this.hitShakeT = 1.0;
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

  /**
   * Convenience for movement systems: toggle walking on/off. The legs
   * smoothly ease in/out of the swing animation.
   */
  setWalking(active: boolean): void {
    this.walkTarget = active ? 1 : 0;
  }

  /** Called once per frame by the demo's render loop. */
  tick(dt: number): void {
    this.timeSec += dt;

    // ---- Walk amount easing (smooth start/stop) ----------------------------
    const walkLerp = 1 - Math.exp(-dt * 8);
    this.walkAmount += (this.walkTarget - this.walkAmount) * walkLerp;
    if (this.walkAmount > 0.001) this.walkPhase += dt;

    // ---- Idle bob (faster + more pronounced when walking) ------------------
    const baseBobAmp = 0.04;
    const baseBobHz = 0.6;
    const walkBobAmp = 0.10;
    const walkBobHz = 2.6;
    if (this.torsoGroup) {
      const idleY = Math.sin(this.timeSec * Math.PI * 2 * baseBobHz) * baseBobAmp;
      const walkY = Math.abs(Math.sin(this.walkPhase * Math.PI * 2 * walkBobHz / 2)) * walkBobAmp;
      const idleWeight = 1 - this.walkAmount;
      this.torsoGroup.position.y = this.idleBaseY() + idleY * idleWeight + walkY * this.walkAmount;
    }

    // ---- Leg swing while walking -------------------------------------------
    if (this.legLeft && this.legRight) {
      const swingAmp = 0.55 * this.walkAmount;
      const swing = Math.sin(this.walkPhase * Math.PI * 2 * walkBobHz);
      this.legLeft.rotation.x = swing * swingAmp;
      this.legRight.rotation.x = -swing * swingAmp;
    }

    // ---- Fire recoil -------------------------------------------------------
    if (this.fireRecoilT > 0) {
      this.fireRecoilT = Math.max(0, this.fireRecoilT - dt * 4);
      const back = -this.fireRecoilT * 0.35;
      this.armRightGroup.rotation.x = back;
      if (this.armLeftGroup) this.armLeftGroup.rotation.x = back * 0.6;
    } else {
      this.armRightGroup.rotation.x = 0;
      if (this.armLeftGroup) this.armLeftGroup.rotation.x = 0;
    }

    // ---- Hit shake ---------------------------------------------------------
    if (this.hitShakeT > 0) {
      this.hitShakeT = Math.max(0, this.hitShakeT - dt * 3.5);
      const k = this.hitShakeT * 0.06;
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

  // ---------------------------------------------------------------------------
  // Build (procedural geometry)
  // ---------------------------------------------------------------------------

  private idleBaseY(): number {
    const dims = CHASSIS[this.config.chassis];
    return dims.legH + dims.torsoH / 2;
  }

  private resolvedColors(): { primary: string; secondary: string; accent: string } {
    const teamDefaults = TEAM_PALETTES[this.config.team];
    return {
      primary:   this.config.colorPrimary   ?? teamDefaults.primary,
      secondary: this.config.colorSecondary ?? teamDefaults.secondary,
      accent:    this.config.colorAccent    ?? teamDefaults.accent,
    };
  }

  private armorMat(color: string): THREE.MeshStandardMaterial {
    const m = new THREE.MeshStandardMaterial({
      color: new THREE.Color(color),
      roughness: 0.55,
      metalness: 0.4,
      flatShading: true,
    });
    m.userData.role = 'armor';
    this.materials.push(m);
    return m;
  }

  private accentMat(color: string): THREE.MeshStandardMaterial {
    const m = new THREE.MeshStandardMaterial({
      color: new THREE.Color(color),
      roughness: 0.3,
      metalness: 0.5,
      emissive: new THREE.Color(color).multiplyScalar(0.3),
      flatShading: true,
    });
    m.userData.role = 'accent';
    this.materials.push(m);
    return m;
  }

  private trackGeom<T extends THREE.BufferGeometry>(g: T): T {
    this.geometries.push(g);
    return g;
  }

  private build(): void {
    const d = CHASSIS[this.config.chassis];
    const colors = this.resolvedColors();
    const armor = this.armorMat(colors.primary);
    const secondary = this.armorMat(colors.secondary);
    const accent = this.accentMat(colors.accent);

    this.object.scale.setScalar(d.totalScale);

    // ----- Legs (root level — mech "stands" on these) -----------------------
    // Each leg is a sub-Group pivoting around the hip so we can rotate the
    // whole leg (including foot) when walking.
    this.legGroup = new THREE.Group();
    const legGeom = this.trackGeom(new THREE.CylinderGeometry(d.legR, d.legR * 1.2, d.legH, 6));
    const footGeom = this.trackGeom(new THREE.BoxGeometry(d.legR * 2.4, d.legR * 0.6, d.legR * 2.6));
    const legSpread = d.torsoW * 0.30;

    for (const side of [-1, 1]) {
      const hip = new THREE.Group();
      // hip pivot sits at the TOP of the leg (where torso joins)
      hip.position.set(side * legSpread, d.legH, 0);

      const leg = new THREE.Mesh(legGeom, secondary);
      // shift down so the top of the cylinder is at hip y=0
      leg.position.set(0, -d.legH / 2, 0);
      leg.castShadow = true;
      leg.receiveShadow = true;
      hip.add(leg);

      const foot = new THREE.Mesh(footGeom, armor);
      foot.position.set(0, -d.legH + d.legR * 0.3, d.legR * 0.4);
      foot.castShadow = true;
      foot.receiveShadow = true;
      hip.add(foot);

      this.legGroup.add(hip);
      if (side === -1) this.legLeft = hip;
      else this.legRight = hip;
    }
    this.object.add(this.legGroup);

    // ----- Torso ------------------------------------------------------------
    this.torsoGroup = new THREE.Group();
    this.torsoGroup.position.y = this.idleBaseY();

    const torsoMesh = new THREE.Mesh(
      this.trackGeom(new THREE.BoxGeometry(d.torsoW, d.torsoH, d.torsoD)),
      armor
    );
    torsoMesh.castShadow = true;
    torsoMesh.receiveShadow = true;
    this.torsoGroup.add(torsoMesh);

    // chest "vent" stripe (accent)
    const vent = new THREE.Mesh(
      this.trackGeom(new THREE.BoxGeometry(d.torsoW * 0.5, d.torsoH * 0.15, 0.02)),
      accent
    );
    vent.position.set(0, d.torsoH * 0.05, d.torsoD / 2 + 0.001);
    this.torsoGroup.add(vent);

    // ----- Cockpit / head ---------------------------------------------------
    const cockpit = new THREE.Mesh(
      this.trackGeom(new THREE.IcosahedronGeometry(d.cockpitR, 0)),
      accent
    );
    cockpit.position.set(0, d.torsoH / 2 + d.cockpitR * 0.6, d.torsoD * 0.25);
    cockpit.castShadow = true;
    this.torsoGroup.add(cockpit);

    // headlight band (subtle)
    const band = new THREE.Mesh(
      this.trackGeom(new THREE.BoxGeometry(d.cockpitR * 1.4, d.cockpitR * 0.18, 0.02)),
      this.accentMat('#ffffff')
    );
    band.position.set(0, d.torsoH / 2 + d.cockpitR * 0.55, d.torsoD * 0.25 + d.cockpitR * 0.92);
    this.torsoGroup.add(band);

    // ----- Shoulders + arms -------------------------------------------------
    const buildArm = (side: -1 | 1, weapon: WeaponType): THREE.Group => {
      const arm = new THREE.Group();
      arm.position.set(side * (d.torsoW / 2 + d.shoulderW / 2), d.torsoH * 0.10, 0);

      // shoulder pad
      const shoulder = new THREE.Mesh(
        this.trackGeom(new THREE.BoxGeometry(d.shoulderW * 1.4, d.shoulderH * 1.2, d.torsoD * 0.85)),
        secondary
      );
      shoulder.castShadow = true;
      arm.add(shoulder);

      // upper arm
      const upper = new THREE.Mesh(
        this.trackGeom(new THREE.CylinderGeometry(d.armR, d.armR * 0.85, d.armL * 0.55, 6)),
        armor
      );
      upper.position.set(side * 0.05, -d.armL * 0.30, 0);
      upper.castShadow = true;
      arm.add(upper);

      // forearm + weapon end (varies by weapon type)
      const weaponGroup = this.buildWeapon(weapon, d, armor, secondary, accent);
      weaponGroup.position.set(side * 0.05, -d.armL * 0.78, 0);
      arm.add(weaponGroup);

      // attach point at the tip of the weapon (for muzzle flashes etc.)
      const tip = new THREE.Object3D();
      tip.position.set(0, 0, d.armR * 4); // forward of the weapon mouth
      weaponGroup.add(tip);
      this.attachPoints.set(side === 1 ? 'rightHand' : 'leftHand', tip);

      return arm;
    };

    this.armRightGroup = buildArm(1, this.config.weaponRight);
    this.torsoGroup.add(this.armRightGroup);

    if (this.config.weaponLeft) {
      this.armLeftGroup = buildArm(-1, this.config.weaponLeft);
      this.torsoGroup.add(this.armLeftGroup);
    }

    // ----- Heavy chassis extras: shoulder turrets ---------------------------
    if (this.config.chassis === 'heavy') {
      const turretGeom = this.trackGeom(new THREE.BoxGeometry(0.3, 0.2, 0.5));
      for (const side of [-1, 1]) {
        const turret = new THREE.Mesh(turretGeom, secondary);
        turret.position.set(side * d.torsoW * 0.42, d.torsoH * 0.42 + 0.1, -d.torsoD * 0.1);
        turret.castShadow = true;
        this.torsoGroup.add(turret);

        const barrel = new THREE.Mesh(
          this.trackGeom(new THREE.CylinderGeometry(0.05, 0.05, 0.45, 6)),
          accent
        );
        barrel.rotation.x = Math.PI / 2;
        barrel.position.set(side * d.torsoW * 0.42, d.torsoH * 0.42 + 0.1, -d.torsoD * 0.1 + 0.35);
        this.torsoGroup.add(barrel);

        const ap = new THREE.Object3D();
        ap.position.set(side * d.torsoW * 0.42, d.torsoH * 0.42 + 0.1, -d.torsoD * 0.1 + 0.6);
        this.torsoGroup.add(ap);
        this.attachPoints.set(side === 1 ? 'shoulderR' : 'shoulderL', ap);
      }
    }

    this.object.add(this.torsoGroup);

    // ----- Logical attach points --------------------------------------------
    const torsoAttach = new THREE.Object3D();
    torsoAttach.position.set(0, 0, d.torsoD / 2);
    this.torsoGroup.add(torsoAttach);
    this.attachPoints.set('torso', torsoAttach);

    const headAttach = new THREE.Object3D();
    headAttach.position.copy(cockpit.position);
    this.torsoGroup.add(headAttach);
    this.attachPoints.set('head', headAttach);

    const rootGround = new THREE.Object3D();
    rootGround.position.set(0, 0.05, 0);
    this.object.add(rootGround);
    this.attachPoints.set('rootGround', rootGround);
  }

  private buildWeapon(
    type: WeaponType,
    d: ChassisDims,
    armor: THREE.MeshStandardMaterial,
    _secondary: THREE.MeshStandardMaterial,
    accent: THREE.MeshStandardMaterial
  ): THREE.Group {
    const g = new THREE.Group();
    switch (type) {
      case 'cannon': {
        const body = new THREE.Mesh(
          this.trackGeom(new THREE.BoxGeometry(d.armR * 1.7, d.armR * 1.7, d.armL * 0.55)),
          armor
        );
        body.position.z = d.armR * 1.5;
        body.castShadow = true;
        g.add(body);

        const barrel = new THREE.Mesh(
          this.trackGeom(new THREE.CylinderGeometry(d.armR * 0.6, d.armR * 0.6, d.armL * 0.7, 8)),
          armor
        );
        barrel.rotation.x = Math.PI / 2;
        barrel.position.z = d.armR * 3;
        barrel.castShadow = true;
        g.add(barrel);

        const tip = new THREE.Mesh(
          this.trackGeom(new THREE.CylinderGeometry(d.armR * 0.75, d.armR * 0.55, 0.08, 8)),
          accent
        );
        tip.rotation.x = Math.PI / 2;
        tip.position.z = d.armR * 4.0;
        g.add(tip);
        break;
      }

      case 'missiles': {
        const body = new THREE.Mesh(
          this.trackGeom(new THREE.BoxGeometry(d.armR * 2.6, d.armR * 1.8, d.armL * 0.6)),
          armor
        );
        body.position.z = d.armR * 1.7;
        body.castShadow = true;
        g.add(body);

        // 3×2 grid of missile tubes
        const tubeGeom = this.trackGeom(new THREE.CylinderGeometry(d.armR * 0.35, d.armR * 0.35, 0.18, 6));
        for (let ix = -1; ix <= 1; ix++) {
          for (let iy = -0.5; iy <= 0.5; iy += 1) {
            const tube = new THREE.Mesh(tubeGeom, accent);
            tube.rotation.x = Math.PI / 2;
            tube.position.set(ix * d.armR * 0.8, iy * d.armR * 0.9, d.armR * 3);
            g.add(tube);
          }
        }
        break;
      }

      case 'beam': {
        const body = new THREE.Mesh(
          this.trackGeom(new THREE.BoxGeometry(d.armR * 1.4, d.armR * 1.4, d.armL * 0.5)),
          armor
        );
        body.position.z = d.armR * 1.5;
        body.castShadow = true;
        g.add(body);

        // Long, slender focus rod with a glowing tip
        const rod = new THREE.Mesh(
          this.trackGeom(new THREE.CylinderGeometry(d.armR * 0.18, d.armR * 0.18, d.armL * 0.9, 6)),
          armor
        );
        rod.rotation.x = Math.PI / 2;
        rod.position.z = d.armR * 3.2;
        g.add(rod);

        const lens = new THREE.Mesh(
          this.trackGeom(new THREE.IcosahedronGeometry(d.armR * 0.45, 0)),
          accent
        );
        lens.position.z = d.armR * 4.5;
        g.add(lens);
        break;
      }
    }
    return g;
  }
}
