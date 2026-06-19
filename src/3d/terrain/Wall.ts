// ============================================================================
// Wall — low cover / barrier on a hex. Blocks movement, destructible.
// ============================================================================

import * as THREE from 'three';

import { BaseTerrain } from './BaseTerrain';
import type { HexCoord } from '../hex/HexCoord';

export interface WallOpts {
  id: string;
  tile: HexCoord;
  height?: number;
  hp: number;
}

export class Wall extends BaseTerrain {
  constructor(opts: WallOpts) {
    super({
      id: opts.id,
      kind: 'wall',
      tile: opts.tile,
      blocksMovement: true,
      walkable: false,
      topY: 0,
      hp: opts.hp,
    });
    this.build(opts.height ?? 0.6);
  }

  private build(height: number): void {
    const bodyMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x7a7672,
        roughness: 0.95,
        flatShading: true,
      }),
    );
    const trimMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x4e4a46,
        roughness: 0.8,
        flatShading: true,
      }),
    );

    // Six low segments forming a hexagonal ring → reads as sandbag emplacement.
    const segGeom = this.trackGeom(
      new THREE.BoxGeometry(0.9, height, 0.18),
    );

    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
      const seg = new THREE.Mesh(segGeom, bodyMat);
      seg.position.set(Math.cos(a) * 0.55, height / 2, Math.sin(a) * 0.55);
      seg.rotation.y = -a + Math.PI / 2;
      seg.castShadow = true;
      seg.receiveShadow = true;
      this.object.add(seg);
    }

    // Cap on top
    const capGeom = this.trackGeom(
      new THREE.CylinderGeometry(0.62, 0.7, 0.06, 6, 1),
    );
    capGeom.rotateY(Math.PI / 6);
    const cap = new THREE.Mesh(capGeom, trimMat);
    cap.position.y = height + 0.03;
    this.object.add(cap);
  }
}
