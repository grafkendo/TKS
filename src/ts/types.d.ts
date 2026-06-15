// ============================================================================
// Tackticus — Client-side type definitions
// ============================================================================

interface TackticusPlayer {
  id: number;
  name: string;
  color: string;
  score: number;
}

interface BoardSquareDTO {
  x: number;
  y: number;
  player: number | null;
}

interface LegalMove {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
}

interface CapturedPiece {
  x: number;
  y: number;
  player: number;
}

interface TackticusGamedatas {
  players: Record<number, TackticusPlayer>;
  board: BoardSquareDTO[];
  boardSize: number;
  capturesToWin: number;
  captures: Record<number, number>;
  currentPlayer: number;
}

// ----- State args -----------------------------------------------------------

interface PlayerTurnArgs {
  legalMoves: LegalMove[];
}

// ----- Notification args ----------------------------------------------------

interface NotifPieceMovedArgs {
  player_id: number;
  player_name: string;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
}

interface NotifPiecesCapturedArgs {
  player_id: number;
  player_name: string;
  count: number;
  captures: CapturedPiece[];
}

interface NotifStalemateArgs {
  player_id: number;
  player_name: string;
}
