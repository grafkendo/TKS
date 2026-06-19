// ============================================================================
// Building — multi-story urban structure with staged destruction.
//
// A stack of cuboid "stories" sized to fit on a single hex tile. Color
// palette depends on `style` so a city block looks varied.
//
// DESTRUCTION STAGES
// ------------------
// Buildings degrade through four states driven by HP %:
//
//   0 INTACT       (HP > 67% of max)
//   1 BOMBED OUT   (33% < HP <= 67%) — top stories collapsed, scorched
//   2 HEAVY RUBBLE (0  < HP <= 33%) — only the basement-sized stub
//                                     remains, body color = ash gray
//   3 ROUGH TERRAIN (HP = 0)         — flat debris pad. Walkable, but
//                                     stepping onto it costs 2 AP like
//                                     standalone rubble. `destroyed = true`.
//
// Stages 0-2 still BLOCK movement; only stage 3 is walkable. The piece
// stays in place as a `kind: 'building'` for the lifetime of the map —
// it never gets replaced by a Rubble piece because the building owns
// its own stage transitions.
// ============================================================================

import * as THREE from 'three';

import { BaseTerrain } from './BaseTerrain';
import { applyBuildingTexture } from './buildingTextures';
import type { BuildingStyle } from './types';
import type { HexCoord } from '../hex/HexCoord';

const STORY_HEIGHT = 1.4;

// Slight horizontal inset so the building doesn't visually clip the hex edges.
const FOOTPRINT_RADIUS = 0.78; // hex tile is ~1.0 hex-radius wide

export type DestructionStage = 0 | 1 | 2 | 3;

interface PaletteEntry {
  body: number;
  trim: number;
  window: number;
  windowEmissive: number;
}

