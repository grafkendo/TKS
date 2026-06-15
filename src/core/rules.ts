// ============================================================================
// Tackticus — Rules engine (pure, deterministic, framework-agnostic).
//
// This file is the SINGLE SOURCE OF TRUTH for game rules.
// The PHP `BoardManager.php` is a manual port of the same algorithms;
// keep them aligned when changing rules here.
//
// Conventions:
//   - x = column (1..N), y = row (1..N).
//   - y = 1 is the "bottom" row (player[0]'s home).
//   - All functions are immutable: they NEVER mutate inputs.
// ============================================================================

import {
  AppliedMove,
  Board,
  Coord,
  DEFAULT_CONFIG,
  GameConfig,
  GameOutcome,
  GameState,
  Move,
  PlayerId,
} from './types';

// ---------------------------------------------------------------------------
// Board helpers
// ---------------------------------------------------------------------------

/** Allocate an empty (size+1) × (size+1) board with all nulls. Slot 0 unused. */
export function emptyBoard(size: number): Board {
  const board: Board = [];
  for (let x = 0; x <= size; x++) {
    board[x] = new Array(size + 1).fill(null);
  }
  return board;
}

/** Deep-copy a board (cheap: it's just numbers/nulls). */
export function cloneBoard(b: Board): Board {
  return b.map((col) => col.slice());
}

/** Are these coordinates inside the board? */
export function inBounds(size: number, x: number, y: number): boolean {
  return x >= 1 && x <= size && y >= 1 && y <= size;
}

export function ownerAt(board: Board, x: number, y: number): PlayerId | null {
  return board[x]?.[y] ?? null;
}

// ---------------------------------------------------------------------------
// Initial setup
// ---------------------------------------------------------------------------

/**
 * Build the starting position: each player gets one full row of pieces near
 * their edge. Player[0] occupies row 2; Player[1] occupies row (size - 1).
 * (Row 1 and row size are left empty — they're "no-mans-lands" so the first
 *  move always has a target square available.)
 */
export function initialBoard(config: GameConfig, players: [PlayerId, PlayerId]): Board {
  const board = emptyBoard(config.boardSize);
  const bottomRow = 2;
  const topRow = config.boardSize - 1;
  for (let x = 1; x <= config.boardSize; x++) {
    board[x][bottomRow] = players[0];
    board[x][topRow] = players[1];
  }
  return board;
}

/** Construct a fresh GameState ready to play. */
export function newGame(
  players: [PlayerId, PlayerId],
  config: GameConfig = DEFAULT_CONFIG
): GameState {
  return {
    config,
    board: initialBoard(config, players),
    turn: players[0],
    players,
    captures: { [players[0]]: 0, [players[1]]: 0 },
    outcome: { kind: 'ongoing' },
    history: [],
  };
}

// ---------------------------------------------------------------------------
// Move legality
// ---------------------------------------------------------------------------

/** The 4 orthogonal directions: right, left, up, down. */
const ORTHOGONAL: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/**
 * Return all legal moves the given player can currently make.
 * A move is legal iff:
 *   - The source square belongs to `player`.
 *   - The destination is exactly 1 orthogonal step away.
 *   - The destination is empty.
 *   - The destination is in bounds.
 */
export function legalMoves(state: GameState, player: PlayerId): Move[] {
  if (state.outcome.kind !== 'ongoing') return [];
  const { board, config } = state;
  const out: Move[] = [];
  const size = config.boardSize;

  for (let x = 1; x <= size; x++) {
    for (let y = 1; y <= size; y++) {
      if (board[x][y] !== player) continue;
      for (const [dx, dy] of ORTHOGONAL) {
        const tx = x + dx;
        const ty = y + dy;
        if (!inBounds(size, tx, ty)) continue;
        if (board[tx][ty] === null) {
          out.push({ fromX: x, fromY: y, toX: tx, toY: ty });
        }
      }
    }
  }
  return out;
}

export function isLegalMove(state: GameState, player: PlayerId, move: Move): boolean {
  if (state.outcome.kind !== 'ongoing') return false;
  if (state.turn !== player) return false;
  const { board, config } = state;
  const { fromX, fromY, toX, toY } = move;
  if (!inBounds(config.boardSize, fromX, fromY)) return false;
  if (!inBounds(config.boardSize, toX, toY)) return false;
  if (board[fromX][fromY] !== player) return false;
  if (board[toX][toY] !== null) return false;
  const dx = Math.abs(toX - fromX);
  const dy = Math.abs(toY - fromY);
  return (dx === 1 && dy === 0) || (dx === 0 && dy === 1);
}

// ---------------------------------------------------------------------------
// Capture resolution
// ---------------------------------------------------------------------------

/**
 * Given that `player` just moved a piece INTO (toX, toY), find every enemy
 * piece that is now flanked.
 *
 * An enemy at (ex, ey) is captured iff there exist player-owned pieces at
 * BOTH (ex+dx, ey+dy) AND (ex-dx, ey-dy) for the same orthogonal direction
 * (dx, dy). Diagonals do NOT capture.
 *
 * Optimization: only the 4 neighbors of the moved-to square could possibly
 * have become flanked by this single move. We don't need to scan the board.
 */
