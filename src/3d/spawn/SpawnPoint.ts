// ============================================================================
// SpawnPoint — a fixed hex that periodically produces a new enemy mech.
//
// This file contains:
//   - createSpawnMesh()       : procedural low-poly visual for the marker
//                              (glowing disc + rising teleporter ring)
//   - createSpawnFlashMesh()  : a one-shot "warp-in" effect when an
//                              enemy materializes (handled by caller)
//
// Spawn cadence / RNG / placement logic lives in main.ts — this file
// is just visuals + a tiny data container.
// ============================================================================

import * as THREE from 'three';

export interface SpawnMeshHandle {
  group: THREE.Group;
  tick: (totalTime: number) => void;
  /**
   * Toggle "suppressed" visual: rings retract and the pad tints green to
   * read as locked-down. Used when a player mech is squatting on the
   * spawn point and no enemy can drop.
   */
  setSuppressed: (suppressed: boolean) => void;
  dispose: () => void;
}

/** Persistent ground marker for the spawn point. */
export function createSpawnMesh(color: string): SpawnMeshHandle {
  const group = new THREE.Group();
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];

  const colorVec = new THREE.Color(color);

  // Flat hex-ish disc on the ground.
  const padGeom = new THREE.CylinderGeometry(0.78, 0.78, 0.06, 24);
  geometries.push(padGeom);
  const padMat = new THREE.MeshStandardMaterial({
    color: colorVec,
    emissive: colorVec,
    emissiveIntensity: 0.4,
    metalness: 0.5,
    roughness: 0.4,
  });
  materials.push(padMat);
  const pad = new THREE.Mesh(padGeom, padMat);
  pad.position.y = 0.04;
  group.add(pad);

  // Inner darker ring (visual contrast).
  const innerGeom = new THREE.CylinderGeometry(0.5, 0.5, 0.08, 24);
  geometries.push(innerGeom);
  const innerMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#0e1217'),
    metalness: 0.3,
    roughness: 0.7,
  });
  materials.push(innerMat);
  const inner = new THREE.Mesh(innerGeom, innerMat);
  inner.position.y = 0.05;
  group.add(inner);

  // Three rising rings (animate in tick).
  const ringMeshes: Array<{ mesh: THREE.Mesh; phase: number }> = [];
  for (let i = 0; i < 3; i++) {
    const torusGeom = new THREE.TorusGeometry(0.55, 0.04, 8, 24);
    geometries.push(torusGeom);
    const torusMat = new THREE.MeshStandardMaterial({
      color: colorVec,
      emissive: colorVec,
      emissiveIntensity: 1.2,
      transparent: true,
      opacity: 0.85,
    });
    materials.push(torusMat);
    const torus = new THREE.Mesh(torusGeom, torusMat);
    torus.rotation.x = Math.PI / 2;
    group.add(torus);
    ringMeshes.push({ mesh: torus, phase: i / 3 });
  }

  // Soft glow light.
  const light = new THREE.PointLight(colorVec, 0.6, 2.2);
  light.position.set(0, 0.4, 0);
  group.add(light);

  // Mutable "locked by a player squatter" flag. While true:
  //   - the rising rings hide
  //   - the pad/light tint shifts to a friendly green so the player
  //     can SEE their hold is working
  let suppressed = false;
  const suppressedColor = new THREE.Color('#3bd4a4');
  const activeColor = colorVec.clone();

  return {
    group,
    tick(t: number) {
      if (suppressed) {
        // Slower, gentler pulse + hidden rings while a player squats.
        for (const r of ringMeshes) {
          r.mesh.visible = false;
        }
        padMat.emissiveIntensity = 0.5 + (Math.sin(t * 1.1) + 1) * 0.15;
        return;
      }
      // Each ring drifts upward and fades, then resets — staggered phases.
      for (const r of ringMeshes) {
        r.mesh.visible = true;
        const local = ((t * 0.5) + r.phase) % 1;
        r.mesh.position.y = 0.05 + local * 0.9;
        const mat = r.mesh.material as THREE.MeshStandardMaterial;
        mat.opacity = Math.max(0, 0.9 - local);
      }
      // Pad pulses gently.
      padMat.emissiveIntensity = 0.3 + (Math.sin(t * 2.2) + 1) * 0.15;
    },
    setSuppressed(value: boolean) {
      if (value === suppressed) return;
      suppressed = value;
      const target = value ? suppressedColor : activeColor;
      padMat.color.copy(target);
      padMat.emissive.copy(target);
      light.color.copy(target);
    },
    dispose() {
      group.removeFromParent();
      for (const g of geometries) g.dispose();
      for (const m of materials) m.dispose();
      light.dispose();
    },
  };
}

/**
 * One-shot warp-in effect: a vertical column of light that fades out
 * over `durationSec`. Caller advances `tick(dt)` until `done` is true,
 * then disposes.
 */
export function createSpawnFlash(color: string, durationSec = 0.7): {
  group: THREE.Group;
  tick: (dt: number) => boolean; // returns done=true when finished
  dispose: () => void;
} {
  const group = new THREE.Group();
  const c = new THREE.Color(color);

  const beamGeom = new THREE.CylinderGeometry(0.45, 0.05, 1.8, 12, 1, true);
  const beamMat = new THREE.MeshBasicMaterial({
    color: c,
    transparent: true,
    opacity: 0.85,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const beam = new THREE.Mesh(beamGeom, beamMat);
  beam.position.y = 0.9;
  group.add(beam);

  let elapsed = 0;

  return {
    group,
    tick(dt: number): boolean {
      elapsed += dt;
      const t = Math.min(1, elapsed / durationSec);
      beamMat.opacity = 0.85 * (1 - t);
      beam.scale.set(1 + t * 0.6, 1, 1 + t * 0.6);
      return t >= 1;
    },
    dispose() {
      group.removeFromParent();
      beamGeom.dispose();
      beamMat.dispose();
    },
  };
}
