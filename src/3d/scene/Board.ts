// ============================================================================
// Board — the playable hex grid surface.
//
// Takes an arbitrary list of hex coordinates (typically from a HexMap of
// chunks). Each tile is rendered as a flat-top hex prism. Hover and
// selection states are owned here too — a thin hexagonal overlay above
// each tile toggles color & opacity.
//
// Backwards compatibility: pass a hex disk via `hexesInRadius(R)` if you
// just want the simple round map the old API gave you.
// ============================================================================

import * as THREE from 'three';

import {
  HexCoord,
  hexKey,
  hexToWorld,
} from '../hex/HexCoord';

export type TileVisualState = 'idle' | 'hover' | 'selected' | 'move' | 'fireArc' | 'attack';

// ---------- Tunables (flat-top hex tiles) -----------------------------------

/** Center-to-corner distance of a hex tile in world units. */
const HEX_SIZE = 1.15;
/** Visual gap between hex tiles. */
const HEX_GAP = 0.06;
/** Vertical thickness of a tile prism. */
const TILE_HEIGHT = 0.18;

export const TILE_TOP_Y = TILE_HEIGHT / 2; // exported for use by main.ts

export class Board {
  readonly root = new THREE.Group();
  /** Snapshot of the hex coords that make up this board. */
  readonly hexes: ReadonlyArray<HexCoord>;

  /** keyed by "q_r" */
  private tiles = new Map<string, TileMesh>();

  constructor(hexes: Iterable<HexCoord>) {
    this.hexes = [...hexes];
    this.buildGround();
    this.buildTiles();
  }

  /** Convert axial hex coords to world (x, 0, z). y=elevation. */
  tileToWorld(h: HexCoord): THREE.Vector3 {
    const { x, z } = hexToWorld(h, HEX_SIZE);
    return new THREE.Vector3(x, 0, z);
  }

  /** Returns hex coord {q,r} if the mesh is one of ours, otherwise null. */
  resolveTileFromIntersect(object: THREE.Object3D): HexCoord | null {
    const q = object.userData?.tileQ;
    const r = object.userData?.tileR;
    if (typeof q === 'number' && typeof r === 'number') return { q, r };
    return null;
  }

  /** All pickable meshes (for raycaster `.intersectObjects(...)`). */
  getPickables(): THREE.Object3D[] {
    const out: THREE.Object3D[] = [];
    for (const t of this.tiles.values()) out.push(t.surface);
    return out;
  }

  /** True if the given hex coord is a real tile on this board. */
  has(h: HexCoord): boolean {
    return this.tiles.has(hexKey(h));
  }

  setTileState(h: HexCoord, state: TileVisualState): void {
    const t = this.tiles.get(hexKey(h));
    if (!t) return;
    t.state = state;
    t.applyState();
  }

  clearAllStates(): void {
    for (const t of this.tiles.values()) {
      if (t.state !== 'idle') {
        t.state = 'idle';
        t.applyState();
      }
    }
  }

  // ---------------------------------------------------------------------------

  private buildGround(): void {
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(100, 100),
      new THREE.MeshStandardMaterial({ color: 0x0c1116, roughness: 0.95 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -TILE_HEIGHT / 2 - 0.02;
    ground.receiveShadow = true;
    this.root.add(ground);
  }

  private buildTiles(): void {
    // CylinderGeometry with 6 sides + 30° rotation gives a flat-top hex.
    const hexRadius = HEX_SIZE - HEX_GAP;
    const baseGeom = new THREE.CylinderGeometry(hexRadius, hexRadius, TILE_HEIGHT, 6, 1);
    // Rotate around Y by 30° so the hex is "flat-top" rather than "pointy-top".
    baseGeom.rotateY(Math.PI / 6);

    const overlayGeom = new THREE.CylinderGeometry(hexRadius * 0.94, hexRadius * 0.94, 0.001, 6, 1);
    overlayGeom.rotateY(Math.PI / 6);

    const matLight = new THREE.MeshStandardMaterial({ color: 0x2d3c47, roughness: 0.85, metalness: 0.05 });
    const matDark  = new THREE.MeshStandardMaterial({ color: 0x1f2a30, roughness: 0.85, metalness: 0.05 });

    for (const h of this.hexes) {
      // 2-color alternation via (q + 2*r) parity gives a clean stripe
      // along the SE/NW axis — reads as a paved street grid.
      const isLight = ((((h.q + 2 * h.r) % 2) + 2) % 2) === 0;
      const mat = isLight ? matLight : matDark;

      const tile = new THREE.Mesh(baseGeom, mat);
      tile.castShadow = false;
      tile.receiveShadow = true;
      const p = this.tileToWorld(h);
      tile.position.copy(p);
      tile.userData.tileQ = h.q;
      tile.userData.tileR = h.r;

      const overlayMat = new THREE.MeshBasicMaterial({
        color: 0xffce4d,
        transparent: true,
        opacity: 0.0,
        depthWrite: false,
      });
      const overlay = new THREE.Mesh(overlayGeom, overlayMat);
      overlay.position.set(p.x, TILE_HEIGHT / 2 + 0.005, p.z);

      this.root.add(tile);
      this.root.add(overlay);

      this.tiles.set(hexKey(h), new TileMesh(tile, overlay));
    }
  }
}

// ---------------------------------------------------------------------------
// Internal: one tile's visual state.
// ---------------------------------------------------------------------------

class TileMesh {
  state: TileVisualState = 'idle';

  constructor(
    readonly surface: THREE.Mesh,
    readonly overlay: THREE.Mesh,
  ) {}

  applyState(): void {
    const mat = this.overlay.material as THREE.MeshBasicMaterial;
    switch (this.state) {
      case 'idle':     mat.opacity = 0;    mat.color.set(0xffce4d); break;
      case 'hover':    mat.opacity = 0.22; mat.color.set(0xffce4d); break;
      case 'selected': mat.opacity = 0.6;  mat.color.set(0xffce4d); break;
      case 'move':     mat.opacity = 0.16; mat.color.set(0x3bd4a4); break;
      case 'fireArc':  mat.opacity = 0.26; mat.color.set(0x8ef0c8); break;
      case 'attack':   mat.opacity = 0.42; mat.color.set(0xff5c6c); break;
    }
  }
}
