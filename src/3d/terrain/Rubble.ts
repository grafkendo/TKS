// ============================================================================
// Rubble — the wreckage left behind when a building / wall is destroyed.
//
// Doesn't block movement (so the demo can play through destruction), and
// isn't walkable in the elevated sense — units just walk over it on the
// ground hex.
// ============================================================================

import * as THREE from 'three';

import { BaseTerrain } from './BaseTerrain';
import type { HexCoord } from '../hex/HexCoord';

export interface RubbleOpts {
  id: string;
  tile: HexCoord;
  hp?: number;
}

export class Rubble extends BaseTerrain {
  constructor(opts: RubbleOpts) {
    super({
      id: opts.id,
      kind: 'rubble',
      tile: opts.tile,
      blocksMovement: false,
      walkable: false,
      topY: 0,
      hp: opts.hp,
    });
    this.build();
  }

  private build(): void {
    const mat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x4a3f37,
        roughness: 1.0,
        flatShading: true,
      }),
    );
    const trimMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x2a2520,
        roughness: 0.9,
        flatShading: true,
      }),
    );

    // A handful of low chunks scattered across the hex.
    const chunkGeoms = [
      this.trackGeom(new THREE.IcosahedronGeometry(0.28, 0)),
      this.trackGeom(new THREE.IcosahedronGeometry(0.22, 0)),
      this.trackGeom(new THREE.BoxGeometry(0.35, 0.16, 0.28)),
      this.trackGeom(new THREE.BoxGeometry(0.22, 0.12, 0.32)),
    ];

    const positions: Array<[number, number, number, number]> = [
      [ 0.15, 0.10,  0.10, 0],
      [-0.30, 0.08,  0.20, 0.7],
      [ 0.20, 0.06, -0.30, 1.2],
      [-0.10, 0.06, -0.15, 2.0],
      [ 0.35, 0.05,  0.30, 0.3],
    ];

    for (let i = 0; i < positions.length; i++) {
      const [x, y, z, rot] = positions[i];
      const geom = chunkGeoms[i % chunkGeoms.length];
      const m = new THREE.Mesh(geom, i % 2 === 0 ? mat : trimMat);
      m.position.set(x, y, z);
      m.rotation.y = rot;
      m.castShadow = true;
      m.receiveShadow = true;
      this.object.add(m);
    }
  }
}
