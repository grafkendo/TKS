// ============================================================================
// Terrain — static map pieces (buildings, walls, platforms, rubble).
//
// A terrain piece sits on a single hex and has these responsibilities:
//   - Provide a THREE.Object3D the renderer can position
//   - Tell the pathfinder whether this hex is blocked
//   - Tell the renderer whether units can stand on top, and if so at what Y
//     (this is how we get multi-level terrain — platforms/rooftops)
//   - Optionally carry an HP Stat so the piece can be destroyed
//
// The pattern mirrors the MechAsset abstraction: code that wires up the
// scene only sees the `TerrainPiece` interface, so swapping primitive
// boxes for glTF assets later is mechanical.
// ============================================================================

import type * as THREE from 'three';
import type { HexCoord } from '../hex/HexCoord';

export type TerrainKind = 'building' | 'platform' | 'wall' | 'solidWall' | 'rubble';

/** Visual style flag — only used for buildings right now. */
export type BuildingStyle = 'concrete' | 'glass' | 'brick';

/**
 * Declarative spec for a single piece of terrain inside a chunk template.
 * Discriminated union by `kind` so each variant only carries the fields
 * relevant to its renderer.
 */
export type ChunkTerrainSpec =
  | {
      kind: 'building';
      /** Local hex coord inside the chunk. */
      hex: HexCoord;
      /** Visible story count (1 story ≈ 1.4 world units tall). */
      stories: number;
      /** Maximum HP. Buildings are destructible. */
      hp: number;
      style?: BuildingStyle;
    }
  | {
      kind: 'platform';
      hex: HexCoord;
      /** Walkable height in world units (units stand on top of this). */
      elevation: number;
      /** Indestructible by default. */
      hp?: number;
    }
  | {
      kind: 'wall';
      hex: HexCoord;
      /** Default ≈ 0.6 if unset. */
      height?: number;
      hp: number;
    }
  | {
      kind: 'solidWall';
      hex: HexCoord;
      /** Default ≈ 1.35 if unset — indestructible perimeter. */
      height?: number;
    }
  | {
      kind: 'rubble';
      hex: HexCoord;
      /** Optional HP (rubble is normally inert). */
      hp?: number;
    };

/**
 * Runtime representation of a placed terrain piece.
 *
 * Concrete factories (Building, Platform, Wall, Rubble) build the Three.js
 * geometry and return one of these. Higher-level code only sees the
 * interface, never the concrete classes.
 */
export interface TerrainPiece {
  readonly id: string;
  readonly kind: TerrainKind;
  /** Logical hex the piece occupies. */
  tile: HexCoord;
  /** Three.js object — caller positions it via tileToWorld(). */
  readonly object: THREE.Object3D;

  // ----- Gameplay flags -----
  /** True if ground-level movement onto this hex is forbidden. */
  blocksMovement: boolean;
  /**
   * True if units can stand on top (platforms, rubble piles).
   * If true, `topY` defines the Y offset to use when placing a unit here.
   */
  walkable: boolean;
  /** Y offset (world units) where a unit's feet sit on this piece. */
  topY: number;
  /** Optional current HP. If undefined, the piece is indestructible. */
  hp?: number;
  /** Optional max HP (captured at creation so we can show "X/Y"). */
  maxHp?: number;
  /** True once destroyed. Renderer should swap the visual or remove. */
  destroyed: boolean;

  // ----- Behavior -----
  /** Take damage (if HP exists). Returns true if this hit destroyed it. */
  takeDamage(amount: number): boolean;
  /**
   * Optional staged-destruction probe. Buildings return 0-3
   * (intact → rough terrain). Other pieces return undefined.
   */
  getDestructionStage?(): 0 | 1 | 2 | 3;
  /** Optional per-frame update (smoke, glow, debris bobs, etc.). */
  tick?(dt: number): void;
  /** Release all GPU resources (geometry + material). */
  dispose(): void;
}
