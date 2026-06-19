import { describe, expect, it } from 'vitest';

import * as THREE from 'three';

import { applySolidTeamMaterials, type TeamPalette } from '../mech/solidMaterials';

const RED_PALETTE: TeamPalette = {
  primary: '#cc4543',
  secondary: '#3a2424',
  accent: '#ffce4d',
};

describe('applySolidTeamMaterials', () => {
  it('uses team red for light_mech parts, not yellow accent', () => {
    const root = new THREE.Group();
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ name: 'TeamRed' }),
    );
    mesh.name = 'light_mech_foot_low_foot.001_0';
    root.add(mesh);

    applySolidTeamMaterials(root, RED_PALETTE, 'primary');

    const mat = mesh.material as THREE.MeshStandardMaterial;
    expect(mat.color.getHexString()).toBe('cc4543');
  });

  it('maps Straznik meshes to one flat team primary (legs, guns, body)', () => {
    const root = new THREE.Group();
    const leg = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ name: 'Straznik_leg', map: new THREE.Texture() }),
    );
    leg.name = 'pCube226_Straznik_leg_0';
    const gun = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ name: 'Straznik_MG', map: new THREE.Texture() }),
    );
    gun.name = 'Straznik_MG_0';
    root.add(leg, gun);

    const BLUE: TeamPalette = {
      primary: '#3b6ee9',
      secondary: '#1f2a47',
      accent: '#a8d5ff',
    };
    applySolidTeamMaterials(root, BLUE);

    for (const mesh of [leg, gun]) {
      const mat = mesh.material as THREE.MeshStandardMaterial;
      expect(mat.map).toBeNull();
      expect(mat.color.getHexString()).toBe('3b6ee9');
    }
  });
});
