// ============================================================================
// Co-op starting loadouts — serializable item specs rolled on the server.
// ============================================================================

import type { CoopItemSpec } from './types';

type Roller = () => CoopItemSpec;

const BONUS_ROLLERS: Roller[] = [
  () => ({ kind: 'weapon', bonus: 1, label: 'Sidearm' }),
  () => ({ kind: 'weapon', bonus: 2, label: 'Plasma Cannon' }),
  () => ({ kind: 'armor', bonus: 1, label: 'Light Plating' }),
  () => ({ kind: 'armor', bonus: 2, label: 'Heavy Plating' }),
  () => ({ kind: 'rangeModule', bonus: 1, label: 'Targeting +1' }),
  () => ({ kind: 'mine', damage: 2 }),
  () => ({ kind: 'tacticalNuke' }),
  () => ({ kind: 'demoCharge' }),
];

/** Each player mech starts with a repair kit plus two random bonus items. */
export function rollStartingLoadout(rand: () => number = Math.random): CoopItemSpec[] {
  const items: CoopItemSpec[] = [{ kind: 'repairKit', amount: 2 }];
  for (let i = 0; i < 2; i++) {
    const idx = Math.floor(rand() * BONUS_ROLLERS.length);
    items.push(BONUS_ROLLERS[idx]());
  }
  return items;
}
