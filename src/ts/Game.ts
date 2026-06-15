// ============================================================================
// Tackticus — Client entry point
//
// Built to modules/js/Game.js by rollup (see rollup.config.mjs).
// BGA loads modules/js/Game.js automatically when the page opens.
// ============================================================================

import { PlayerTurnClient } from './States/PlayerTurn';

// The BGA framework provides this globally on the page. We type as `any` here
// to avoid pulling the entire BGA types package; once the type-safe template
// is installed (via `npm run init` against bga-ts-template), this can be
// replaced with the proper `Bga<...>` generic.
declare const define: any;
declare const ebg: any;

const SQUARE_SIZE_PX = 80;
const BOARD_PADDING_PX = 12;

export class Game {
  public gamedatas!: TackticusGamedatas;
  public animationManager: any;

  private bga: any;
  private playerTurn!: PlayerTurnClient;

  constructor() {
    // The framework constructs us — no-op.
  }

  // --------------------------------------------------------------------------
  // BGA lifecycle: setup(gamedatas)
  // --------------------------------------------------------------------------
  public setup(gamedatas: TackticusGamedatas): void {
    this.gamedatas = gamedatas;
    this.bga = (this as any).bga; // injected by framework

    this.renderBoard();
    this.renderInitialPieces();

    this.playerTurn = new PlayerTurnClient(this, this.bga);
    this.bga.states.register('PlayerTurn', this.playerTurn);

    // Animations
    if (typeof (window as any).BgaAnimations !== 'undefined') {
      this.animationManager = new (window as any).BgaAnimations.Manager({
        animationsActive: () => this.bga.gameui.bgaAnimationsActive(),
      });
    }

    this.setupNotifications();
  }

  // --------------------------------------------------------------------------
  // Board rendering
  // --------------------------------------------------------------------------
  private renderBoard(): void {
    const size = this.gamedatas.boardSize;
    const px = size * SQUARE_SIZE_PX + BOARD_PADDING_PX * 2;

    const html = `
      <div id="tk-board" class="tk-board"
           style="width:${px}px;height:${px}px;
                  --tk-square-size:${SQUARE_SIZE_PX}px;
                  --tk-board-padding:${BOARD_PADDING_PX}px;">
        ${this.renderSquares(size)}
      </div>
    `;

    this.bga.gameArea.getElement().insertAdjacentHTML('beforeend', html);

    // Wire click handlers
    document.querySelectorAll('.tk-square').forEach((sq) => {
      sq.addEventListener('click', (e) => this.onSquareClick(e as MouseEvent));
    });
  }

  private renderSquares(size: number): string {
    const out: string[] = [];
    for (let x = 1; x <= size; x++) {
      for (let y = 1; y <= size; y++) {
        // Visually we want y=1 at the bottom (player 1 side).
        const left = BOARD_PADDING_PX + (x - 1) * SQUARE_SIZE_PX;
        const top = BOARD_PADDING_PX + (size - y) * SQUARE_SIZE_PX;
        const shade = (x + y) % 2 === 0 ? 'tk-light' : 'tk-dark';
        out.push(`
          <div id="square_${x}_${y}"
               class="tk-square ${shade}"
               data-x="${x}" data-y="${y}"
               style="left:${left}px;top:${top}px;"></div>
        `);
      }
    }
    return out.join('');
  }

  private renderInitialPieces(): void {
    for (const sq of this.gamedatas.board) {
      if (sq.player !== null) {
        this.placePiece(sq.x, sq.y, sq.player, false);
      }
    }
  }

  // --------------------------------------------------------------------------
  // Piece helpers
  // --------------------------------------------------------------------------
  public placePiece(x: number, y: number, ownerId: number, animate = true): void {
    const square = document.querySelector(`#square_${x}_${y}`);
    if (!square) return;

    const color = this.gamedatas.players[ownerId]?.color ?? 'cccccc';
    const id = `piece_${x}_${y}`;
    square.insertAdjacentHTML(
      'beforeend',
      `<div id="${id}" class="tk-piece piece" data-owner="${ownerId}" style="background-color:#${color};"></div>`
    );

    if (animate && this.animationManager) {
      const el = document.getElementById(id);
      const panel = document.getElementById(`overall_player_board_${ownerId}`);
      if (el && panel) {
        this.animationManager.fadeIn(el, panel);
      }
    }
  }

  private movePieceElement(fromX: number, fromY: number, toX: number, toY: number): Promise<void> {
    const piece = document.querySelector(`#piece_${fromX}_${fromY}`);
    const toSquare = document.querySelector(`#square_${toX}_${toY}`);
    if (!piece || !toSquare) return Promise.resolve();

    piece.id = `piece_${toX}_${toY}`;

    if (this.animationManager) {
      return this.animationManager.slideAndAttach(piece, toSquare, { duration: 350 });
    } else {
      toSquare.appendChild(piece);
      return Promise.resolve();
    }
  }

  private removePieceElement(x: number, y: number): Promise<void> {
    const piece = document.querySelector(`#piece_${x}_${y}`);
    if (!piece) return Promise.resolve();
    piece.classList.add('captured');
    return new Promise((resolve) =>
      setTimeout(() => {
        piece.remove();
        resolve();
      }, 400)
    );
  }

  // --------------------------------------------------------------------------
  // Click router — delegates to whichever state is active
  // --------------------------------------------------------------------------
  private onSquareClick(evt: MouseEvent): void {
    evt.preventDefault();
    evt.stopPropagation();
    const target = evt.currentTarget as HTMLElement;
    const x = parseInt(target.dataset.x ?? '0', 10);
    const y = parseInt(target.dataset.y ?? '0', 10);
    const piece = target.querySelector('.tk-piece') as HTMLElement | null;
    const ownerId = piece ? parseInt(piece.dataset.owner ?? '0', 10) : null;

    const currentState = this.bga.gameui.getCurrentStateName?.();
    if (currentState === 'PlayerTurn') {
      this.playerTurn.onSquareClick(x, y, ownerId);
    }
  }

  public getCurrentPlayerId(): number {
    return this.bga.players.getCurrentPlayerId();
  }

  // --------------------------------------------------------------------------
  // Notifications
  // --------------------------------------------------------------------------
  private setupNotifications(): void {
    this.bga.notifications.setupPromiseNotifications();
  }

  public async notif_pieceMoved(args: NotifPieceMovedArgs): Promise<void> {
    await this.movePieceElement(args.fromX, args.fromY, args.toX, args.toY);
  }

  public async notif_piecesCaptured(args: NotifPiecesCapturedArgs): Promise<void> {
    await Promise.all(args.captures.map((c) => this.removePieceElement(c.x, c.y)));
  }

  public notif_stalemate(_args: NotifStalemateArgs): void {
    // No board change; the framework will end the game shortly.
  }
}

// BGA expects a `tackticus` global on window — this define() call registers it
// when running under BGA's dojo-compatible loader.
if (typeof define === 'function') {
  define(['dojo', 'dojo/_base/declare'], (dojo: any, declare: any) => {
    return declare('bgagame.tackticus', (ebg as any).core.gamegui, new Game());
  });
}
