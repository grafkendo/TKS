// ============================================================================
// Solid mech materials — strip glTF texture maps and use flat team colors.
// Keeps GPU memory and bandwidth low (important on Cloud Run / mobile).
// ============================================================================

import * as THREE from 'three';

export interface TeamPalette {
  primary: string;
  secondary: string;
  accent: string;
}

const MAP_KEYS = [
  'map',
  'normalMap',
  'roughnessMap',
  'metalnessMap',
  'aoMap',
  'emissiveMap',
  'alphaMap',
  'bumpMap',
  'displacementMap',
  'lightMap',
  'envMap',
  'specularMap',
  'clearcoatMap',
  'clearcoatNormalMap',
  'clearcoatRoughnessMap',
  'sheenColorMap',
  'sheenRoughnessMap',
  'specularColorMap',
  'specularIntensityMap',
  'transmissionMap',
  'thicknessMap',
  'iridescenceMap',
  'iridescenceThicknessMap',
  'anisotropyMap',
] as const;

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function pickRole(matName: string, meshName: string): keyof TeamPalette {
  const n = norm(`${matName}_${meshName}`);
  // glTF enemy meshes — Straznik uses one flat team color for the whole model.
  if (n.includes('straznik')) return 'primary';
  if (n.includes('atreides')) return 'primary';
  if (/cbp\d/.test(n)) return 'primary';
  // light_mech_* asset prefix — not emissive running lights.
  const isLightChassisMesh = n.includes('lightmech');
  if (
    !isLightChassisMesh &&
    ['visor', 'headlight', 'taillight', 'runninglight', 'eye', 'cockpit', 'accent', 'teamaccent', 'glow'].some(
      (h) => n.includes(h),
    )
  ) {
    return 'accent';
  }
  if (
    ['joint', 'secondary', 'teamsecondary', 'leg', 'foot', 'feet', 'hand', 'track', 'wheel', 'tread'].some(
      (h) => n.includes(h),
    )
  ) {
    return 'secondary';
  }
  return 'primary';
}

/** Dispose every texture-like property on a material. */
export function stripMaterialMaps(mat: THREE.Material): void {
  const record = mat as unknown as Record<string, unknown>;
  for (const key of MAP_KEYS) {
    const tex = record[key];
    if (tex instanceof THREE.Texture) {
      tex.dispose();
      record[key] = null;
    }
  }
  for (const key of Object.keys(record)) {
    const val = record[key];
    if (val instanceof THREE.Texture) {
      val.dispose();
      record[key] = null;
    }
  }
  if (mat instanceof THREE.MeshStandardMaterial) {
    mat.emissive.setHex(0x000000);
    mat.emissiveIntensity = 0;
  }
}

function stripGeometryColors(mesh: THREE.Mesh): void {
  const geom = mesh.geometry;
  if (!geom?.attributes.color) return;
  geom.deleteAttribute('color');
}

/** Remove all texture maps from a loaded glTF root (call once on cached template). */
export function stripGltfTextures(root: THREE.Object3D): void {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || !mesh.material) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const mat of materials) stripMaterialMaps(mat);
  });
}

function makeFlatMaterial(role: keyof TeamPalette, palette: TeamPalette): THREE.MeshStandardMaterial {
  const hex = palette[role];
  const mat = new THREE.MeshStandardMaterial({
    color: hex,
    roughness: 0.86,
    metalness: 0.08,
  });
  mat.vertexColors = false;
  if (role === 'accent') {
    mat.emissive.set(hex);
    mat.emissiveIntensity = 0.45;
  }
  mat.userData.role = role === 'primary' ? 'armor' : role;
  mat.userData.baseColor = hex;
  return mat;
}

/**
 * Replace every mesh material with flat team-tinted MeshStandardMaterial.
 * Call after cloning a template, once per mech instance.
 */
export function applySolidTeamMaterials(
  root: THREE.Object3D,
  palette: TeamPalette,
  forceRole?: keyof TeamPalette,
): void {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || !mesh.material) return;

    const source = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const next: THREE.MeshStandardMaterial[] = [];

    for (const src of source) {
      const role = forceRole ?? pickRole(src.name, mesh.name);
      stripMaterialMaps(src);
      src.dispose();
      stripGeometryColors(mesh);
      next.push(makeFlatMaterial(role, palette));
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }

    mesh.material = next.length === 1 ? next[0] : next;
  });
}
