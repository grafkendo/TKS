// ============================================================================
// Tackticus — Local hot-seat client.
//
// Entirely client-side: no server, no network. Two players take turns on the
// same browser. Drives the same `core` rules engine that BGA's PHP backend
// mirrors, so any game played here behaves identically to BGA.
// ============================================================================

import './styles.css';
import {
  applyMove,
  legalMoves,
  newGame,
  IllegalMoveError,
} from '../core/rules';
import type { GameState, Move, PlayerId } from '../core/types';

const PLAYER_NAMES: Record<PlayerId, string> = { 1: 'Red', 2: 'Blue' };
const PLAYER_COLORS: Record<PlayerId, string> = { 1: '#e94e3b', 2: '#3b6ee9' };
const SQUARE_PX = 72;
const PADDING_PX = 10;

let state: GameState = newGame([1, 2]);
let selected: { x: number; y: number } | null = null;
const historyStack: GameState[] = [];

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el;
}

function renderBoard(): void {
  const size = state.config.boardSize;
  const board = $('tk-board');
  const px = size * SQUARE_PX + PADDING_PX * 2;
  board.style.width = `${px}px`;
  board.style.height = `${px}px`;
  board.style.setProperty('--tk-square-size', `${SQUARE_PX}px`);
  board.style.setProperty('--tk-board-padding', `${PADDING_PX}px`);

  const legals = state.outcome.kind === 'ongoing' ? legalMoves(state, state.turn) : [];
  const moveableFromSelected = selected
    ? legals.filter((m) => m.fromX === selected!.x && m.fromY === selected!.y)
    : [];

  const moveableFromAny = new Set<string>(legals.map((m) => `${m.fromX}_${m.fromY}`));
  const destinationSquares = new Set<string>(
    moveableFromSelected.map((m) => `${m.toX}_${m.toY}`)
  );

  const parts: string[] = [];
  for (let x = 1; x <= size; x++) {
    for (let y = 1; y <= size; y++) {
      const owner = state.board[x][y];
      const left = PADDING_PX + (x - 1) * SQUARE_PX;
      const top = PADDING_PX + (size - y) * SQUARE_PX;
      const shade = (x + y) % 2 === 0 ? 'tk-light' : 'tk-dark';

      const isDest = destinationSquares.has(`${x}_${y}`);
      const isSelectablePiece =
        owner === state.turn &&
        moveableFromAny.has(`${x}_${y}`) &&
        state.outcome.kind === 'ongoing';
      const isSelected = selected?.x === x && selected.y === y;

      let pieceHtml = '';
      if (owner !== null) {
        const cls = [
          'tk-piece',
          isSelectablePiece ? 'selectable' : '',
          isSelected ? 'selected' : '',
        ]
          .filter(Boolean)
          .join(' ');
        pieceHtml = `<div class="${cls}" style="background:${PLAYER_COLORS[owner]};"></div>`;
      }

      parts.push(`
        <div class="tk-square ${shade} ${isDest ? 'legal-destination' : ''}"
             data-x="${x}" data-y="${y}"
             style="left:${left}px;top:${top}px;">
          ${pieceHtml}
        </div>
      `);
    }
  }
  board.innerHTML = parts.join('');

  for (const sq of board.querySelectorAll('.tk-square')) {
    sq.addEventListener('click', onSquareClick);
  }
}

function renderStatus(): void {
  $('caps-1').textContent = String(state.captures[1] ?? 0);
  $('caps-2').textContent = String(state.captures[2] ?? 0);
  $('tk-capwin').textContent = String(state.config.capturesToWin);

  const turnEl = $('tk-turn');
  if (state.outcome.kind === 'win') {
    const winner = state.outcome.winner;
    const reason = state.outcome.reason === 'captures' ? 'reaching the capture goal' : 'stalemate';
    turnEl.innerHTML = `<b style="color:${PLAYER_COLORS[winner]}">${PLAYER_NAMES[winner]} wins!</b><br><span class="tk-reason">(${reason})</span>`;
  } else {
    turnEl.innerHTML = `<b style="color:${PLAYER_COLORS[state.turn]}">${PLAYER_NAMES[state.turn]}</b>'s turn`;
  }

  ($('tk-undo') as HTMLButtonElement).disabled = historyStack.length === 0;
}

function render(): void {
  renderBoard();
  renderStatus();
}

// ---------------------------------------------------------------------------
// Interaction
// ---------------------------------------------------------------------------

function onSquareClick(evt: Event): void {
  if (state.outcome.kind !== 'ongoing') return;
  const target = evt.currentTarget as HTMLElement;
  const x = parseInt(target.dataset.x ?? '0', 10);
  const y = parseInt(target.dataset.y ?? '0', 10);
  const owner = state.board[x][y];

  // No selection yet: try to select a piece.
  if (selected === null) {
    if (owner !== state.turn) return;
    selected = { x, y };
    render();
    return;
  }

  // Same square: deselect.
  if (selected.x === x && selected.y === y) {
    selected = null;
    render();
    return;
  }

  // Another own piece: switch selection.
  if (owner === state.turn) {
    selected = { x, y };
    render();
    return;
  }

  // Otherwise: try to move from `selected` to (x,y).
  const move: Move = { fromX: selected.x, fromY: selected.y, toX: x, toY: y };
  try {
    const before = state;
    state = applyMove(state, state.turn, move);
    historyStack.push(before);
    selected = null;
    render();
  } catch (err) {
    if (err instanceof IllegalMoveError) {
      // Silent: just ignore illegal clicks. Could flash a hint.
      return;
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------

function bindButtons(): void {
  $('tk-new').addEventListener('click', () => {
    state = newGame([1, 2]);
    selected = null;
    historyStack.length = 0;
    render();
  });

  $('tk-undo').addEventListener('click', () => {
    const prev = historyStack.pop();
    if (prev) {
      state = prev;
      selected = null;
      render();
    }
  });
}

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

bindButtons();
render();
