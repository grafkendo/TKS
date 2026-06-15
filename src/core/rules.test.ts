// ============================================================================
// Tackticus — Rules engine unit tests (run with `npm test`).
// ============================================================================

import { describe, expect, it } from 'vitest';
import {
  applyMove,
  boardToString,
  countPieces,
  findCaptures,
  IllegalMoveError,
  initialBoard,
  legalMoves,
  newGame,
  parseBoard,
} from './rules';
import { DEFAULT_CONFIG } from './types';

describe('initial setup', () => {
  it('places one full row per player on rows 2 and (size-1)', () => {
    const g = newGame([1, 2]);
    expect(countPieces(g.board, 1)).toBe(DEFAULT_CONFIG.boardSize);
    expect(countPieces(g.board, 2)).toBe(DEFAULT_CONFIG.boardSize);
    // Spot check: row 2 is all player 1
    for (let x = 1; x <= DEFAULT_CONFIG.boardSize; x++) {
      expect(g.board[x][2]).toBe(1);
      expect(g.board[x][DEFAULT_CONFIG.boardSize - 1]).toBe(2);
    }
    // Row 1 and row N are empty
    for (let x = 1; x <= DEFAULT_CONFIG.boardSize; x++) {
      expect(g.board[x][1]).toBeNull();
      expect(g.board[x][DEFAULT_CONFIG.boardSize]).toBeNull();
    }
  });

  it('player 1 (bottom) moves first', () => {
    const g = newGame([1, 2]);
    expect(g.turn).toBe(1);
  });
});

describe('legal moves', () => {
  it('returns 2 * boardSize legal moves from the starting position (each piece has 2 directions)', () => {
    // On a 6x6 board with rows 2 and 5 full, player 1's pieces can each move
    // forward (y=2 -> y=3) and backward (y=2 -> y=1). Each piece's left/right
    // neighbors are occupied, so each piece has 2 moves -> 6 pieces * 2 = 12.
    const g = newGame([1, 2]);
    const moves = legalMoves(g, 1);
    expect(moves).toHaveLength(12);
  });

  it('rejects moves of more than 1 square', () => {
    const g = newGame([1, 2]);
    expect(() =>
      applyMove(g, 1, { fromX: 1, fromY: 2, toX: 1, toY: 4 })
    ).toThrow(IllegalMoveError);
  });

  it('rejects diagonal moves', () => {
    const g = newGame([1, 2]);
    expect(() =>
      applyMove(g, 1, { fromX: 1, fromY: 2, toX: 2, toY: 3 })
    ).toThrow(IllegalMoveError);
  });

  it("rejects moving the opponent's piece", () => {
    const g = newGame([1, 2]);
    expect(() =>
      applyMove(g, 1, { fromX: 1, fromY: 5, toX: 1, toY: 4 })
    ).toThrow(IllegalMoveError);
  });

  it('rejects moving when it is not your turn', () => {
    const g = newGame([1, 2]);
    expect(() =>
      applyMove(g, 2, { fromX: 1, fromY: 5, toX: 1, toY: 4 })
    ).toThrow(IllegalMoveError);
  });
});

