import { describe, it, expect } from 'vitest';
import {
  ARCHETYPES,
  ELITE,
  GRUNT,
  SCOUT,
  ARMORED,
  TANK,
  SPAWNABLE_ENEMY_KEYS,
  SPAWN_WEIGHTS,
  rollEnemyArchetype,
  applyArmor,
} from './archetypes';

describe('archetype statlines', () => {
  it('grunt: 1 AP, 1 hex move, 1 HP, no armor', () => {
    expect(GRUNT.apMax).toBe(1);
    expect(GRUNT.movementRange).toBe(1);
    expect(GRUNT.movementMode).toBe('burst');
    expect(GRUNT.hpMax).toBe(1);
    expect(GRUNT.armorThreshold).toBe(0);
  });

  it('scout: 1 AP, 2 hex move, 1 HP, no armor', () => {
    expect(SCOUT.apMax).toBe(1);
    expect(SCOUT.movementRange).toBe(2);
    expect(SCOUT.movementMode).toBe('burst');
    expect(SCOUT.hpMax).toBe(1);
  });

  it('armored: 1 AP, 1 hex move, 2 HP, deflects sub-2 damage', () => {
    expect(ARMORED.apMax).toBe(1);
    expect(ARMORED.movementRange).toBe(1);
    expect(ARMORED.hpMax).toBe(2);
    expect(ARMORED.armorThreshold).toBe(2);
  });

  it('tank: 1 AP, 1 hex move, 3 HP, range 2, deflects sub-2 damage', () => {
    expect(TANK.apMax).toBe(1);
    expect(TANK.movementRange).toBe(1);
    expect(TANK.hpMax).toBe(3);
    expect(TANK.attackRange).toBe(2);
    expect(TANK.armorThreshold).toBe(2);
    expect(TANK.chassis).toBe('atreides');
  });

  it('elite mirrors the original player statline', () => {
    expect(ELITE.apMax).toBe(3);
    expect(ELITE.hpMax).toBe(3);
    expect(ELITE.movementMode).toBe('per-hex');
  });

  it('lookup table contains all five archetypes', () => {
    expect(ARCHETYPES.elite).toBe(ELITE);
    expect(ARCHETYPES.grunt).toBe(GRUNT);
    expect(ARCHETYPES.scout).toBe(SCOUT);
    expect(ARCHETYPES.armored).toBe(ARMORED);
    expect(ARCHETYPES.tank).toBe(TANK);
  });
});

describe('rollEnemyArchetype', () => {
  it('only ever yields a spawnable enemy', () => {
    let i = 0;
    const rand = () => (i++ * 0.0123) % 1;
    for (let n = 0; n < 200; n++) {
      const arch = rollEnemyArchetype(rand);
      expect(SPAWNABLE_ENEMY_KEYS).toContain(arch.key);
      expect(arch.key).not.toBe('elite');
    }
  });

  it('eventually rolls each spawnable type with a deterministic stepper', () => {
    const seen = new Set<string>();
    let i = 0;
    const rand = () => (i++ * 0.171) % 1;
    for (let n = 0; n < 300; n++) seen.add(rollEnemyArchetype(rand).key);
    expect(seen.has('grunt')).toBe(true);
    expect(seen.has('scout')).toBe(true);
    expect(seen.has('armored')).toBe(true);
    expect(seen.has('tank')).toBe(true);
  });

  it('rand=0 returns the first weighted archetype', () => {
    expect(rollEnemyArchetype(() => 0).key).toBe(SPAWN_WEIGHTS[0].key);
  });

  it('roughly respects the weight ratios across 2000 deterministic rolls', () => {
    const counts: Record<string, number> = { grunt: 0, scout: 0, armored: 0, tank: 0 };
    let i = 0;
    const rand = () => (i++ * 0.0173) % 1;
    for (let n = 0; n < 2000; n++) {
      counts[rollEnemyArchetype(rand).key]++;
    }
    expect(counts.armored).toBeLessThan(counts.grunt);
    expect(counts.armored).toBeLessThan(counts.scout);
    expect(counts.tank).toBeLessThan(counts.grunt);
    expect(counts.grunt).toBeGreaterThan(counts.scout);
    const rareRatio = (counts.armored + counts.tank) / 2000;
    expect(rareRatio).toBeGreaterThan(0.06);
    expect(rareRatio).toBeLessThan(0.25);
  });
});

describe('applyArmor', () => {
  it('passes damage through when there is no armor', () => {
    expect(applyArmor(1, 0)).toBe(1);
    expect(applyArmor(3, 0)).toBe(3);
  });

  it('passes damage through when at or above the threshold', () => {
    expect(applyArmor(2, 2)).toBe(2);
    expect(applyArmor(5, 2)).toBe(5);
  });

  it('deflects damage below the threshold', () => {
    expect(applyArmor(1, 2)).toBe(0);
    expect(applyArmor(0.5, 2)).toBe(0);
  });

  it('zero / negative damage is always zero (never negative HP gain)', () => {
    expect(applyArmor(0, 2)).toBe(0);
    expect(applyArmor(-1, 0)).toBe(0);
  });
});
