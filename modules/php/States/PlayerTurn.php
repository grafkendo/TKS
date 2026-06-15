<?php

declare(strict_types=1);

namespace Bga\Games\Tackticus\States;

use Bga\GameFramework\StateType;
use Bga\GameFramework\States\GameState;
use Bga\GameFramework\States\PossibleAction;
use Bga\Games\Tackticus\Game;

/**
 * PlayerTurn — the only state the active player can act in.
 *
 * Args sent to client:
 *   - legalMoves: list of {fromX,fromY,toX,toY} the active player may play
 */
class PlayerTurn extends GameState
{
    public function __construct(protected Game $game)
    {
        parent::__construct(
            $game,
            id: 10,
            type: StateType::ACTIVE_PLAYER,
        );
    }

    public function getArgs(int $activePlayerId): array
    {
        return [
            'legalMoves' => $this->game->boardManager->getLegalMoves($activePlayerId),
        ];
    }

    /**
     * Active player attempts to move a piece.
     * Autowired by BGA: ($x, $y, $activePlayerId) come from the JS action call.
     *
     * The PossibleAction attribute makes BGA enforce that this can only be
     * called when this state is active.
     */
    #[PossibleAction]
    public function actMovePiece(int $fromX, int $fromY, int $toX, int $toY, int $activePlayerId): string
    {
        $board = $this->game->boardManager->getBoard();

        if (!$this->game->boardManager->isLegalMove($activePlayerId, $fromX, $fromY, $toX, $toY, $board)) {
            throw new \BgaUserException(self::_('That move is not legal.'));
        }

        $result = $this->game->boardManager->applyMove($activePlayerId, $fromX, $fromY, $toX, $toY);

        // -------- Stats ------------------------------------------------------
        $this->game->incStat(1, 'moves_made', $activePlayerId);
        $this->game->incStat(1, 'turns_number');

        $boardSize = Game::BOARD_SIZE;
        if ($fromX === 1 || $fromX === $boardSize || $fromY === 1 || $fromY === $boardSize ||
            $toX   === 1 || $toX   === $boardSize || $toY   === 1 || $toY   === $boardSize) {
            $this->game->incStat(1, 'edge_moves', $activePlayerId);
        }

        $captureCount = count($result['captures']);
        if ($captureCount > 0) {
            $this->game->incStat($captureCount, 'captures_made',   $activePlayerId);
            $this->game->incStat($captureCount, 'captures_total');
            foreach ($result['captures'] as $c) {
                $this->game->incStat(1, 'pieces_lost', (int) $c['player']);
            }
        }

        // -------- Notifications ---------------------------------------------
        $this->game->notifyAllPlayers('pieceMoved', clienttranslate('${player_name} moves a piece'), [
            'player_id'   => $activePlayerId,
            'player_name' => $this->game->getActivePlayerName(),
            'fromX'       => $fromX,
            'fromY'       => $fromY,
            'toX'         => $toX,
            'toY'         => $toY,
        ]);

        if ($captureCount > 0) {
            $this->game->notifyAllPlayers(
                'piecesCaptured',
                clienttranslate('${player_name} flanks and captures ${count} piece(s)'),
                [
                    'player_id'   => $activePlayerId,
                    'player_name' => $this->game->getActivePlayerName(),
                    'count'       => $captureCount,
                    'captures'    => $result['captures'],
                ]
            );
        }

        // -------- Win check --------------------------------------------------
        $capturesToWin = $this->game->getCapturesToWin();
        $opponentId = $this->getOpponentId($activePlayerId);
        $opponentLeft = $opponentId !== null
            ? $this->game->boardManager->countPiecesForPlayer($opponentId)
            : 0;

        $boardStart = Game::BOARD_SIZE;
        $capturesByActive = $boardStart - $opponentLeft;
        if ($capturesByActive >= $capturesToWin) {
            return 'gameEnd';
        }

        return 'moveComplete';
    }

    public function zombie(int $playerId): void
    {
        // Zombie level 1: random legal move.
        $moves = $this->game->boardManager->getLegalMoves($playerId);
        if (empty($moves)) {
            // No legal move = active player loses on next-player check.
            return;
        }
        $pick = $moves[array_rand($moves)];
        $this->actMovePiece(
            (int) $pick['fromX'],
            (int) $pick['fromY'],
            (int) $pick['toX'],
            (int) $pick['toY'],
            $playerId
        );
    }

    private function getOpponentId(int $playerId): ?int
    {
        $row = $this->game->getNonEmptyObjectFromDB(
            "SELECT `player_id` FROM `player` WHERE `player_id` != $playerId LIMIT 1"
        );
        return isset($row['player_id']) ? (int) $row['player_id'] : null;
    }
}
