// ============================================================================
// Mech asset types.
//
// The KEY ABSTRACTION: code that places, animates, and manipulates mechs must
// only depend on the `MechAsset` interface. The current implementation
// (`PrimitiveMech`) builds geometry from Three.js primitives. A future
// `GltfMech` (or `RiggedMech`) implementation loads textured models and rigged
// animations — but to the rest of the game it's the same interface.
//
// This means we can swap art in piece by piece (one chassis at a time) without
// touching gameplay code.
// ============================================================================

import * as THREE from 'three';

export type Team = 1 | 2;

export type ChassisType = 'light' | 'medium' | 'heavy' | 'spider' | 'straznik' | 'atreides';
export type WeaponType  = 'cannon' | 'missiles' | 'beam';

/** Stable, art-agnostic identifiers for where to attach effects / projectiles. */
export type AttachPoint =
  | 'rightHand'    // weapon mount, right arm tip
  | 'leftHand'     // weapon mount, left arm tip
  | 'shoulderR'    // shoulder-mounted weapon (heavies)
  | 'shoulderL'
  | 'torso'        // chest center (impact target)
  | 'head'         // cockpit point
  | 'rootGround';  // feet center (smoke/dust spawn)

export type AnimationName =
  | 'idle'
  | 'walk'
  | 'fire'
  | 'hit'
  | 'destroyed';

export interface MechConfig {
  chassis: ChassisType;
  team: Team;
  /** Primary armor color (defaults derived from team if omitted). */
  colorPrimary?: string;   // hex like "#cc4444"
  colorSecondary?: string;
  colorAccent?: string;
  weaponRight: WeaponType;
  weaponLeft?: WeaponType;
}

/**
 * The interface every mech implementation must satisfy.
 *
 * Implementations: PrimitiveMech (now), GltfMech (future).
 *
 * Contract rules:
 *   - `object` must be a single THREE.Object3D the caller can position/rotate.
 *   - `getAttachPoint(name)` must return a *world-space-up-to-date* Object3D
 *      whose `.getWorldPosition()` gives the correct spawn location for FX.
 *   - `setFacing(degrees)` rotates around world Y. 0 = facing +X, 90 = +Z.
 *   - `playAnimation(name)` may be a no-op (return false) for implementations
 *      that don't support a given anim. Caller should not depend on completion.
 *   - `dispose()` MUST release all GPU resources (geometry & material).
 */
export interface MechAsset {
  readonly config: MechConfig;
  readonly object: THREE.Object3D;

  getAttachPoint(name: AttachPoint): THREE.Object3D | null;
  setFacing(degrees: number): void;
  setDamageLevel(level: number): void; // 0 = full, 1 = destroyed
  playAnimation(name: AnimationName): boolean;
  /** Per-frame update (procedural bob / glTF animation mixer). */
  tick(dt: number): void;
  dispose(): void;
}

// ---------------------------------------------------------------------------
// Loader / factory abstraction.
//
// Code that wants a mech just calls `assetLoader.loadMech(config)`. The
// loader decides between procedural vs. glTF based on registration.
// ---------------------------------------------------------------------------

export interface MechAssetLoader {
  loadMech(config: MechConfig): Promise<MechAsset>;
}

/**
 * Team palette defaults — used when MechConfig doesn't override colors.
 * Tweak these to retune the overall feel.
 */
export const TEAM_PALETTES: Record<Team, { primary: string; secondary: string; accent: string }> = {
  1: { primary: '#cc4543', secondary: '#3a2424', accent: '#ffce4d' }, // red
  2: { primary: '#3b6ee9', secondary: '#1f2a47', accent: '#a8d5ff' }, // blue
};

/**
 * Movement is a per-unit Stat (see src/3d/stats/Stat.ts) with base 1.
 * That's the *only* default — chassis class, equipment, status effects, etc.
 * are all expressed as additive modifiers on top of that base, added or
 * removed at runtime via Stat.addModifier / Stat.removeModifier.
 *
 * The table below is a *suggested* chassis bonus you can opt into if you
 * want lighter chassis to move further. It is NOT applied automatically;
 * every freshly-spawned unit has effective movement = base = 1.
 *
 * To opt in for a specific unit:
 *   unit.movement.addModifier({
 *     source: CHASSIS_MOVEMENT_SOURCE,
 *     delta:  CHASSIS_MOVEMENT_BONUS[unit.chassis],
 *     label:  `${unit.chassis} chassis`,
 *   });
 *
 * Source-string convention: "chassis" so it's trivial to remove later
 * (e.g. when swapping chassis components mid-mission).
 */
export const CHASSIS_MOVEMENT_BONUS: Record<ChassisType, number> = {
  light:  +3,
  medium: +2,
  heavy:  +1,
  spider: +3,
  straznik: +2,
  atreides: +1,
};

export const CHASSIS_MOVEMENT_SOURCE = 'chassis';

/**
 * Attack range is also a per-unit Stat with base 2 — every unit can fire
 * at targets 1 or 2 hexes away by default. Modifiers (`+N`/`-N`) live in
 * the same Stat architecture as movement.
 *
 * `ATTACK_RANGE_BASE` is the spawn-time base value; tweak per game mode.
 */
export const ATTACK_RANGE_BASE = 2;

/**
 * Procedural mechs are modeled facing +Z at rotation 0. Game logic uses
 * 0° = +X (east), 90° = +Z (south). Convert before writing rotation.y.
 */
export function gameFacingToModelYaw(gameDeg: number): number {
  return ((90 - gameDeg) % 360 + 360) % 360;
}
