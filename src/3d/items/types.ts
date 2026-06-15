// ============================================================================
// Items — equippable / consumable pickups carried in a mech's inventory.
//
// Two orthogonal axes describe what an item does:
//
//   passive: ItemPassive
//     A Stat modifier applied for as long as the item sits in any inventory
//     slot. Example: a +2 weapon adds +2 to the carrier's `damage` Stat via
//     `addModifier({ source: "item:<itemId>", delta: 2 })`. Removing the
//     item reverses the modifier by source.
//
//   active: ItemActive
//     A clickable ability — costs AP, may consume the item. Example: a
//     repair kit's `heal` action restores HP and removes itself from
//     inventory. Mines `placeMine` drop a board entity and remove themselves.
//
// An item can have a passive, an active, or both. Most have just one — but
// having both ready lets you describe e.g. a "Combat Shotgun" with a passive
// damage bonus AND an active "alpha strike" consumable mode without changing
// any types.
//
// Pure data — no Three.js, no DOM. Easy to test, easy to serialize for a
// future server-authoritative mode.
// ============================================================================

export type ItemKind = 'weapon' | 'armor' | 'repairKit' | 'rangeModule' | 'mine';
export type SlotKind = 'hand' | 'backpack';
export type PassiveStat = 'damage' | 'maxHp' | 'attackRange';
export type ActiveKind = 'heal' | 'placeMine';

export interface ItemPassive {
  /** Which of the carrier's Stats this modifier targets. */
  stat: PassiveStat;
  /** Signed delta applied to the Stat (typically positive). */
  delta: number;
}

export interface ItemActive {
  kind: ActiveKind;
  /** Effect amount — HP restored, mine damage, etc. */
  amount: number;
  /** AP cost to use. */
  apCost: number;
}

export interface Item {
  /** Stable unique id — survives a save/load round-trip. */
  id: string;
  kind: ItemKind;
  name: string;
  description: string;
  /** Single-char/short label shown in the inventory grid. */
  icon: string;
  /** Hex color used for the 3D pickup mesh AND the inventory slot tint. */
  color: string;
  /** Which kind of slot the item can occupy. */
  slotKind: SlotKind;
  passive?: ItemPassive;
  active?: ItemActive;
}
