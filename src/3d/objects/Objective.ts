// ============================================================================
// Objective box — neutral capture point on the board.
//
// Stand on the hex to claim it for your team. Visual shifts from neutral
// steel to the capturing team's accent color.
// ============================================================================

import * as THREE from 'three';
import type { PickupMeshHandle } from '../items/PickupMesh';

const NEUTRAL_BODY = '#6a7580';
const NEUTRAL_TRIM = '#3d454c';
const TEAM_COLORS: Record<1 | 2, string> = {
  1: '#ff5c6c',
  2: '#5c8aff',
};

export interface ObjectiveMeshHandle extends PickupMeshHandle {
  setOwner(team: 1 | 2 | null): void;
}

export function createObjectiveMesh(): ObjectiveMeshHandle {
  const group = new THREE.Group();
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];

  function pushMat(mat: THREE.Material): THREE.Material {
    materials.push(mat);
    return mat;
  }

  const bodyMat = pushMat(
    new THREE.MeshStandardMaterial({
      color: NEUTRAL_BODY,
      metalness: 0.55,
      roughness: 0.45,
    }),
  );
  const trimMat = pushMat(
    new THREE.MeshStandardMaterial({
      color: NEUTRAL_TRIM,
      metalness: 0.7,
      roughness: 0.35,
    }),
  );
  const beaconMat = pushMat(
    new THREE.MeshStandardMaterial({
      color: '#c8d4e0',
      emissive: new THREE.Color('#c8d4e0'),
      emissiveIntensity: 0.55,
      metalness: 0.3,
      roughness: 0.5,
    }),
  );

  const pedestalGeom = new THREE.CylinderGeometry(0.42, 0.48, 0.12, 6, 1);
  pedestalGeom.rotateY(Math.PI / 6);
  geometries.push(pedestalGeom);
  const pedestal = new THREE.Mesh(pedestalGeom, trimMat);
  pedestal.position.y = 0.06;
  group.add(pedestal);

  const crateGeom = new THREE.BoxGeometry(0.62, 0.5, 0.62);
  geometries.push(crateGeom);
  const crate = new THREE.Mesh(crateGeom, bodyMat);
  crate.position.y = 0.37;
  group.add(crate);

  const beaconGeom = new THREE.OctahedronGeometry(0.14, 0);
  geometries.push(beaconGeom);
  const beacon = new THREE.Mesh(beaconGeom, beaconMat);
  beacon.position.y = 0.72;
  group.add(beacon);

  let owner: 1 | 2 | null = null;

  function setOwner(team: 1 | 2 | null): void {
    owner = team;
    if (team === null) {
      bodyMat.color.set(NEUTRAL_BODY);
      beaconMat.color.set('#c8d4e0');
      beaconMat.emissive.set('#c8d4e0');
      beaconMat.emissiveIntensity = 0.55;
    } else {
      const c = TEAM_COLORS[team];
      bodyMat.color.set(c);
      beaconMat.color.set(c);
      beaconMat.emissive.set(c);
      beaconMat.emissiveIntensity = 1.0;
    }
  }

  return {
    group,
    tick(t: number) {
      beacon.rotation.y = t * 2.2;
      beacon.position.y = 0.72 + Math.sin(t * 3.0) * 0.04;
      const pulse = owner ? 0.85 + Math.sin(t * 4.5) * 0.15 : 0.55;
      beaconMat.emissiveIntensity = pulse;
    },
    dispose() {
      group.clear();
      for (const g of geometries) g.dispose();
      for (const mat of materials) mat.dispose();
    },
    setOwner,
  };
}
