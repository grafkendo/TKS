// ============================================================================
// PickupMesh — procedural low-poly 3D representation of a world pickup.
//
// Different `ItemKind`s get different silhouettes so they read at a glance
// from the iso camera:
//   - weapon       : box with a small barrel
//   - armor        : flat double-stacked plates
//   - rangeModule  : tall thin antenna
//   - repairKit    : cross / plus shape
//   - mine         : low disc with a pip on top
//
// Each mesh hovers above its hex and rotates slowly so the player can spot
// pickups from across the map. Caller drives the animation by calling
// `tick(group, time)` once per frame.
//
// Disposal of geometry & material is the caller's responsibility — use
// `disposePickupMesh(group)` when removing from the scene.
// ============================================================================

import * as THREE from 'three';
import type { Item, ItemKind } from './types';

export interface PickupMeshHandle {
  group: THREE.Group;
  /** Call once per frame with elapsed seconds for the floating bob + spin. */
  tick: (totalTime: number) => void;
  dispose: () => void;
}

export function createPickupMesh(item: Item): PickupMeshHandle {
  const group = new THREE.Group();

  const color = new THREE.Color(item.color);
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];

  function mat(opts: { emissive?: number } = {}): THREE.MeshStandardMaterial {
    const m = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: opts.emissive ?? 0.35,
      metalness: 0.45,
      roughness: 0.45,
    });
    materials.push(m);
    return m;
  }

  buildShape(item.kind, group, geometries, mat);

  // All pickups float above the tile and gently bob.
  group.position.y = 0.5;

  // Soft glow point light so pickups subtly tint the ground.
  const light = new THREE.PointLight(color, 0.6, 1.6);
  light.position.set(0, 0.1, 0);
  group.add(light);

  return {
    group,
    tick(t: number) {
      group.rotation.y = t * 1.1;
      // Bob ±0.07 around the configured y.
      group.position.y = 0.5 + Math.sin(t * 2.2) * 0.07;
    },
    dispose() {
      group.removeFromParent();
      for (const g of geometries) g.dispose();
      for (const m of materials) m.dispose();
      light.dispose();
    },
  };
}

// ----- Per-kind silhouettes -------------------------------------------------

function buildShape(
  kind: ItemKind,
  group: THREE.Group,
  geometries: THREE.BufferGeometry[],
  mat: () => THREE.MeshStandardMaterial,
): void {
  switch (kind) {
    case 'weapon': {
      const body = new THREE.BoxGeometry(0.32, 0.18, 0.18);
      const barrel = new THREE.CylinderGeometry(0.05, 0.05, 0.32, 12);
      geometries.push(body, barrel);
      const m1 = new THREE.Mesh(body, mat());
      const m2 = new THREE.Mesh(barrel, mat());
      m2.rotation.z = Math.PI / 2;
      m2.position.x = 0.22;
      group.add(m1, m2);
      return;
    }
    case 'armor': {
      const plate = new THREE.BoxGeometry(0.34, 0.06, 0.34);
      geometries.push(plate);
      const top = new THREE.Mesh(plate, mat());
      const bot = new THREE.Mesh(plate, mat());
      top.position.y = 0.06;
      bot.position.y = -0.06;
      group.add(top, bot);
      return;
    }
    case 'rangeModule': {
      const base = new THREE.BoxGeometry(0.22, 0.08, 0.22);
      const post = new THREE.CylinderGeometry(0.025, 0.025, 0.32, 8);
      const tip  = new THREE.SphereGeometry(0.06, 10, 10);
      geometries.push(base, post, tip);
      const b = new THREE.Mesh(base, mat());
      b.position.y = -0.10;
      const p = new THREE.Mesh(post, mat());
      p.position.y = 0.08;
      const t = new THREE.Mesh(tip, mat({ emissive: 0.9 }));
      t.position.y = 0.26;
      group.add(b, p, t);
      return;
    }
    case 'repairKit': {
      const arm = new THREE.BoxGeometry(0.34, 0.10, 0.10);
      geometries.push(arm);
      const horiz = new THREE.Mesh(arm, mat());
      const vert = new THREE.Mesh(arm, mat());
      vert.rotation.y = Math.PI / 2;
      group.add(horiz, vert);
      return;
    }
    case 'mine': {
      const disc = new THREE.CylinderGeometry(0.20, 0.20, 0.08, 14);
      const pip  = new THREE.SphereGeometry(0.05, 10, 10);
      geometries.push(disc, pip);
      const d = new THREE.Mesh(disc, mat());
      const p = new THREE.Mesh(pip, mat({ emissive: 1.2 }));
      p.position.y = 0.08;
      group.add(d, p);
      return;
    }
  }
}

// ----- Placed-mine mesh (lower, no floating) -------------------------------

/**
 * A "dropped" mine sitting on the ground — visually distinct from the airborne
 * pickup so the player can tell carried-vs-armed at a glance. Used when an
 * item's `placeMine` active is fired.
 */
export function createPlacedMineMesh(color: string): PickupMeshHandle {
  const group = new THREE.Group();
  const c = new THREE.Color(color);

  const disc = new THREE.CylinderGeometry(0.34, 0.34, 0.08, 16);
  const pip  = new THREE.SphereGeometry(0.06, 12, 12);
  const ring = new THREE.TorusGeometry(0.24, 0.025, 8, 24);

  const matDisc = new THREE.MeshStandardMaterial({
    color: c, emissive: c, emissiveIntensity: 0.3,
    metalness: 0.5, roughness: 0.4,
  });
  const matPip = new THREE.MeshStandardMaterial({
    color: c, emissive: c, emissiveIntensity: 1.6,
    metalness: 0.6, roughness: 0.3,
  });

  const d = new THREE.Mesh(disc, matDisc);
  const p = new THREE.Mesh(pip, matPip);
  const r = new THREE.Mesh(ring, matDisc);
  p.position.y = 0.08;
  r.position.y = 0.05;
  r.rotation.x = Math.PI / 2;
  group.add(d, p, r);

  return {
    group,
    tick(t: number) {
      // Slow pulse on the central pip (subtle "armed" cue).
      const pulse = 1.0 + Math.sin(t * 4) * 0.5;
      matPip.emissiveIntensity = 1.0 + pulse * 0.5;
    },
    dispose() {
      group.removeFromParent();
      disc.dispose();
      pip.dispose();
      ring.dispose();
      matDisc.dispose();
      matPip.dispose();
    },
  };
}
