// ============================================================================
// Tackticus — Shared types for the rules engine.
//
// Everything in src/core/ must be PURE and runtime-agnostic:
//   - no DOM
//   - no Node APIs
//   - no BGA framework
//   - no I/O of any kind
//
// This lets the same engine drive the local hot-seat client, the optional
// WebSocket server, and (manually mirrored) the PHP backend on BGA.
// ============================================================================

/** Player numeric id. In local play we use 1 and 2; on BGA it's a real BGA player_id. */
export type PlayerId = number;

/** A board square. `null` = empty, otherwise owned by player. */
export type SquareOwner = PlayerId | null;

/** 1-indexed coordinates, x = column, y = row. y=1 is the "bottom" (player 1 side). */
export interface Coord {
  x: number;
  y: number;
}

/** A move from (fromX, fromY) to (toX, toY). All coords 1-indexed. */
export interface Move {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
}

/**
 * The board state. Indexed [x][y] where both run 1..size.
 * Index 0 is unused (so code reads naturally against the 1-indexed coords).
 */
export type Board = SquareOwner[][];

/** Configuration that defines a Tackticus variant. */
export interface GameConfig {
  /** Side length of the square board. Default 6. */
  boardSize: number;
  /** How many enemy pieces must be captured to win. Default 4. */
  capturesToWin: number;
}

export const DEFAULT_CONFIG: GameConfig = {
  boardSize: 6,
  capturesToWin: 4,
};

/** Possible terminal states of the game. */
export type GameOutcome =
  | { kind: 'ongoing' }
  | { kind: 'win'; winner: PlayerId; reason: 'captures' | 'stalemate' };

/** Full snapshot of a game at a point in time. */
export interface GameState {
  config: GameConfig;
  board: Board;
  /** Whose turn is it? */
  turn: PlayerId;
  /** Both players involved. By convention players[0] starts on the bottom row. */
  players: [PlayerId, PlayerId];
  /** Total captures each player has made so far. Indexed by player id. */
  captures: Record<PlayerId, number>;
  outcome: GameOutcome;
  /** Ordered move history (for replay / undo / audit). */
  history: AppliedMove[];
}

/** A move plus the resolved consequences (captures, resulting outcome). */
export interface AppliedMove {
  move: Move;
  by: PlayerId;
  captured: Coord[];
}
