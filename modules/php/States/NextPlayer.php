<?php

declare(strict_types=1);

namespace Bga\Games\Tackticus\States;

use Bga\GameFramework\StateType;
use Bga\GameFramework\States\GameState;
use Bga\Games\Tackticus\Game;

/**
 * NextPlayer — pure server state that decides what happens after a move:
 *   1. End the game if the active player has just reached the capture threshold.
 *      (That's already handled by PlayerTurn returning 'gameEnd', so by the time
 *       we get here it usually means "advance the turn".)
 *   2. Pass the turn to the opponent.
 *   3. If the opponent has no legal moves, they lose (stalemate rule).
 */
class NextPlayer extends GameState
{
    private const ST_END_GAME = 99;

    public function __construct(protected Game $game)
    {
        parent::__construct(
            $game,
            id: 90,
            type: StateType::GAME,
            updateGameProgression: true,
        );
    }

    public function onEnteringState(): string
    {
        // Switch active player
        $nextPlayerId = (int) $this->game->activeNextPlayer();
        $this->game->giveExtraTime($nextPlayerId);

        // Stalemate? -> next player has no legal moves -> they lose
        $moves = $this->game->boardManager->getLegalMoves($nextPlayerId);
        if (empty($moves)) {
            // Score the opponent as winner and end the game
            $opponentId = (int) $this->game->getUniqueValueFromDb(
                "SELECT `player_id` FROM `player` WHERE `player_id` != $nextPlayerId LIMIT 1"
            );
            $this->game->DbQuery("UPDATE `player` SET `player_score` = 1 WHERE `player_id` = $opponentId");
            $this->game->DbQuery("UPDATE `player` SET `player_score` = 0 WHERE `player_id` = $nextPlayerId");

            $this->game->notifyAllPlayers(
                'stalemate',
                clienttranslate('${player_name} has no legal moves and loses.'),
                [
                    'player_id'   => $nextPlayerId,
                    'player_name' => $this->game->getPlayerNameById($nextPlayerId),
                ]
            );
            return 'endGame';
        }

        return 'nextTurn';
    }
}
