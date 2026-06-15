// ============================================================================
// Inventory — fixed-size grid (HAND_SLOTS hand + BACKPACK_SLOTS backpack).
//
// Items have a slotKind that determines which row they can occupy:
//   - 'hand'      → weapons (currently capped at 2 simultaneous)
//   - 'backpack'  → armor, range modules, consumables (capped at 4)
//
// Hand and backpack capacities are INDEPENDENT — a full backpack does not
// prevent picking up a weapon.
//
// Pure data + helpers. No game-side effects (no Stat modifiers, no scene
// objects) happen here — the caller (main.ts) is responsible for applying
// passives when an item is added and removing them when it leaves.
// ============================================================================

import type { Item, SlotKind } from './types';

export const HAND_SLOTS = 2;
export const BACKPACK_SLOTS = 4;
export const TOTAL_SLOTS = HAND_SLOTS + BACKPACK_SLOTS;

export interface Inventory {
  /** Length = HAND_SLOTS. null = empty slot. */
  hands: (Item | null)[];
  /** Length = BACKPACK_SLOTS. null = empty slot. */
  backpack: (Item | null)[];
}

export interface SlotAddress {
  slotKind: SlotKind;
  index: number;
}

export function createEmptyInventory(): Inventory {
  return {
    hands: new Array(HAND_SLOTS).fill(null),
    backpack: new Array(BACKPACK_SLOTS).fill(null),
  };
}

function slotsOf(inv: Inventory, kind: SlotKind): (Item | null)[] {
  return kind === 'hand' ? inv.hands : inv.backpack;
}

/**
 * Add `item` to the first free slot of its `slotKind`. Returns the address
 * used, or null if every slot of that kind is full.
 */
export function addItem(inv: Inventory, item: Item): SlotAddress | null {
  const arr = slotsOf(inv, item.slotKind);
  const i = arr.findIndex((s) => s === null);
  if (i < 0) return null;
  arr[i] = item;
  return { slotKind: item.slotKind, index: i };
}

/** True if `item` can fit somewhere in its preferred slot kind. */
export function hasSpaceFor(inv: Inventory, item: Item): boolean {
  return slotsOf(inv, item.slotKind).some((s) => s === null);
}

export function getItem(inv: Inventory, addr: SlotAddress): Item | null {
  return slotsOf(inv, addr.slotKind)[addr.index] ?? null;
}

/** Removes and returns the item at `addr`. No-op (returns null) if empty. */
export function removeItem(inv: Inventory, addr: SlotAddress): Item | null {
  const arr = slotsOf(inv, addr.slotKind);
  const item = arr[addr.index] ?? null;
  if (item) arr[addr.index] = null;
  return item;
}

export function findItem(inv: Inventory, itemId: string): SlotAddress | null {
  for (let i = 0; i < inv.hands.length; i++) {
    if (inv.hands[i]?.id === itemId) return { slotKind: 'hand', index: i };
  }
  for (let i = 0; i < inv.backpack.length; i++) {
    if (inv.backpack[i]?.id === itemId) return { slotKind: 'backpack', index: i };
  }
  return null;
}

/** Flatten all occupied slots in (hands → backpack, low index → high) order. */
export function allItems(inv: Inventory): Array<{ item: Item; addr: SlotAddress }> {
  const out: Array<{ item: Item; addr: SlotAddress }> = [];
  inv.hands.forEach((it, i) => {
    if (it) out.push({ item: it, addr: { slotKind: 'hand', index: i } });
  });
  inv.backpack.forEach((it, i) => {
    if (it) out.push({ item: it, addr: { slotKind: 'backpack', index: i } });
  });
  return out;
}

export function isEmpty(inv: Inventory): boolean {
  return inv.hands.every((s) => s === null) && inv.backpack.every((s) => s === null);
}

export function emptySlotCount(inv: Inventory): number {
  return (
    inv.hands.filter((s) => s === null).length +
    inv.backpack.filter((s) => s === null).length
  );
}
