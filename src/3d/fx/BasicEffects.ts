// ============================================================================
// BasicEffects — first-pass FX implementation.
//
// Strategy: pool-allocated simple meshes (no per-spawn allocations during play).
// Each active effect has a timer; on update we lerp scale/opacity then return
// to the pool when done.
//
// Replaceable later by:
//   - GpuParticleEffects (instanced mesh + custom shader for many particles)
//   - VolumetricEffects (shader-based smoke/fire, post-processing bloom)
//
// All of which would just implement the same EffectsSystem interface.
// ============================================================================

import * as THREE from 'three';

import {
  BeamOptions,
  EffectsSystem,
  ExplosionOptions,
  ImpactOptions,
  MuzzleFlashOptions,
  ProjectileOptions,
} from './types';

interface ActiveEffect {
  mesh: THREE.Mesh | THREE.LineSegments;
  ageSec: number;
  lifeSec: number;
  startScale: number;
  endScale: number;
  startOpacity: number;
  color: THREE.Color;
}

interface ActiveProjectile {
  mesh: THREE.Mesh;
  glow: THREE.Mesh;
  from: THREE.Vector3;
  to: THREE.Vector3;
  dist: number;
  ageSec: number;
  travelSec: number;
  color: THREE.Color;
  thickness: number;
}

const DEFAULT_FLASH_COLOR = '#ffcf6e';
const DEFAULT_IMPACT_COLOR = '#ffb04d';
const DEFAULT_BEAM_COLOR = '#a8d5ff';
const DEFAULT_PROJECTILE_COLOR = '#7ecbff';
const DEFAULT_EXPLOSION_COLOR = '#ff7a3d';
const _up = new THREE.Vector3(0, 1, 0);
const _dir = new THREE.Vector3();
const _pos = new THREE.Vector3();

export class BasicEffects implements EffectsSystem {
  readonly root = new THREE.Group();

  private active: ActiveEffect[] = [];
  private projectiles: ActiveProjectile[] = [];
  private pool: THREE.Mesh[] = [];

  // Reusable geometries / materials
  private flashGeom = new THREE.IcosahedronGeometry(0.18, 0);
  private impactGeom = new THREE.IcosahedronGeometry(0.12, 1);
  private explosionGeom = new THREE.IcosahedronGeometry(0.4, 1);

  constructor() {
    this.root.name = 'fx-root';
  }

  // -- public API -----------------------------------------------------------

  muzzleFlash(opts: MuzzleFlashOptions): void {
    const color = new THREE.Color(opts.color ?? DEFAULT_FLASH_COLOR);
    const intensity = opts.intensity ?? 1;
    const mesh = this.acquireMesh(this.flashGeom, color);
    mesh.position.copy(opts.position);
    this.active.push({
      mesh,
      ageSec: 0,
      lifeSec: 0.18,
      startScale: 1.0 * intensity,
      endScale: 2.4 * intensity,
      startOpacity: 1.0,
      color,
    });
  }

  impact(opts: ImpactOptions): void {
    const color = new THREE.Color(opts.color ?? DEFAULT_IMPACT_COLOR);
    const mesh = this.acquireMesh(this.impactGeom, color);
    mesh.position.copy(opts.position);
    this.active.push({
      mesh,
      ageSec: 0,
      lifeSec: 0.35,
      startScale: 0.5,
      endScale: 2.2 * (opts.intensity ?? 1),
      startOpacity: 0.95,
      color,
    });
  }

