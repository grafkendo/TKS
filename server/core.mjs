// ============================================================================
// Tackticus — Node-loadable JavaScript port of src/core/rules.ts.
//
// KEEP IN SYNC with src/core/rules.ts. This mirror exists only because Node
// can't natively load TypeScript and we don't want to add a TS build step to
// the server runtime. The algorithm is identical; only the type annotations
// were stripped.
//
// To check sync: any time you change a function in src/core/rules.ts,
// reflect it here too. The Vitest suite covers the canonical TS version.
// ============================================================================

const DEFAULT_CONFIG = { boardSize: 6, capturesToWin: 4 };
const ORTHOGONAL = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

function emptyBoard(size) {
  const b = [];
  for (let x = 0; x <= size; x++) b[x] = new Array(size + 1).fill(null);
  return b;
}

function cloneBoard(b) {
  return b.map((col) => col.slice());
}

function inBounds(size, x, y) {
  return x >= 1 && x <= size && y >= 1 && y <= size;
}

function initialBoard(config, players) {
  const board = emptyBoard(config.boardSize);
  const bottomRow = 2;
  const topRow = config.boardSize - 1;
  for (let x = 1; x <= config.boardSize; x++) {
    board[x][bottomRow] = players[0];
    board[x][topRow] = players[1];
  }
  return board;
}

export function newGame(players, config = DEFAULT_CONFIG) {
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

export function legalMoves(state, player) {
  if (state.outcome.kind !== 'ongoing') return [];
  const { board, config } = state;
  const size = config.boardSize;
  const out = [];
  for (let x = 1; x <= size; x++) {
    for (let y = 1; y <= size; y++) {
      if (board[x][y] !== player) continue;
      for (const [dx, dy] of ORTHOGONAL) {
        const tx = x + dx;
        const ty = y + dy;
        if (!inBounds(size, tx, ty)) continue;
        if (board[tx][ty] === null) out.push({ fromX: x, fromY: y, toX: tx, toY: ty });
      }
    }
  }
  return out;
}

export function isLegalMove(state, player, move) {
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

export function findCaptures(board, size, player, toX, toY) {
  const captures = [];
  for (const [dx, dy] of ORTHOGONAL) {
    const ex = toX + dx;
    const ey = toY + dy;
    if (!inBounds(size, ex, ey)) continue;
    const enemyOwner = board[ex][ey];
    if (enemyOwner === null || enemyOwner === player) continue;
    const ox = ex + dx;
    const oy = ey + dy;
    if (!inBounds(size, ox, oy)) continue;
    if (board[ox][oy] === player) captures.push({ x: ex, y: ey });
  }
  return captures;
}

export class IllegalMoveError extends Error {
  constructor(move, reason) {
    super(`Illegal move ${JSON.stringify(move)}: ${reason}`);
    this.move = move;
    this.reason = reason;
  }
}

export function applyMove(state, player, move) {
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
  board[move.fromX][move.fromY] = null;
  board[move.toX][move.toY] = player;

  const captured = findCaptures(board, size, player, move.toX, move.toY);
  for (const c of captured) board[c.x][c.y] = null;

  const captures = { ...state.captures };
  captures[player] = (captures[player] ?? 0) + captured.length;

  const opponent = state.players[0] === player ? state.players[1] : state.players[0];
  let outcome = state.outcome;
  if (captures[player] >= state.config.capturesToWin) {
    outcome = { kind: 'win', winner: player, reason: 'captures' };
  }

  const applied = { move, by: player, captured };
  const history = [...state.history, applied];

  let next = { ...state, board, captures, outcome, turn: opponent, history };

  if (next.outcome.kind === 'ongoing' && legalMoves(next, opponent).length === 0) {
    next = { ...next, outcome: { kind: 'win', winner: player, reason: 'stalemate' } };
  }

  return next;
}
