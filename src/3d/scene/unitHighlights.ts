// ============================================================================
// Unit highlights — small overhead point lights for selected / moving mechs.
// Reads like a desk lamp picking out miniatures on a grey tabletop.
// ============================================================================

import * as THREE from 'three';

export type UnitHighlightKind = 'selected' | 'moving';

const LIGHT_NAME: Record<UnitHighlightKind, string> = {
  selected: 'tackticus_highlight_selected',
  moving: 'tackticus_highlight_moving',
};

const LIGHT_CFG: Record<UnitHighlightKind, { color: number; intensity: number; height: number }> = {
  selected: { color: 0xfff8e8, intensity: 2.8, height: 4.5 },
  moving: { color: 0xffecd0, intensity: 2.2, height: 4.2 },
};

export function setUnitHighlight(
  mechRoot: THREE.Object3D,
  kind: UnitHighlightKind,
  on: boolean,
): void {
  const name = LIGHT_NAME[kind];
  const existing = mechRoot.getObjectByName(name);
  if (on) {
    if (existing) return;
    const cfg = LIGHT_CFG[kind];
    const light = new THREE.PointLight(cfg.color, cfg.intensity, 14, 1.6);
    light.name = name;
    light.position.set(0, cfg.height, 0);
    light.castShadow = false;
    mechRoot.add(light);
    return;
  }
  if (existing) mechRoot.remove(existing);
}

export function clearAllUnitHighlights(mechRoot: THREE.Object3D): void {
  for (const name of Object.values(LIGHT_NAME)) {
    const obj = mechRoot.getObjectByName(name);
    if (obj) mechRoot.remove(obj);
  }
}
