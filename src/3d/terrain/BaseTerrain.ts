// ============================================================================
// BaseTerrain — common scaffolding shared by all TerrainPiece implementations.
//
// Tracks geometries / materials for disposal, implements the standard HP
// take-damage flow, and exposes a few convenience hooks for subclasses.
// ============================================================================

import * as THREE from 'three';

import type { HexCoord } from '../hex/HexCoord';
import type { TerrainKind, TerrainPiece } from './types';

export interface BaseTerrainOpts {
  id: string;
  kind: TerrainKind;
  tile: HexCoord;
  blocksMovement: boolean;
  walkable: boolean;
  topY: number;
  hp?: number;
}

export abstract class BaseTerrain implements TerrainPiece {
  readonly id: string;
  readonly kind: TerrainKind;
  tile: HexCoord;
  readonly object: THREE.Group;

  blocksMovement: boolean;
  walkable: boolean;
  topY: number;
  hp?: number;
  maxHp?: number;
  destroyed = false;

  protected geometries: THREE.BufferGeometry[] = [];
  protected materials: THREE.Material[] = [];

  constructor(opts: BaseTerrainOpts) {
    this.id = opts.id;
    this.kind = opts.kind;
    this.tile = opts.tile;
    this.blocksMovement = opts.blocksMovement;
    this.walkable = opts.walkable;
    this.topY = opts.topY;
    if (opts.hp !== undefined) {
      this.hp = opts.hp;
      this.maxHp = opts.hp;
    }
    this.object = new THREE.Group();
    this.object.name = `terrain_${opts.kind}_${opts.id}`;
  }

  takeDamage(amount: number): boolean {
    if (this.hp === undefined || this.destroyed) return false;
    this.hp = Math.max(0, this.hp - amount);
    if (this.hp <= 0) {
      this.destroyed = true;
      return true;
    }
    this.onDamaged(this.hp);
    return false;
  }

  /** Subclasses override to add visual cues (cracks, scorch marks). */
  protected onDamaged(_remainingHp: number): void {}

  dispose(): void {
    for (const g of this.geometries) g.dispose();
    for (const m of this.materials) m.dispose();
    this.object.parent?.remove(this.object);
  }

  // ----- Helpers for subclasses -----

  protected trackGeom<T extends THREE.BufferGeometry>(g: T): T {
    this.geometries.push(g);
    return g;
  }

  protected trackMat<T extends THREE.Material>(m: T): T {
    this.materials.push(m);
    return m;
  }
}