  beam(opts: BeamOptions): void {
    const color = new THREE.Color(opts.color ?? DEFAULT_BEAM_COLOR);
    const lifeSec = opts.durationSec ?? 0.25;
    const geom = new THREE.BufferGeometry().setFromPoints([opts.from.clone(), opts.to.clone()]);
    const mat = new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity: 0.95,
      linewidth: 1,
      depthWrite: false,
    });
    const line = new THREE.LineSegments(geom, mat);
    this.root.add(line);
    this.active.push({
      mesh: line as unknown as THREE.Mesh,
      ageSec: 0,
      lifeSec,
      startScale: 1,
      endScale: 1,
      startOpacity: 0.95,
      color,
    });
  }

  projectile(opts: ProjectileOptions): void {
    const color = new THREE.Color(opts.color ?? DEFAULT_PROJECTILE_COLOR);
    const thickness = opts.thickness ?? 0.14;
    const dist = opts.from.distanceTo(opts.to);
    const speed = opts.speed ?? 48;
    const travelSec = Math.max(0.05, dist / speed);

    const coreGeom = new THREE.CylinderGeometry(thickness * 0.55, thickness * 0.35, 1, 10);
    const glowGeom = new THREE.CylinderGeometry(thickness * 1.35, thickness * 0.9, 1, 10);
    const coreMat = new THREE.MeshBasicMaterial({
      color: '#ffffff',
      transparent: true,
      opacity: 1,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const glowMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    const mesh = new THREE.Mesh(coreGeom, coreMat);
    const glow = new THREE.Mesh(glowGeom, glowMat);
    mesh.frustumCulled = false;
    glow.frustumCulled = false;
    mesh.add(glow);
    this.root.add(mesh);

    _dir.subVectors(opts.to, opts.from);
    if (_dir.lengthSq() > 1e-6) {
      mesh.quaternion.setFromUnitVectors(_up, _dir.normalize());
    }
    mesh.position.copy(opts.from);
    mesh.scale.y = Math.max(0.35, dist * 0.22);

    this.projectiles.push({
      mesh,
      glow,
      from: opts.from.clone(),
      to: opts.to.clone(),
      dist,
      ageSec: 0,
      travelSec,
      color,
      thickness,
    });
  }

  explosion(opts: ExplosionOptions): void {
    const color = new THREE.Color(opts.color ?? DEFAULT_EXPLOSION_COLOR);
    const scale = opts.scale ?? 1;
    const mesh = this.acquireMesh(this.explosionGeom, color);
    mesh.position.copy(opts.position);
    this.active.push({
      mesh,
      ageSec: 0,
      lifeSec: 0.55,
      startScale: 0.7 * scale,
      endScale: 3.2 * scale,
      startOpacity: 1.0,
      color,
    });

    // pair with a "shockwave" smaller flash
    const flash = this.acquireMesh(this.flashGeom, new THREE.Color('#ffe2a4'));
    flash.position.copy(opts.position);
    this.active.push({
      mesh: flash,
      ageSec: 0,
      lifeSec: 0.18,
      startScale: 1 * scale,
      endScale: 3.5 * scale,
      startOpacity: 1,
      color: new THREE.Color('#ffe2a4'),
    });
  }

  tick(dt: number): void {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.ageSec += dt;
      const t = Math.min(1, p.ageSec / p.travelSec);
      _pos.lerpVectors(p.from, p.to, t);
      p.mesh.position.copy(_pos);
      _dir.subVectors(p.to, p.from);
      if (_dir.lengthSq() > 1e-6) {
        p.mesh.quaternion.setFromUnitVectors(_up, _dir.normalize());
      }
      const pulse = 1 + Math.sin(p.ageSec * 42) * 0.12;
      p.mesh.scale.set(p.thickness * pulse, Math.max(0.35, p.dist * 0.22), p.thickness * pulse);
      const fade = t > 0.82 ? 1 - (t - 0.82) / 0.18 : 1;
      (p.mesh.material as THREE.MeshBasicMaterial).opacity = fade;
      (p.glow.material as THREE.MeshBasicMaterial).opacity = 0.85 * fade;
      if (t >= 1) {
        this.releaseProjectile(p);
        this.projectiles.splice(i, 1);
      }
    }

    for (let i = this.active.length - 1; i >= 0; i--) {
      const e = this.active[i];
      e.ageSec += dt;
      const t = e.ageSec / e.lifeSec;
      if (t >= 1) {
        this.releaseEffect(e);
        this.active.splice(i, 1);
        continue;
      }
      const scale = THREE.MathUtils.lerp(e.startScale, e.endScale, t);
      const opacity = e.startOpacity * (1 - t);
      e.mesh.scale.setScalar(scale);
      const mat = e.mesh.material as THREE.Material & { opacity?: number };
      if ('opacity' in mat) mat.opacity = opacity;
    }
  }

  dispose(): void {
    for (const p of this.projectiles) this.releaseProjectile(p);
    for (const e of this.active) this.releaseEffect(e);
    for (const m of this.pool) {
      this.root.remove(m);
      (m.material as THREE.Material).dispose();
    }
    this.flashGeom.dispose();
    this.impactGeom.dispose();
    this.explosionGeom.dispose();
    this.active = [];
    this.projectiles = [];
    this.pool = [];
  }

  private releaseProjectile(p: ActiveProjectile): void {
    this.root.remove(p.mesh);
    p.mesh.geometry.dispose();
    (p.mesh.material as THREE.Material).dispose();
    p.glow.geometry.dispose();
    (p.glow.material as THREE.Material).dispose();
  }

  // -- internals ------------------------------------------------------------

  private acquireMesh(geom: THREE.BufferGeometry, color: THREE.Color): THREE.Mesh {
    let mesh = this.pool.pop();
    if (!mesh) {
      const mat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 1,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      mesh = new THREE.Mesh(geom, mat);
      mesh.frustumCulled = false;
      this.root.add(mesh);
    } else {
      (mesh.material as THREE.MeshBasicMaterial).color.copy(color);
      (mesh.material as THREE.MeshBasicMaterial).opacity = 1;
      mesh.geometry = geom;
      mesh.visible = true;
    }
    return mesh;
  }

  private releaseEffect(e: ActiveEffect): void {
    if (e.mesh instanceof THREE.LineSegments) {
      this.root.remove(e.mesh);
      e.mesh.geometry.dispose();
      (e.mesh.material as THREE.Material).dispose();
      return;
    }
    e.mesh.visible = false;
    this.pool.push(e.mesh as THREE.Mesh);
  }
}
