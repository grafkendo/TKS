// ============================================================================
// Platform — walkable elevated surface (rooftop / bridge / catwalk).
//
// Doesn't block movement (units walk onto its top), but does shift the unit
// upward by `elevation` world units. Supports the "multi-level terrain"
// requirement: a unit on a platform is visibly higher than a unit on the
// ground hex below.
// ============================================================================

import * as THREE from 'three';

import { BaseTerrain } from './BaseTerrain';
import type { HexCoord } from '../hex/HexCoord';

export interface PlatformOpts {
  id: string;
  tile: HexCoord;
  elevation: number;
  hp?: number;
}

export class Platform extends BaseTerrain {
  constructor(opts: PlatformOpts) {
    super({
      id: opts.id,
      kind: 'platform',
      tile: opts.tile,
      blocksMovement: false,
      walkable: true,
      topY: opts.elevation,
      hp: opts.hp,
    });
    this.build(opts.elevation);
  }

  private build(elevation: number): void {
    const deckGeom = this.trackGeom(
      new THREE.CylinderGeometry(0.86, 0.86, 0.1, 6, 1),
    );
    deckGeom.rotateY(Math.PI / 6); // flat-top hex

    const deckMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x5a6470,
        roughness: 0.6,
        metalness: 0.3,
        flatShading: true,
      }),
    );

    const deck = new THREE.Mesh(deckGeom, deckMat);
    deck.position.y = elevation;
    deck.castShadow = true;
    deck.receiveShadow = true;
    this.object.add(deck);

    // Glowing edge stripe so the deck "reads" as elevated even in shadow.
    const stripeMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xffce4d,
        emissive: new THREE.Color(0xffce4d),
        emissiveIntensity: 0.7,
      }),
    );
    const stripeGeom = this.trackGeom(
      new THREE.CylinderGeometry(0.87, 0.87, 0.025, 6, 1, true),
    );
    stripeGeom.rotateY(Math.PI / 6);
    const stripe = new THREE.Mesh(stripeGeom, stripeMat);
    stripe.position.y = elevation - 0.05;
    this.object.add(stripe);

    // Support legs (4 thin pillars from the ground up)
    const legMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x35404a,
        roughness: 0.8,
        flatShading: true,
      }),
    );
    const legGeom = this.trackGeom(
      new THREE.CylinderGeometry(0.06, 0.06, elevation, 6),
    );
    const r = 0.52;
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const leg = new THREE.Mesh(legGeom, legMat);
      leg.position.set(Math.cos(a) * r, elevation / 2, Math.sin(a) * r);
      leg.castShadow = true;
      this.object.add(leg);
    }
  }
}
