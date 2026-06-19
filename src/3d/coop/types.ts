// ============================================================================
// Online co-op PvE — serializable types and wire protocol.
// ============================================================================

import type { HexCoord } from '../hex/HexCoord';
import type { GameOutcome } from '../rules/winCondition';
import type { ArchetypeKey } from '../enemies/archetypes';

export type CoopPhase = 'lobby' | 'human' | 'ai' | 'ended';

export type ChassisKind = 'light' | 'medium' | 'heavy';

/** Serializable starting item (client maps to Item factories). */
export type CoopItemSpec =
  | { kind: 'repairKit'; amount: number }
  | { kind: 'weapon'; bonus: number; label: string }
  | { kind: 'armor'; bonus: number; label: string }
  | { kind: 'rangeModule'; bonus: number; label: string }
  | { kind: 'mine'; damage: number }
  | { kind: 'tacticalNuke' }
  | { kind: 'demoCharge' };

/** Persistent room member (lobby + in-game ownership). */
export interface CoopPlayer {
  id: string;
  name: string;
  /** 0 = first human slot, 1 = second. */
  slot: number;
  ready: boolean;
  /** Lobby pick — up to 3 mechs this player will field. */
  selectedMechs: ChassisKind[];
}

export interface CoopUnit {
  id: string;
  team: 1 | 2;
  /** Human player id; null for AI units. */
  ownerId: string | null;
  tile: HexCoord;
  chassis: ChassisKind;
  hp: number;
  maxHp: number;
  ap: number;
  maxAp: number;
  damage: number;
  attackRange: number;
  facingDeg: number;
  destroyed: boolean;
  techKills: number;
  /** Rolled once at spawn; client equips on first sync. */
  items: CoopItemSpec[];
  /** Team-2 enemy type for visuals and stats (grunt, scout, tank, …). */
  archetypeKey?: ArchetypeKey;
}

export interface CoopGameState {
  roomId: string;
  mapId: string;
  /** Playable hex keys (`q_r`). */
  tiles: string[];
  /** Hex keys that block movement (walls, buildings, etc.). */
  blockedTiles: string[];
  /** Team-2 orbital drop pad hex keys. */
  spawnPointTiles: string[];
  /** Red-team deploy hex keys (south field). */
  playerSpawnTiles: string[];
  units: CoopUnit[];
  players: CoopPlayer[];
  hostPlayerId: string;
  turnNumber: number;
  phase: CoopPhase;
  /** Which human may act during `human` phase. */
  activePlayerId: string | null;
  nextEnemyId: number;
  outcome: GameOutcome;
}

// ----- Client → server ------------------------------------------------------

export type CoopClientMessage =
  | { type: 'setName'; name: string }
  | { type: 'setMechSelection'; mechs: ChassisKind[] }
  | { type: 'setReady'; ready: boolean }
  | { type: 'setMap'; mapId: string }
  | { type: 'startGame' }
  | { type: 'action'; action: CoopAction };

export type CoopAction =
  | { kind: 'move'; unitId: string; to: HexCoord }
  | { kind: 'shoot'; unitId: string; targetUnitId: string }
  | { kind: 'pivot'; unitId: string; direction: 'left' | 'right' }
  | { kind: 'endPhase' };

// ----- Server → client ------------------------------------------------------

export type CoopServerMessage =
  | {
      type: 'joined';
      roomId: string;
      playerId: string;
      role: 'player' | 'spectator';
      isHost: boolean;
    }
  | { type: 'state'; state: CoopGameState }
  | { type: 'events'; events: CoopGameEvent[] }
  | { type: 'actionResult'; events: CoopGameEvent[]; state: CoopGameState }
  | { type: 'error'; reason: string };

export type CoopGameEvent =
  | { kind: 'moved'; unitId: string; path: HexCoord[] }
  | { kind: 'shot'; unitId: string; targetUnitId: string; damage: number }
  | { kind: 'pivoted'; unitId: string; facingDeg: number }
  | { kind: 'spawned'; unitId: string; tile: HexCoord }
  | { kind: 'phase'; phase: CoopPhase; activePlayerId: string | null }
  | { kind: 'message'; text: string };

export interface CoopActionResult {
  state: CoopGameState;
  events: CoopGameEvent[];
}
