// ============================================================================
// Online co-op PvE — serializable types and wire protocol.
//
// Friends control team-1 mechs in sequential sub-phases; server runs AI for
// team 2. Guest names + room codes for MVP (no accounts yet).
// ============================================================================

import type { HexCoord } from '../hex/HexCoord';
import type { GameOutcome } from '../rules/winCondition';

export type CoopPhase = 'lobby' | 'human' | 'ai' | 'ended';

export type ChassisKind = 'light' | 'medium' | 'heavy';

/** Persistent room member (lobby + in-game ownership). */
export interface CoopPlayer {
  id: string;
  name: string;
  /** 0 = first human slot, 1 = second. */
  slot: number;
  ready: boolean;
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
}

export interface CoopGameState {
  roomId: string;
  mapId: string;
  /** Playable hex keys (`q_r`). */
  tiles: string[];
  /** Hex keys that block movement (walls, buildings, etc.). */
  blockedTiles: string[];
  units: CoopUnit[];
  players: CoopPlayer[];
  hostPlayerId: string;
  turnNumber: number;
  phase: CoopPhase;
  /** Which human may act during `human` phase. */
  activePlayerId: string | null;
  outcome: GameOutcome;
}

// ----- Client → server ------------------------------------------------------

export type CoopClientMessage =
  | { type: 'setName'; name: string }
  | { type: 'setReady'; ready: boolean }
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
  | { type: 'error'; reason: string };

export type CoopGameEvent =
  | { kind: 'moved'; unitId: string; path: HexCoord[] }
  | { kind: 'shot'; unitId: string; targetUnitId: string; damage: number }
  | { kind: 'pivoted'; unitId: string; facingDeg: number }
  | { kind: 'phase'; phase: CoopPhase; activePlayerId: string | null }
  | { kind: 'message'; text: string };

export interface CoopActionResult {
  state: CoopGameState;
  events: CoopGameEvent[];
}