export function findCaptures(
  board: Board,
  size: number,
  player: PlayerId,
  toX: number,
  toY: number
): Coord[] {
  const captures: Coord[] = [];

  for (const [dx, dy] of ORTHOGONAL) {
    const ex = toX + dx;
    const ey = toY + dy;
    if (!inBounds(size, ex, ey)) continue;
    const enemyOwner = board[ex][ey];
    if (enemyOwner === null || enemyOwner === player) continue;
    // Opposite side of the enemy along the same axis
    const ox = ex + dx;
    const oy = ey + dy;
    if (!inBounds(size, ox, oy)) continue;
    if (board[ox][oy] === player) {
      captures.push({ x: ex, y: ey });
    }
  }
  return captures;
}

// ---------------------------------------------------------------------------
// State transitions
// ---------------------------------------------------------------------------

export class IllegalMoveError extends Error {
  constructor(public move: Move, public reason: string) {
    super(`Illegal move ${JSON.stringify(move)}: ${reason}`);
  }
}

/**
 * Apply a move. Returns a NEW GameState; the input is not mutated.
 * Throws IllegalMoveError if the move isn't legal.
 *
 * After moving, this resolves all captures, updates capture counts, switches
 * the turn, and checks the end-of-game conditions (capture-threshold win,
 * stalemate loss).
 */
export function applyMove(state: GameState, player: PlayerId, move: Move): GameState {
  if (state.outcome.kind !== 'ongoing') {
    throw new IllegalMoveError(move, 'game is already over');
  }
  if (state.turn !== player) {
    throw new IllegalMoveError(move, `not your turn (it's ${state.turn}'s turn)`);
  }
  if (!isLegalMove(state, player, move)) {
    throw new IllegalMoveError(move, 'move violates piece-movement rules');
  }

  const size = state.config.boardSize;
  const board = cloneBoard(state.board);

  // Move the piece
  board[move.fromX][move.fromY] = null;
  board[move.toX][move.toY] = player;

  // Resolve captures
  const captured = findCaptures(board, size, player, move.toX, move.toY);
  for (const c of captured) {
    board[c.x][c.y] = null;
  }

  // Update captures count
  const captures = { ...state.captures };
  captures[player] = (captures[player] ?? 0) + captured.length;

  // Determine outcome
  const opponent = state.players[0] === player ? state.players[1] : state.players[0];
  let outcome: GameOutcome = state.outcome;
  if (captures[player] >= state.config.capturesToWin) {
    outcome = { kind: 'win', winner: player, reason: 'captures' };
  }

  const applied: AppliedMove = { move, by: player, captured };
  const history = [...state.history, applied];

  // Build the next state (still ongoing) then check stalemate against opponent
  let next: GameState = {
    ...state,
    board,
    captures,
    outcome,
    turn: opponent,
    history,
  };

  if (next.outcome.kind === 'ongoing' && legalMoves(next, opponent).length === 0) {
    next = { ...next, outcome: { kind: 'win', winner: player, reason: 'stalemate' } };
  }

  return next;
}

// ---------------------------------------------------------------------------
// Convenience
// ---------------------------------------------------------------------------

/** Count pieces a player currently has on the board. */
export function countPieces(board: Board, player: PlayerId): number {
  let n = 0;
  for (let x = 1; x < board.length; x++) {
    for (let y = 1; y < board[x].length; y++) {
      if (board[x][y] === player) n++;
    }
  }
  return n;
}

/** Render the board to a compact string for debugging / tests. */
export function boardToString(
  board: Board,
  size: number,
  symbols: Record<PlayerId, string> = { 1: 'R', 2: 'B' }
): string {
  const lines: string[] = [];
  for (let y = size; y >= 1; y--) {
    const row: string[] = [];
    for (let x = 1; x <= size; x++) {
      const o = board[x][y];
      row.push(o === null ? '.' : symbols[o] ?? '?');
    }
    lines.push(row.join(' '));
  }
  return lines.join('\n');
}

/**
 * Parse a board diagram (multi-line string, top row first).
 * '.' = empty, '1'/'2' = player ids, 'R'/'B' = player 1 / player 2.
 * Useful for tests: lets you write expected positions visually.
 */
export function parseBoard(
  diagram: string,
  size: number,
  symbols: Record<string, PlayerId> = { R: 1, B: 2, '1': 1, '2': 2 }
): Board {
  const lines = diagram.trim().split('\n').map((l) => l.trim().split(/\s+/));
  if (lines.length !== size) {
    throw new Error(`parseBoard: expected ${size} rows, got ${lines.length}`);
  }
  const board = emptyBoard(size);
  for (let i = 0; i < size; i++) {
    const y = size - i; // first line = top row
    const row = lines[i];
    if (row.length !== size) {
      throw new Error(`parseBoard: row ${i} has ${row.length} cols, expected ${size}`);
    }
    for (let j = 0; j < size; j++) {
      const ch = row[j];
      if (ch === '.') continue;
      const p = symbols[ch];
      if (p === undefined) throw new Error(`parseBoard: unknown symbol '${ch}'`);
      board[j + 1][y] = p;
    }
  }
  return board;
}
