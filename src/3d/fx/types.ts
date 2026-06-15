// ============================================================================
// FX system interface.
//
// Same pattern as MechAsset: the rest of the game only depends on this
// interface, so we can swap in a fancier implementation later (GPU particles,
// custom shaders, post-processing) without touching gameplay code.
// ============================================================================

import * as THREE from 'three';

export interface MuzzleFlashOptions {
  position: THREE.Vector3;
  /** Forward direction (where the shot is going). */
  direction: THREE.Vector3;
  color?: string;
  intensity?: number; // 0..2, defaults to 1
}

export interface ImpactOptions {
  position: THREE.Vector3;
  color?: string;
  intensity?: number;
}

export interface BeamOptions {
  from: THREE.Vector3;
  to: THREE.Vector3;
  color?: string;
  durationSec?: number;
  thickness?: number;
}

export interface ExplosionOptions {
  position: THREE.Vector3;
  scale?: number;
  color?: string;
}

export interface EffectsSystem {
  readonly root: THREE.Object3D;
  /** Spawn a brief muzzle flash burst at the gun barrel tip. */
  muzzleFlash(opts: MuzzleFlashOptions): void;
  /** Spawn an impact burst where a shot landed. */
  impact(opts: ImpactOptions): void;
  /** Draw a fading beam between two points (for beam weapons). */
  beam(opts: BeamOptions): void;
  /** Spawn an explosion FX for destroyed units. */
  explosion(opts: ExplosionOptions): void;
  /** Frame update — animate any active FX. */
  tick(dt: number): void;
  /** Release all GPU resources. */
  dispose(): void;
}
