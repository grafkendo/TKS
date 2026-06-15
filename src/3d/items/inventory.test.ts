import { describe, it, expect, beforeEach } from 'vitest';
import {
  createEmptyInventory,
  addItem,
  hasSpaceFor,
  removeItem,
  getItem,
  findItem,
  allItems,
  isEmpty,
  emptySlotCount,
  HAND_SLOTS,
  BACKPACK_SLOTS,
  TOTAL_SLOTS,
} from './inventory';
import {
  makeWeapon,
  makeArmor,
  makeRangeModule,
  makeRepairKit,
  makeMine,
  _resetItemIdsForTest,
} from './factory';

beforeEach(() => {
  _resetItemIdsForTest();
});

describe('Inventory', () => {
  it('creates with empty slots of the configured sizes', () => {
    const inv = createEmptyInventory();
    expect(inv.hands).toHaveLength(HAND_SLOTS);
    expect(inv.backpack).toHaveLength(BACKPACK_SLOTS);
    expect(TOTAL_SLOTS).toBe(HAND_SLOTS + BACKPACK_SLOTS);
    expect(isEmpty(inv)).toBe(true);
    expect(emptySlotCount(inv)).toBe(TOTAL_SLOTS);
  });

  it('places hand items in hand slots only', () => {
    const inv = createEmptyInventory();
    const w = makeWeapon(2);
    const addr = addItem(inv, w);
    expect(addr).toEqual({ slotKind: 'hand', index: 0 });
    expect(inv.hands[0]).toBe(w);
    expect(inv.backpack.every((s) => s === null)).toBe(true);
  });

  it('places backpack items in backpack slots only', () => {
    const inv = createEmptyInventory();
    const armor = makeArmor(2);
    const addr = addItem(inv, armor);
    expect(addr).toEqual({ slotKind: 'backpack', index: 0 });
    expect(inv.backpack[0]).toBe(armor);
    expect(inv.hands.every((s) => s === null)).toBe(true);
  });

  it('fills slots in ascending index order', () => {
    const inv = createEmptyInventory();
    const w1 = makeWeapon(1);
    const w2 = makeWeapon(2);
    addItem(inv, w1);
    addItem(inv, w2);
    expect(inv.hands[0]).toBe(w1);
    expect(inv.hands[1]).toBe(w2);
  });

  it('returns null when out of space in the target slot kind', () => {
    const inv = createEmptyInventory();
    addItem(inv, makeWeapon(1));
    addItem(inv, makeWeapon(2));
    expect(hasSpaceFor(inv, makeWeapon(3))).toBe(false);
    expect(addItem(inv, makeWeapon(3))).toBeNull();
  });

  it('hand and backpack capacities are independent', () => {
    const inv = createEmptyInventory();
    addItem(inv, makeWeapon(1));
    addItem(inv, makeWeapon(2));
    expect(hasSpaceFor(inv, makeArmor(1))).toBe(true);
    expect(addItem(inv, makeArmor(1))).toEqual({ slotKind: 'backpack', index: 0 });
  });

  it('fills the backpack completely then refuses more backpack items', () => {
    const inv = createEmptyInventory();
    addItem(inv, makeArmor(1));
    addItem(inv, makeRangeModule(1));
    addItem(inv, makeRepairKit(2));
    addItem(inv, makeMine(2));
    expect(emptySlotCount(inv)).toBe(HAND_SLOTS);
    expect(addItem(inv, makeArmor(1))).toBeNull();
  });

  it('removes items, frees the slot, and getItem returns null after', () => {
    const inv = createEmptyInventory();
    const w = makeWeapon(1);
    addItem(inv, w);
    const removed = removeItem(inv, { slotKind: 'hand', index: 0 });
    expect(removed).toBe(w);
    expect(inv.hands[0]).toBeNull();
    expect(getItem(inv, { slotKind: 'hand', index: 0 })).toBeNull();

    // The now-empty slot accepts new items.
    const replacement = makeWeapon(2);
    addItem(inv, replacement);
    expect(inv.hands[0]).toBe(replacement);
  });

  it('removeItem on an empty slot returns null', () => {
    const inv = createEmptyInventory();
    expect(removeItem(inv, { slotKind: 'hand', index: 1 })).toBeNull();
  });

  it('findItem locates an item by id, in either row', () => {
    const inv = createEmptyInventory();
    const w = makeWeapon(1);
    const armor = makeArmor(2);
    addItem(inv, w);
    addItem(inv, armor);
    expect(findItem(inv, w.id)).toEqual({ slotKind: 'hand', index: 0 });
    expect(findItem(inv, armor.id)).toEqual({ slotKind: 'backpack', index: 0 });
    expect(findItem(inv, 'nope')).toBeNull();
  });

  it('allItems lists hands first, then backpack, in slot order', () => {
    const inv = createEmptyInventory();
    addItem(inv, makeWeapon(1));
    addItem(inv, makeArmor(1));
    addItem(inv, makeWeapon(2));
    addItem(inv, makeRepairKit(2));
    const kinds = allItems(inv).map((x) => x.item.kind);
    expect(kinds).toEqual(['weapon', 'weapon', 'armor', 'repairKit']);
  });
});

describe('item factories', () => {
  it('makeWeapon emits hand-slot passive damage', () => {
    const w = makeWeapon(3);
    expect(w.kind).toBe('weapon');
    expect(w.slotKind).toBe('hand');
    expect(w.passive).toEqual({ stat: 'damage', delta: 3 });
    expect(w.active).toBeUndefined();
  });

  it('makeArmor emits backpack passive maxHp', () => {
    const a = makeArmor(2);
    expect(a.slotKind).toBe('backpack');
    expect(a.passive).toEqual({ stat: 'maxHp', delta: 2 });
  });

  it('makeRangeModule emits backpack passive attackRange', () => {
    const rm = makeRangeModule(1);
    expect(rm.passive).toEqual({ stat: 'attackRange', delta: 1 });
  });

  it('makeRepairKit emits heal active with AP cost', () => {
    const k = makeRepairKit(2);
    expect(k.passive).toBeUndefined();
    expect(k.active).toEqual({ kind: 'heal', amount: 2, apCost: 1 });
  });

  it('makeMine emits placeMine active with AP cost', () => {
    const m = makeMine(2);
    expect(m.passive).toBeUndefined();
    expect(m.active).toEqual({ kind: 'placeMine', amount: 2, apCost: 1 });
  });

  it('each call yields a unique id', () => {
    const ids = new Set([
      makeWeapon(1).id,
      makeWeapon(1).id,
      makeArmor(1).id,
      makeArmor(1).id,
      makeMine(1).id,
    ]);
    expect(ids.size).toBe(5);
  });
});