describe('flank capture', () => {
  it('captures a single enemy piece when flanked horizontally', () => {
    // 4x4 board, manually built:
    //   . . . .
    //   . . . .
    //   R B . .       <- after R moves from (4,2) -> (3,2) this is the state
    //   . . . .
    // Then R moves another piece to (3,2)+1 = (4,2)?? Let's set up a clearer case:
    //
    // Start: R at (1,3), B at (2,3), empty at (3,3). After R places (or moves) to (3,3),
    // B at (2,3) is flanked between R at (1,3) and R at (3,3).

    const cfg = { boardSize: 4, capturesToWin: 4 };
    const board = parseBoard(
      `
      . . . .
      R B . R
      . . . .
      . . . .
      `,
      4
    );
    const g = {
      config: cfg,
      board,
      turn: 1,
      players: [1, 2] as [number, number],
      captures: { 1: 0, 2: 0 },
      outcome: { kind: 'ongoing' as const },
      history: [],
    };
    // R moves (4,3) -> (3,3) flanking B at (2,3)
    const next = applyMove(g, 1, { fromX: 4, fromY: 3, toX: 3, toY: 3 });
    expect(next.board[2][3]).toBeNull();
    expect(next.captures[1]).toBe(1);
  });

  it('captures multiple pieces in one move (both axes)', () => {
    // Set up so that moving R into the center flanks B on the left AND below:
    //
    //   . R . .
    //   . B . .
    //   R B . .   <- R will arrive here at (3,2)
    //   . . . .
    //
    // Wait — that flanks vertically (B at (2,3) between R at (2,4) and R at (2,2)? no R is at (1,2))
    // Let me design more carefully:
    //
    //   . R . .       (y=4)
    //   . B . R       (y=3)
    //   . . B .       (y=2)
    //   . . R .       (y=1)
    //
    // R is moving (4,3) -> (3,3). Then around (3,3):
    //   neighbor (2,3) = B; opposite is (1,3) = . => no capture
    //   neighbor (4,3) = R itself was source, now empty
    //   neighbor (3,4) = . => skip
    //   neighbor (3,2) = B; opposite (3,1) = R => capture
    //
    // Plus need a vertical flank as well. Let's restructure to one direction
    // and verify multi-capture by a different geometry:
    //
    //   . . . .
    //   B . B .       (y=3)
    //   . . . .
    //   R R R .       (y=1)
    //
    // No — move R from (1,1) -> (1,2): captures? Let me check around (1,2):
    //   (2,2) = .   skip
    //   (0,2)       out of bounds
    //   (1,3) = B   opposite (1,4) = . no
    //   (1,1) = R   source now empty
    // No captures.
    //
    // Simplest correct example for multi-capture: a "cross" arrangement.
    //
    //   . . R . .       (y=5)
    //   . . B . .       (y=4)
    //   R B . . .       (y=3)   <- R will arrive at (3,3)
    //   . . B . .       (y=2)
    //   . . R . .       (y=1)
    //
    // After R moves (1,3) -> (3,3)?? Wait, (1,3) -> (3,3) is two squares away, not legal.
    // Need it to be a 1-square slide. Let's say R is at (4,3) and slides to (3,3).
    //
    //   . . R . .       (y=5)
    //   . . B . .       (y=4)
    //   . B . R . .       <- nope let me just rewrite
    //
    // Cleanest: R slides from (3,4) -> (3,3)? Around (3,3):
    //   neighbor (3,2) = B, opposite (3,1) = R => capture vertically
    //   neighbor (2,3) = B, opposite (1,3) = R => capture horizontally
    //   That's 2 captures from one move.

    const board = parseBoard(
      `
      . . R . .
      . . . . .
      R B . . .
      . . B . .
      . . R . .
      `,
      5
    );
    const g = {
      config: { boardSize: 5, capturesToWin: 4 },
      board,
      turn: 1,
      players: [1, 2] as [number, number],
      captures: { 1: 0, 2: 0 },
      outcome: { kind: 'ongoing' as const },
      history: [],
    };
    // R at (3,5) slides down to (3,4)? That's empty. Then around (3,4):
    //   (3,5) = .  (just vacated)
    //   (3,3) = .
    //   (2,4) = .
    //   (4,4) = .
    // No captures from that. We need the R to arrive at (3,3).
    //
    // Move (3,5) -> ? not adjacent to (3,3). Place R at (3,4) and slide to (3,3)?
    // The diagram puts R only at (3,5), (1,3), (3,1). None can reach (3,3) in 1 step.
    //
    // So move R from (3,5) -> (3,4):
    //   around (3,4): (3,5) empty, (3,3) empty, (2,4) empty, (4,4) empty
    //   captures = 0
    //
    // Adjust: put R at (3,4) (one above the target), then move (3,4) -> (3,3).
    //
    // Final diagram (5 rows top to bottom):
    //   . . . . .       y=5
    //   . . R . .       y=4   <-- R that will move down
    //   R B . . .       y=3   <-- B captured horizontally
    //   . . B . .       y=2   <-- B captured vertically
    //   . . R . .       y=1
    const board2 = parseBoard(
      `
      . . . . .
      . . R . .
      R B . . .
      . . B . .
      . . R . .
      `,
      5
    );
    const g2 = {
      config: { boardSize: 5, capturesToWin: 4 },
      board: board2,
      turn: 1,
      players: [1, 2] as [number, number],
      captures: { 1: 0, 2: 0 },
      outcome: { kind: 'ongoing' as const },
      history: [],
    };
    const next = applyMove(g2, 1, { fromX: 3, fromY: 4, toX: 3, toY: 3 });
    expect(next.captures[1]).toBe(2);
    expect(next.board[2][3]).toBeNull();
    expect(next.board[3][2]).toBeNull();
  });

  it('does NOT capture a piece on the edge (no opposite square to flank from)', () => {
    // B is at (1,3) on the left edge. R at (2,3) "next to" B — but the opposite
    // side of B horizontally is (0,3) which is out of bounds. So no capture.
    const board = parseBoard(
      `
      . . . .
      R . . .
      B . . .
      R . . .
      `,
      4
    );
    // wait — that's a vertical sandwich at column 1.
    // For an edge-protection test, let's use horizontal:
    const board2 = parseBoard(
      `
      . . . .
      . . . .
      B R . R
      . . . .
      `,
      4
    );
    const g = {
      config: { boardSize: 4, capturesToWin: 4 },
      board: board2,
      turn: 1,
      players: [1, 2] as [number, number],
      captures: { 1: 0, 2: 0 },
      outcome: { kind: 'ongoing' as const },
      history: [],
    };
    // R moves (4,2) -> (3,2)? wait (4,2) is already R. (2,2)=R. Let me rethink.
    // Let me just directly test findCaptures on a known board:
    const b = parseBoard(
      `
      . . . .
      . . . .
      B R . .
      . . . .
      `,
      4
    );
    // Player 1 just "arrived" at (2,2). B is at (1,2). Opposite of (1,2) is (0,2) = oob.
    // No capture.
    const caps = findCaptures(b, 4, 1, 2, 2);
    expect(caps).toHaveLength(0);
  });
});

