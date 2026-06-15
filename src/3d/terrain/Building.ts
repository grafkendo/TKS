// ============================================================================
// Building — multi-story urban structure.
//
// A stack of cuboid "stories" sized to fit on a single hex tile. Color
// palette depends on `style` so a city block looks varied. Destructible.
// ============================================================================

import * as THREE from 'three';

import { BaseTerrain } from './BaseTerrain';
import type { BuildingStyle } from './types';
import type { HexCoord } from '../hex/HexCoord';

const STORY_HEIGHT = 1.4;

// Slight horizontal inset so the building doesn't visually clip the hex edges.
const FOOTPRINT_RADIUS = 0.78; // hex tile is ~1.0 hex-radius wide

interface PaletteEntry {
  body: number;
  trim: number;
  window: number;
  windowEmissive: number;
}

const PALETTES: Record<BuildingStyle, PaletteEntry> = {
  concrete: {
    body: 0x8d949c,
    trim: 0x55595e,
    window: 0x2a3742,
    windowEmissive: 0xffce4d,
  },
  glass: {
    body: 0x4a6f88,
    trim: 0x223544,
    window: 0x6fb6c8,
    windowEmissive: 0xa8d5ff,
  },
  brick: {
    body: 0x8b4a3a,
    trim: 0x4a2820,
    window: 0x2a3742,
    windowEmissive: 0xfff2a8,
  },
};

export interface BuildingOpts {
  id: string;
  tile: HexCoord;
  stories: number;
  hp: number;
  style?: BuildingStyle;
}

export class Building extends BaseTerrain {
  private style: BuildingStyle;
  private windowMaterials: THREE.MeshStandardMaterial[] = [];

  constructor(opts: BuildingOpts) {
    super({
      id: opts.id,
      kind: 'building',
      tile: opts.tile,
      blocksMovement: true,
      walkable: false,
      topY: 0,
      hp: opts.hp,
    });
    this.style = opts.style ?? 'concrete';
    this.build(opts.stories);
  }

  protected override onDamaged(remainingHp: number): void {
    if (!this.maxHp) return;
    // As damage climbs, windows go dark.
    const ratio = Math.max(0, remainingHp / this.maxHp);
    for (const m of this.windowMaterials) {
      m.emissiveIntensity = ratio;
    }
  }

  private build(stories: number): void {
    const palette = PALETTES[this.style];

    const bodyMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: palette.body,
        roughness: 0.85,
        metalness: 0.1,
        flatShading: true,
      }),
    );
    const trimMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: palette.trim,
        roughness: 0.7,
        metalness: 0.15,
        flatShading: true,
      }),
    );

    const w = FOOTPRINT_RADIUS * 1.6;
    const d = FOOTPRINT_RADIUS * 1.6;

    for (let s = 0; s < stories; s++) {
      const storyGeom = this.trackGeom(new THREE.BoxGeometry(w, STORY_HEIGHT, d));
      const story = new THREE.Mesh(storyGeom, bodyMat);
      story.position.y = STORY_HEIGHT * (s + 0.5);
      story.castShadow = true;
      story.receiveShadow = true;
      this.object.add(story);

      // Window strip on each visible face
      const windowMat = this.trackMat(
        new THREE.MeshStandardMaterial({
          color: palette.window,
          emissive: new THREE.Color(palette.windowEmissive),
          emissiveIntensity: 0.9,
          roughness: 0.4,
          metalness: 0.2,
          flatShading: true,
        }),
      );
      this.windowMaterials.push(windowMat);

      const windowGeom = this.trackGeom(
        new THREE.BoxGeometry(w * 0.74, STORY_HEIGHT * 0.45, 0.02),
      );

      for (const face of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
        const win = new THREE.Mesh(windowGeom, windowMat);
        win.position.y = STORY_HEIGHT * (s + 0.5);
        win.rotation.y = face;
        const r = d / 2 + 0.001;
        win.position.x = Math.sin(face) * r;
        win.position.z = Math.cos(face) * r;
        this.object.add(win);
      }

      // Thin trim cap between stories
      if (s < stories - 1) {
        const capGeom = this.trackGeom(
          new THREE.BoxGeometry(w * 1.05, 0.06, d * 1.05),
        );
        const cap = new THREE.Mesh(capGeom, trimMat);
        cap.position.y = STORY_HEIGHT * (s + 1);
        cap.castShadow = true;
        cap.receiveShadow = true;
        this.object.add(cap);
      }
    }

    // Roof piece — slightly larger than the top story, with a small antenna for charm.
    const roofGeom = this.trackGeom(
      new THREE.BoxGeometry(w * 1.04, 0.18, d * 1.04),
    );
    const roof = new THREE.Mesh(roofGeom, trimMat);
    roof.position.y = STORY_HEIGHT * stories + 0.09;
    roof.castShadow = true;
    this.object.add(roof);

    if (stories >= 2) {
      const antennaGeom = this.trackGeom(
        new THREE.CylinderGeometry(0.025, 0.025, 0.5, 4),
      );
      const antenna = new THREE.Mesh(antennaGeom, trimMat);
      antenna.position.set(
        FOOTPRINT_RADIUS * 0.3,
        STORY_HEIGHT * stories + 0.18 + 0.25,
        FOOTPRINT_RADIUS * 0.3,
      );
      this.object.add(antenna);
    }
  }
}
