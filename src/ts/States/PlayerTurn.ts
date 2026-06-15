// ============================================================================
// Tackticus — PlayerTurn client state
//
// Responsibilities:
//   - Show the active player which pieces can be moved + the squares they can
//     move to.
//   - On click: select a piece, then submit the move when a legal destination
//     is clicked.
// ============================================================================

import type { Game } from '../Game';

export class PlayerTurnClient {
  private selected: { x: number; y: number } | null = null;
  private legalMoves: LegalMove[] = [];

  constructor(private game: Game, private bga: any) {}

  onEnteringState(args: PlayerTurnArgs, isCurrentPlayerActive: boolean): void {
    this.legalMoves = args.legalMoves ?? [];
    this.selected = null;
    this.clearHighlights();

    if (!isCurrentPlayerActive) return;

    // Highlight all pieces that have at least one legal move.
    const movable = new Set<string>();
    for (const m of this.legalMoves) {
      movable.add(`${m.fromX}_${m.fromY}`);
    }
    movable.forEach((key) => {
      const [x, y] = key.split('_');
      const el = document.querySelector(`#piece_${x}_${y}`);
      if (el) el.classList.add('selectable');
    });
  }

  onLeavingState(): void {
    this.clearHighlights();
    this.selected = null;
  }

  /**
   * Called by Game.ts when any square is clicked while we're in PlayerTurn.
   */
  onSquareClick(x: number, y: number, ownerId: number | null): void {
    const myId = this.game.getCurrentPlayerId();

    // First click: must be on one of YOUR pieces that has a legal move.
    if (this.selected === null) {
      if (ownerId !== myId) return;
      if (!this.pieceHasLegalMove(x, y)) return;
      this.selected = { x, y };
      this.showDestinations(x, y);
      return;
    }

    // Second click on the same selected piece: deselect.
    if (this.selected.x === x && this.selected.y === y) {
      this.clearDestinations();
      this.selected = null;
      return;
    }

    // Second click on another own piece: switch selection.
    if (ownerId === myId && this.pieceHasLegalMove(x, y)) {
      this.clearDestinations();
      this.selected = { x, y };
      this.showDestinations(x, y);
      return;
    }

    // Second click on a legal destination: send the move.
    if (this.isLegalDestination(this.selected.x, this.selected.y, x, y)) {
      const move = { fromX: this.selected.x, fromY: this.selected.y, toX: x, toY: y };
      this.selected = null;
      this.clearDestinations();
      this.bga.actions.performAction('actMovePiece', move);
    }
  }

  private pieceHasLegalMove(x: number, y: number): boolean {
    return this.legalMoves.some((m) => m.fromX === x && m.fromY === y);
  }

  private isLegalDestination(fromX: number, fromY: number, toX: number, toY: number): boolean {
    return this.legalMoves.some(
      (m) => m.fromX === fromX && m.fromY === fromY && m.toX === toX && m.toY === toY
    );
  }

  private showDestinations(fromX: number, fromY: number): void {
    for (const m of this.legalMoves) {
      if (m.fromX === fromX && m.fromY === fromY) {
        const el = document.querySelector(`#square_${m.toX}_${m.toY}`);
        if (el) el.classList.add('legal-destination');
      }
    }
    const piece = document.querySelector(`#piece_${fromX}_${fromY}`);
    if (piece) piece.classList.add('selected');
  }

  private clearDestinations(): void {
    document.querySelectorAll('.legal-destination').forEach((el) =>
      el.classList.remove('legal-destination')
    );
    document.querySelectorAll('.piece.selected').forEach((el) =>
      el.classList.remove('selected')
    );
  }

  private clearHighlights(): void {
    this.clearDestinations();
    document.querySelectorAll('.piece.selectable').forEach((el) =>
      el.classList.remove('selectable')
    );
  }
}
