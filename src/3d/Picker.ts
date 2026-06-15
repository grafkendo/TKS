// ============================================================================
// Picker — pointer → world / tile / unit / terrain / crate translation.
//
// Owns a single raycaster and handles four pickable categories:
//   - units      (mechs registered by id)
//   - crates     (supply crates registered by id)
//   - terrain    (buildings, walls, platforms registered by id)
//   - board tiles (always last-resort fallback)
//
// Click priority is unit > crate > terrain > tile so a mech in front of a
// supply crate still selects the mech, a crate behind cover still wins
// over the cover, and the tile under any of them doesn't steal the click.
//
// Exposes events:
//   - onTileHover(tile | null)
//   - onTileClick(tile)
//   - onUnitClick(unitId)
//   - onCrateClick(crateId)
//   - onTerrainClick(terrainId)
// ============================================================================

import * as THREE from 'three';

import type { HexCoord } from './hex/HexCoord';

export interface PickerEvents {
  onTileHover?: (tile: HexCoord | null) => void;
  onTileClick?: (tile: HexCoord) => void;
  onUnitClick?: (unitId: string) => void;
  onCrateClick?: (crateId: string) => void;
  onTerrainClick?: (terrainId: string) => void;
}

export class Picker {
  private raycaster = new THREE.Raycaster();
  private pointerNdc = new THREE.Vector2();

  private boardPickables: THREE.Object3D[] = [];
  private unitObjects = new Map<string, THREE.Object3D>();
  private terrainObjects = new Map<string, THREE.Object3D>();
  private crateObjects = new Map<string, THREE.Object3D>();

  private lastHoverTile: string | null = null;

  constructor(
    private canvas: HTMLCanvasElement,
    private camera: THREE.Camera,
    private events: PickerEvents = {}
  ) {
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('click', this.onClick);
  }

  setBoardPickables(meshes: THREE.Object3D[]): void {
    this.boardPickables = meshes;
  }

  registerUnit(id: string, root: THREE.Object3D): void {
    root.userData.unitId = id;
    this.unitObjects.set(id, root);
  }

  unregisterUnit(id: string): void {
    this.unitObjects.delete(id);
  }

  registerTerrain(id: string, root: THREE.Object3D): void {
    root.userData.terrainId = id;
    this.terrainObjects.set(id, root);
  }

  unregisterTerrain(id: string): void {
    this.terrainObjects.delete(id);
  }

  registerCrate(id: string, root: THREE.Object3D): void {
    root.userData.crateId = id;
    this.crateObjects.set(id, root);
  }

  unregisterCrate(id: string): void {
    this.crateObjects.delete(id);
  }

  setEvents(events: PickerEvents): void {
    this.events = events;
  }

  dispose(): void {
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('click', this.onClick);
  }

  // ---------------------------------------------------------------------------

  private updateNdc(evt: PointerEvent | MouseEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    this.pointerNdc.x = ((evt.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointerNdc.y = -((evt.clientY - rect.top) / rect.height) * 2 + 1;
  }

  private onPointerMove = (evt: PointerEvent): void => {
    this.updateNdc(evt);
    this.raycaster.setFromCamera(this.pointerNdc, this.camera);

    const hit = this.raycaster.intersectObjects(this.boardPickables, false)[0];
    let tile: HexCoord | null = null;
    if (hit) {
      const q = hit.object.userData?.tileQ;
      const r = hit.object.userData?.tileR;
      if (typeof q === 'number' && typeof r === 'number') tile = { q, r };
    }

    const key = tile ? `${tile.q}_${tile.r}` : null;
    if (key !== this.lastHoverTile) {
      this.lastHoverTile = key;
      this.events.onTileHover?.(tile);
    }
  };

  private onClick = (evt: MouseEvent): void => {
    this.updateNdc(evt);
    this.raycaster.setFromCamera(this.pointerNdc, this.camera);

    // 1) Units (highest priority — a mech in front of a crate still wins).
    const unitRoots = Array.from(this.unitObjects.values());
    const unitHits = this.raycaster.intersectObjects(unitRoots, true);
    if (unitHits.length > 0) {
      const id = this.findAncestorId(unitHits[0].object, 'unitId');
      if (id) {
        this.events.onUnitClick?.(id);
        return;
      }
    }

    // 2) Crates (supply boxes — short objects that should still beat the
    //    terrain/tile under them).
    const crateRoots = Array.from(this.crateObjects.values());
    const crateHits = this.raycaster.intersectObjects(crateRoots, true);
    if (crateHits.length > 0) {
      const id = this.findAncestorId(crateHits[0].object, 'crateId');
      if (id) {
        this.events.onCrateClick?.(id);
        return;
      }
    }

    // 3) Terrain (buildings, walls, platforms — anything destructible / blocking).
    const terrainRoots = Array.from(this.terrainObjects.values());
    const terrainHits = this.raycaster.intersectObjects(terrainRoots, true);
    if (terrainHits.length > 0) {
      const id = this.findAncestorId(terrainHits[0].object, 'terrainId');
      if (id) {
        this.events.onTerrainClick?.(id);
        return;
      }
    }

    // 4) Board tiles (fallback).
    const tileHit = this.raycaster.intersectObjects(this.boardPickables, false)[0];
    if (tileHit) {
      const q = tileHit.object.userData?.tileQ;
      const r = tileHit.object.userData?.tileR;
      if (typeof q === 'number' && typeof r === 'number') {
        this.events.onTileClick?.({ q, r });
      }
    }
  };

  private findAncestorId(
    o: THREE.Object3D | null,
    key: 'unitId' | 'terrainId' | 'crateId',
  ): string | null {
    let cur: THREE.Object3D | null = o;
    while (cur) {
      const id = cur.userData?.[key];
      if (typeof id === 'string') return id;
      cur = cur.parent;
    }
    return null;
  }
}