const PALETTES: Record<BuildingStyle, PaletteEntry> = {
  concrete: {
    body: 0x9a9a9e,
    trim: 0x6e6e74,
    window: 0x4a4a52,
    windowEmissive: 0x888890,
  },
  glass: {
    body: 0xb4b4bc,
    trim: 0x7a7a82,
    window: 0x6a6a74,
    windowEmissive: 0x9a9aa4,
  },
  brick: {
    body: 0x8a8682,
    trim: 0x5c5854,
    window: 0x4a4a50,
    windowEmissive: 0x7a7a82,
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
  /** Story group meshes (bottom → top). Hidden as stages advance. */
  private storyGroups: THREE.Group[] = [];
  /** Roof + antenna group — hidden after stage 0. */
  private roofGroup: THREE.Group | null = null;
  /** Flat debris pad shown at stage 3 (rough terrain). */
  private debrisGroup: THREE.Group | null = null;
  /** Shared body material so stage transitions can recolor reliably. */
  private bodyMat: THREE.MeshStandardMaterial | null = null;
  private destructionStage: DestructionStage = 0;
  private originalStoryCount: number;

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
    this.originalStoryCount = opts.stories;
    this.build(opts.stories);
  }

  /** Current destruction stage (0 = intact, 3 = rough terrain). */
  getDestructionStage(): DestructionStage { return this.destructionStage; }

  /**
   * Override the default HP take-damage flow so we can self-transform
   * across the four stages instead of letting the caller swap us out
   * for a Rubble piece. Return value still indicates "fully destroyed
   * by this hit" so the existing status-line code keeps working.
   */
  override takeDamage(amount: number): boolean {
    if (this.hp === undefined || this.destroyed) return false;
    const before = this.destructionStage;
    this.hp = Math.max(0, this.hp - amount);
    const after = computeStage(this.hp, this.maxHp ?? 1);

    if (after !== before) this.applyStage(after);

    // Window dim still happens every hit so partial damage reads.
    this.dimWindows(this.hp);

    if (this.hp <= 0 && !this.destroyed) {
      this.destroyed = true;
      return true;
    }
    return false;
  }

  private dimWindows(remainingHp: number): void {
    if (!this.maxHp) return;
    const ratio = Math.max(0, remainingHp / this.maxHp);
    for (const m of this.windowMaterials) m.emissiveIntensity = ratio;
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
    this.bodyMat = bodyMat;
    applyBuildingTexture(bodyMat, this.style, stories);
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
      // Each story lives in its own group so we can hide top-down as
      // damage climbs.
      const storyGroup = new THREE.Group();
      storyGroup.name = `story_${s}`;
      this.storyGroups.push(storyGroup);

      const storyGeom = this.trackGeom(new THREE.BoxGeometry(w, STORY_HEIGHT, d));
      const story = new THREE.Mesh(storyGeom, bodyMat);
      story.position.y = STORY_HEIGHT * (s + 0.5);
      story.castShadow = true;
      story.receiveShadow = true;
      storyGroup.add(story);

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
        storyGroup.add(win);
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
        storyGroup.add(cap);
      }

      this.object.add(storyGroup);
    }

    // Roof + antenna live together so they disappear with stage 1.
    this.roofGroup = new THREE.Group();
    this.roofGroup.name = 'roof';
    const roofGeom = this.trackGeom(
      new THREE.BoxGeometry(w * 1.04, 0.18, d * 1.04),
    );
    const roof = new THREE.Mesh(roofGeom, trimMat);
    roof.position.y = STORY_HEIGHT * stories + 0.09;
    roof.castShadow = true;
    this.roofGroup.add(roof);

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
      this.roofGroup.add(antenna);
    }
    this.object.add(this.roofGroup);

    // Pre-build the flat debris pad (kept hidden until stage 3).
    this.debrisGroup = this.buildDebrisPad(w, d);
    this.debrisGroup.visible = false;
    this.object.add(this.debrisGroup);
  }

  /**
   * Apply the visual + gameplay flag changes for a new destruction stage.
   * Idempotent — calling with the current stage is a no-op.
   */
  private applyStage(stage: DestructionStage): void {
    this.destructionStage = stage;

    // Determine how many stories should remain visible.
    //  stage 0: all stories
    //  stage 1: keep the bottom ~half (rounded down, min 1)
    //  stage 2: keep only the ground floor
    //  stage 3: hide everything but the debris pad
    const stories = this.originalStoryCount;
    let storiesVisible = stories;
    if (stage === 1) storiesVisible = Math.max(1, Math.floor(stories / 2));
    else if (stage === 2) storiesVisible = 1;
    else if (stage === 3) storiesVisible = 0;

    for (let i = 0; i < this.storyGroups.length; i++) {
      this.storyGroups[i].visible = i < storiesVisible;
    }

    // Roof / antenna only stand at stage 0.
    if (this.roofGroup) this.roofGroup.visible = stage === 0;

    // Debris pad appears at stage 3.
    if (this.debrisGroup) this.debrisGroup.visible = stage === 3;

    // Tint stories darker / sootier as the building falls apart. The
    // material is shared across all stories so a single recolor reads
    // on every visible piece.
    if (this.bodyMat && stage >= 1) {
      const ashTone = stage === 1 ? 0x6b6058 : 0x4a4238;
      (this.bodyMat.color as THREE.Color).setHex(ashTone);
      this.bodyMat.emissive = new THREE.Color(stage === 1 ? 0x1a0c00 : 0x000000);
      this.bodyMat.emissiveIntensity = stage === 1 ? 0.18 : 0;
    }

    // Stage 3 = rough terrain: walkable at ground level, but slow.
    // Stages 0-2 still block.
    if (stage === 3) {
      this.blocksMovement = false;
      this.walkable = false; // not "elevated walkable" — units walk on the ground hex
      this.topY = 0;
    } else {
      this.blocksMovement = true;
      this.walkable = false;
      this.topY = 0;
    }
  }

  private buildDebrisPad(w: number, d: number): THREE.Group {
    const pad = new THREE.Group();
    pad.name = 'debris_pad';

    const padMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x3a342d,
        roughness: 1.0,
        flatShading: true,
      }),
    );
    const accentMat = this.trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x251f18,
        roughness: 1.0,
        flatShading: true,
      }),
    );

    // Flat slab — barely raised so it reads as walkable ground.
    const slabGeom = this.trackGeom(
      new THREE.BoxGeometry(w * 1.02, 0.08, d * 1.02),
    );
    const slab = new THREE.Mesh(slabGeom, padMat);
    slab.position.y = 0.04;
    slab.receiveShadow = true;
    pad.add(slab);

    // Scattered low chunks
    const chunkGeoms = [
      this.trackGeom(new THREE.IcosahedronGeometry(0.20, 0)),
      this.trackGeom(new THREE.IcosahedronGeometry(0.14, 0)),
      this.trackGeom(new THREE.BoxGeometry(0.26, 0.10, 0.18)),
    ];
    const chunkPositions: Array<[number, number, number, number]> = [
      [ 0.18, 0.10,  0.06, 0.3],
      [-0.22, 0.07,  0.18, 1.1],
      [ 0.10, 0.05, -0.24, 0.7],
      [-0.05, 0.06, -0.05, 1.6],
      [ 0.28, 0.04,  0.22, 0.2],
    ];
    for (let i = 0; i < chunkPositions.length; i++) {
      const [x, y, z, rot] = chunkPositions[i];
      const geom = chunkGeoms[i % chunkGeoms.length];
      const mesh = new THREE.Mesh(geom, i % 2 === 0 ? padMat : accentMat);
      mesh.position.set(x, y, z);
      mesh.rotation.y = rot;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      pad.add(mesh);
    }
    return pad;
  }
}

/**
 * Pure helper exported for tests — given current HP and max HP, return the
 * destruction stage the building should be in.
 */
export function computeStage(hp: number, maxHp: number): DestructionStage {
  if (hp <= 0 || maxHp <= 0) return 3;
  const ratio = hp / maxHp;
  if (ratio > 0.67) return 0;
  if (ratio > 0.34) return 1;
  return 2;
}
