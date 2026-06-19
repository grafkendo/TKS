import { describe, it, expect } from 'vitest';
import {
  ARCHETYPES,
  ELITE,
  GRUNT,
  SCOUT,
  ARMORED,
  TANK,
  STRIKER,
  BRUTE,
  SPAWNABLE_ENEMY_KEYS,
  SPAWN_WEIGHTS,
  rollEnemyArchetype,
  applyArmor,
} from './archetypes';

describe('archetype statlines', () => {
  it('grunt: 1 AP, 1 hex move, 1 HP, CBP chassis', () => {
    expect(GRUNT.displayName).toBe('Grunt');
    expect(GRUNT.chassis).toBe('cbp0');
    expect(GRUNT.apMax).toBe(1);
    expect(GRUNT.movementRange).toBe(1);
    expect(GRUNT.movementMode).toBe('burst');
    expect(GRUNT.hpMax).toBe(1);
    expect(GRUNT.armorThreshold).toBe(0);
  });

  it('scout: fast dash with cbp1 chassis', () => {
    expect(SCOUT.displayName).toBe('Scout');
    expect(SCOUT.chassis).toBe('cbp1');
    expect(SCOUT.movementRange).toBe(2);
    expect(SPAWNABLE_ENEMY_KEYS).toContain('scout');
  });

  it('armored: frontline bulwark with cbp2 chassis', () => {
    expect(ARMORED.displayName).toBe('Armored');
    expect(ARMORED.chassis).toBe('cbp2');
    expect(ARMORED.hpMax).toBe(2);
    expect(ARMORED.armorThreshold).toBe(2);
    expect(SPAWNABLE_ENEMY_KEYS).toContain('armored');
  });

  it('tank: 1 AP, 1 hex move, 3 HP, cbp3 chassis', () => {
    expect(TANK.displayName).toBe('Tank');
    expect(TANK.chassis).toBe('cbp3');
    expect(TANK.apMax).toBe(1);
    expect(TANK.movementRange).toBe(1);
    expect(TANK.hpMax).toBe(3);
    expect(TANK.attackRange).toBe(2);
    expect(TANK.armorThreshold).toBe(2);
  });

  it('striker and brute use cbp4/cbp5 chassis', () => {
    expect(STRIKER.chassis).toBe('cbp4');
    expect(BRUTE.chassis).toBe('cbp5');
    expect(SPAWNABLE_ENEMY_KEYS).toContain('striker');
    expect(SPAWNABLE_ENEMY_KEYS).toContain('brute');
  });

  it('elite mirrors the original player statline', () => {
    expect(ELITE.apMax).toBe(3);
    expect(ELITE.hpMax).toBe(3);
    expect(ELITE.movementMode).toBe('per-hex');
    expect(ELITE.chassis).toBe('straznik');
  });

  it('lookup table contains all archetypes', () => {
    expect(ARCHETYPES.elite).toBe(ELITE);
    expect(ARCHETYPES.grunt).toBe(GRUNT);
    expect(ARCHETYPES.scout).toBe(SCOUT);
    expect(ARCHETYPES.armored).toBe(ARMORED);
    expect(ARCHETYPES.tank).toBe(TANK);
    expect(ARCHETYPES.striker).toBe(STRIKER);
    expect(ARCHETYPES.brute).toBe(BRUTE);
  });
});

describe('rollEnemyArchetype', () => {
  it('only ever yields spawnable archetypes', () => {
    let i = 0;
    const rand = () => (i++ * 0.0123) % 1;
    for (let n = 0; n < 200; n++) {
      const arch = rollEnemyArchetype(rand);
      expect(SPAWNABLE_ENEMY_KEYS).toContain(arch.key);
      expect(arch.key).not.toBe('elite');
    }
  });

  it('eventually rolls all spawnable types with a deterministic stepper', () => {
    const seen = new Set<string>();
    let i = 0;
    const rand = () => (i++ * 0.171) % 1;
    for (let n = 0; n < 600; n++) seen.add(rollEnemyArchetype(rand).key);
    for (const key of SPAWNABLE_ENEMY_KEYS) {
      expect(seen.has(key)).toBe(true);
    }
  });

  it('rand=0 returns the first weighted archetype', () => {
    expect(rollEnemyArchetype(() => 0).key).toBe(SPAWN_WEIGHTS[0].key);
  });

  it('roughly respects spawn weight ratios across 3000 deterministic rolls', () => {
    const counts: Record<string, number> = {};
    for (const key of SPAWNABLE_ENEMY_KEYS) counts[key] = 0;
    let i = 0;
    const rand = () => (i++ * 0.0173) % 1;
    for (let n = 0; n < 3000; n++) {
      counts[rollEnemyArchetype(rand).key]++;
    }
    expect(counts.grunt).toBeGreaterThan(counts.brute);
    expect(counts.tank).toBeGreaterThan(counts.brute);
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
