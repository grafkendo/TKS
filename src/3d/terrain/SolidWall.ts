// ============================================================================
// SolidWall — indestructible perimeter barrier (map boundary).
//
// Taller and darker than destructible sandbag walls. Blocks movement and
// cannot be shot / damaged.
// ============================================================================

import * as THREE from 'three';

import { BaseTerrain } from './BaseTerrain';
import type { HexCoord } from '../hex/HexCoord';

export interface SolidWallOpts {
  id: string;
  tile: HexCoord;
  height?: number;
}

export class SolidWall extends BaseTerrain {
  constructor(opts: SolidWallOpts) {
    super({
      id: opts.id,
      kind: 'solidWall',
      tile: opts.tile,
      blocksMovement: true,
      walkable: false,
      topY: 0,
      // No hp → indestructible via BaseTerrain.takeDamage guard.
    });
    this.build(opts.height ?? 1.35);
  }

  private build(height: number): void {
    const bodyMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x3a3f44,
        roughness: 0.9,
        metalness: 0.25,
        flatShading: true,
      }),
    );
    const trimMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x1a1e22,
        roughness: 0.85,
        metalness: 0.35,
        flatShading: true,
      }),
    );

    // Six tall segments — reads as reinforced blast wall.
    const segGeom = this.trackGeom(
      new THREE.BoxGeometry(0.95, height, 0.22),
    );

    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
      const seg = new THREE.Mesh(segGeom, bodyMat);
      seg.position.set(Math.cos(a) * 0.56, height / 2, Math.sin(a) * 0.56);
      seg.rotation.y = -a + Math.PI / 2;
      seg.castShadow = true;
      seg.receiveShadow = true;
      this.object.add(seg);
    }

    const capGeom = this.trackGeom(
      new THREE.CylinderGeometry(0.66, 0.74, 0.1, 6, 1),
    );
    capGeom.rotateY(Math.PI / 6);
    const cap = new THREE.Mesh(capGeom, trimMat);
    cap.position.y = height + 0.05;
    this.object.add(cap);

    // Warning stripe accent on one face.
    const stripeGeom = this.trackGeom(
      new THREE.BoxGeometry(0.7, height * 0.12, 0.04),
    );
    const stripeMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xffce4d,
        emissive: 0xffce4d,
        emissiveIntensity: 0.35,
        flatShading: true,
      }),
    );
    const stripe = new THREE.Mesh(stripeGeom, stripeMat);
    stripe.position.set(0, height * 0.65, 0.62);
    this.object.add(stripe);
  }
}
