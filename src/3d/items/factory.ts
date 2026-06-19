// ============================================================================
// Item factories — small constructors so callers don't have to write the
// full Item shape inline. Each `make*` returns a brand-new Item with a
// unique `id`, which is critical because the `id` is the source key used
// to identify the Stat modifier the item attaches when carried.
//
// To add a new item type:
//   1. Extend `ItemKind` in types.ts
//   2. Add a `makeXxx` function here
//   3. (optional) Add a 3D pickup color/icon in main.ts pickup mesh code
// ============================================================================

import type { Item } from './types';

let _seq = 0;
function uniqueItemId(prefix: string): string {
  _seq += 1;
  return `${prefix}-${_seq}`;
}

/** For tests only — resets the id sequence so suites are deterministic. */
export function _resetItemIdsForTest(): void {
  _seq = 0;
}

// ----- Hand-slot items -----------------------------------------------------

/** A hand-held weapon. Passive +damage while carried. */
export function makeWeapon(damageBonus: number, name?: string): Item {
  return {
    id: uniqueItemId('weapon'),
    kind: 'weapon',
    name: name ?? `Cannon +${damageBonus}`,
    description: `Hand-mounted weapon. +${damageBonus} damage while equipped.`,
    icon: 'W',
    color: '#ff8a3d',
    slotKind: 'hand',
    passive: { stat: 'damage', delta: damageBonus },
  };
}

// ----- Backpack passive items ----------------------------------------------

/** Armor plating. Passive +max HP while carried. */
export function makeArmor(hpBonus: number, name?: string): Item {
  return {
    id: uniqueItemId('armor'),
    kind: 'armor',
    name: name ?? `Plating +${hpBonus}`,
    description: `Armor plating. +${hpBonus} max HP while carried.`,
    icon: 'A',
    color: '#7aa8ff',
    slotKind: 'backpack',
    passive: { stat: 'maxHp', delta: hpBonus },
  };
}

/** Targeting / scope module. Passive +attack range while carried. */
export function makeRangeModule(rangeBonus: number, name?: string): Item {
  return {
    id: uniqueItemId('range'),
    kind: 'rangeModule',
    name: name ?? `Targeting +${rangeBonus}`,
    description: `Targeting computer. +${rangeBonus} attack range while carried.`,
    icon: 'R',
    color: '#ffce4d',
    slotKind: 'backpack',
    passive: { stat: 'attackRange', delta: rangeBonus },
  };
}

// ----- Backpack consumables ------------------------------------------------

/** Single-use field repair kit. Restores HP and consumes itself. */
export function makeRepairKit(healAmount: number, name?: string): Item {
  return {
    id: uniqueItemId('repair'),
    kind: 'repairKit',
    name: name ?? 'Repair Kit',
    description: `Restore ${healAmount} HP (1 AP). Consumed on use.`,
    icon: '+',
    color: '#3bd4a4',
    slotKind: 'backpack',
    active: { kind: 'heal', amount: healAmount, apCost: 1 },
  };
}

/** Proximity mine — placed on the carrier's hex, detonates on enemy entry. */
export function makeMine(damage: number, name?: string): Item {
  return {
    id: uniqueItemId('mine'),
    kind: 'mine',
    name: name ?? 'Proximity Mine',
    description: `Drop on your hex (1 AP). Triggers when an enemy enters — ${damage} damage.`,
    icon: 'M',
    color: '#ff5c6c',
    slotKind: 'backpack',
    active: { kind: 'placeMine', amount: damage, apCost: 1 },
  };
}

/**
 * Demo charge — breaches an enemy orbital drop point. Must be standing
 * ON or ADJACENT to the spawn point. One free copy is issued to each
 * player mech at the start of the game.
 */
export function makeDemoCharge(name?: string): Item {
  return {
    id: uniqueItemId('demo'),
    kind: 'demoCharge',
    name: name ?? 'Demo Charge',
    description:
      'Plant on / next to an orbital drop point (1 AP). Destroys the pad — one fewer reinforcement spawn per turn.',
    icon: 'D',
    color: '#ff9b4d',
    slotKind: 'backpack',
    active: { kind: 'destroySpawn', amount: 0, apCost: 1 },
  };
}

/**
 * Tactical nuke — 3-hex GIGA-damage blast. Pick a target tile within
 * range (default 3); the blast covers that tile plus two adjacent ones
 * and deals `damage` HP per hex, bypassing armor entirely. Friendly
 * fire applies. Buildings in the throw line absorb the warhead and the
 * nuke detonates there instead.
 */
export function makeTacticalNuke(damage = 3, name?: string): Item {
  return {
    id: uniqueItemId('nuke'),
    kind: 'tacticalNuke',
    name: name ?? 'Tactical Nuke',
    description:
      `Lob to a target tile (2 AP, range 3). 3-hex blast — ${damage} GIGA-damage per hex, bypasses armor. ` +
      `Friendly fire WILL apply. Buildings in the path detonate the warhead early.`,
    icon: 'N',
    color: '#ff5c6c',
    slotKind: 'backpack',
    active: { kind: 'tacticalNuke', amount: damage, apCost: 2 },
  };
}

/** Long-range guided missile — click an enemy to fire (consumable). */
export function makeMissileLauncher(damage = 2, name?: string): Item {
  return {
    id: uniqueItemId('missile'),
    kind: 'missileLauncher',
    name: name ?? 'Missile Pod',
    description:
      `Lock onto an enemy (2 AP, range 5). Deals ${damage} damage — ignores forward-arc limits.`,
    icon: '↑',
    color: '#ff6b35',
    slotKind: 'hand',
    active: { kind: 'fireMissile', amount: damage, apCost: 2 },
  };
}