describe('win conditions', () => {
  it('marks game as won when capturesToWin reached', () => {
    const cfg = { boardSize: 4, capturesToWin: 1 };
    const board = parseBoard(
      `
      . . . .
      R B . R
      . . . .
      . . . .
      `,
      4
    );
    const g = {
      config: cfg,
      board,
      turn: 1,
      players: [1, 2] as [number, number],
      captures: { 1: 0, 2: 0 },
      outcome: { kind: 'ongoing' as const },
      history: [],
    };
    const next = applyMove(g, 1, { fromX: 4, fromY: 3, toX: 3, toY: 3 });
    expect(next.outcome).toEqual({ kind: 'win', winner: 1, reason: 'captures' });
  });

  it('marks game as won by stalemate if opponent has zero legal moves', () => {
    // Construct a position where after player 1's move, player 2 has nothing.
    // Quick way: 3x3 board with player 2 having a single piece in a corner
    // hemmed in.
    //
    //   B R R       y=3
    //   R . R       y=2
    //   R R R       y=1
    //
    // It's player 2's turn next after our move; we'll set up that turn-1 move
    // first to trigger the stalemate check.
    const cfg = { boardSize: 3, capturesToWin: 99 }; // disable capture-win
    const board = parseBoard(
      `
      B R R
      R . R
      R R R
      `,
      3
    );
    const g = {
      config: cfg,
      board,
      turn: 1,
      players: [1, 2] as [number, number],
      captures: { 1: 0, 2: 0 },
      outcome: { kind: 'ongoing' as const },
      history: [],
    };
    // R moves (1,2) -> (2,2) into the empty center.
    // After: B at (1,3) is surrounded by R on (2,3) and below (1,2) is now empty
    // so B has neighbors (2,3)=R, (1,2)=empty, (1,4)=oob. B can move to (1,2) — wait that means B has a move.
    //
    // Let me redesign:
    //   B R R       y=3
    //   . R R       y=2
    //   R R R       y=1
    //
    // It's R's turn. R moves (3,3) -> ??? all R's neighbors are R. Bad.
    //
    // Easier: directly construct a STATE where after a move, opponent has no moves.
    // For that we need at least one empty square so the test move can happen.
    //
    //   B R R       y=3
    //   . . R       y=2
    //   R R R       y=1
    //
    // R moves (1,1) -> (1,2). After: board is
    //   B R R       y=3
    //   R . R       y=2
    //   . R R       y=1
    //
    // Now it's B's turn. B at (1,3) — neighbors: (2,3)=R, (1,2)=R, (1,4)=oob, (0,3)=oob. STUCK.
    // Stalemate.
    const board2 = parseBoard(
      `
      B R R
      . . R
      R R R
      `,
      3
    );
    const g2 = {
      config: cfg,
      board: board2,
      turn: 1,
      players: [1, 2] as [number, number],
      captures: { 1: 0, 2: 0 },
      outcome: { kind: 'ongoing' as const },
      history: [],
    };
    const next = applyMove(g2, 1, { fromX: 1, fromY: 1, toX: 1, toY: 2 });
    expect(next.outcome).toEqual({ kind: 'win', winner: 1, reason: 'stalemate' });
  });
});

describe('immutability', () => {
  it('does not mutate the input state', () => {
    const g = newGame([1, 2]);
    const before = boardToString(g.board, g.config.boardSize);
    applyMove(g, 1, { fromX: 1, fromY: 2, toX: 1, toY: 3 });
    const after = boardToString(g.board, g.config.boardSize);
    expect(after).toEqual(before);
  });
});
