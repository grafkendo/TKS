// ============================================================================
// Stat — a numeric attribute (base value + named additive modifiers).
//
// Why a class instead of a plain number:
//   - We want to be able to say "this mech has +2 movement from thrusters"
//     and later remove that bonus by source (rather than tracking deltas).
//   - We want the *effective* (after-mods) value to be derived, not stored,
//     so it's never stale.
//   - We want a minimum clamp so debuffs can't push a stat negative without
//     gameplay code having to remember to floor it.
//
// Modifier sources are strings ("chassis:light", "status:slow",
// "item:thrusters", "ability:overdrive"). One source can only contribute
// one modifier at a time — pushing a second modifier with the same source
// REPLACES the first. That matches how most tactics games think about
// buffs ("you are already inspired; the new inspire overrides it").
//
// Pure logic — no Three.js, no DOM. Easy to use server-side later.
// ============================================================================

export interface StatModifier {
  /** Stable identifier for who applied this modifier (used for removal). */
  source: string;
  /** Integer delta. Can be negative. */
  delta: number;
  /** Optional human-readable description for UI tooltips. */
  label?: string;
}

export interface StatOptions {
  /** Floor for the effective value (default 0). */
  min?: number;
  /** Optional cap for the effective value. */
  max?: number;
}

export class Stat {
  private _base: number;
  private _min: number;
  private _max: number | undefined;
  private _mods: StatModifier[] = [];

  constructor(base: number, opts: StatOptions = {}) {
    this._base = base;
    this._min = opts.min ?? 0;
    this._max = opts.max;
  }

  // ----- Base value -----

  get base(): number {
    return this._base;
  }

  setBase(v: number): void {
    this._base = v;
  }

  // ----- Modifiers -----

  /** Add (or replace, if `source` already exists) a modifier. */
  addModifier(mod: StatModifier): void {
    const i = this._mods.findIndex((m) => m.source === mod.source);
    if (i >= 0) this._mods[i] = mod;
    else this._mods.push(mod);
  }

  /** Remove the modifier whose `source` matches. No-op if absent. */
  removeModifier(source: string): boolean {
    const i = this._mods.findIndex((m) => m.source === source);
    if (i < 0) return false;
    this._mods.splice(i, 1);
    return true;
  }

  clearModifiers(): void {
    this._mods.length = 0;
  }

  hasModifier(source: string): boolean {
    return this._mods.some((m) => m.source === source);
  }

  /** Read-only view of all current modifiers (for UI / tooltips). */
  get modifiers(): ReadonlyArray<StatModifier> {
    return this._mods;
  }

  // ----- Effective value -----

  /** Effective value = base + sum(deltas), clamped to [min, max]. */
  get effective(): number {
    const sum = this._mods.reduce((acc, m) => acc + m.delta, this._base);
    if (this._max !== undefined && sum > this._max) return this._max;
    if (sum < this._min) return this._min;
    return sum;
  }

  /** Convenience: total of just the modifiers (without base). */
  get modifierSum(): number {
    return this._mods.reduce((acc, m) => acc + m.delta, 0);
  }

  // ----- Serialization helpers -----

  toJSON(): { base: number; modifiers: StatModifier[]; min: number; max: number | undefined } {
    return {
      base: this._base,
      modifiers: this._mods.slice(),
      min: this._min,
      max: this._max,
    };
  }
}
