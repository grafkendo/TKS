<?php

declare(strict_types=1);

/**
 * Tackticus — main server-side game class.
 *
 * Modern BGA framework (2024+). Most game logic lives in:
 *   - BoardManager (this file's sibling) — board state, moves, captures
 *   - States/*.php classes — finite state machine handlers
 *
 * This file is the entry point: it wires those together and implements
 * the framework hooks BGA expects (setupNewGame, getAllDatas, etc.).
 *
 * See: https://en.doc.boardgamearena.com/Main_game_logic:_Game.php
 */

namespace Bga\Games\Tackticus;

use Bga\Games\Tackticus\States\PlayerTurn;

require_once dirname(__DIR__, 2) . '/modules/php/BoardManager.php';

class Game extends \Table
{
    /** Board side length in squares. 6×6 = 36 squares. */
    public const BOARD_SIZE = 6;

    /** Default captures-to-win (overridable via the "100" game option). */
    public const DEFAULT_CAPTURES_TO_WIN = 4;

    public BoardManager $boardManager;

    public function __construct()
    {
        parent::__construct();

        // No globals are strictly needed in v0 (captures are derived from the
        // board), but reserving a slot here makes it easy to add later
        // (e.g. a "consecutive passes" counter for stalemate detection).
        $this->initGameStateLabels([
            // 'someLabel' => 10,
        ]);

        $this->boardManager = new BoardManager($this);
    }

    /**
     * Called once when a new game starts. Set up players, initial board, options.
     */
    protected function setupNewGame($players, $options = []): void
    {
        // ---- Player setup -----------------------------------------------------

        // Red is player 1, Blue is player 2. Override BGA's auto-color assignment
        // so colors match the design doc and the sprite sheet.
        $gameinfos = self::getGameinfos();
        $defaultColors = ['e94e3b', '3b6ee9']; // red, blue

        $sql = "INSERT INTO `player` (`player_id`, `player_color`, `player_canal`, `player_name`, `player_avatar`) VALUES ";
        $values = [];
        foreach ($players as $playerId => $player) {
            $color = array_shift($defaultColors);
            $values[] = sprintf(
                "('%s','%s','%s','%s','%s')",
                $playerId,
                $color,
                $player['player_canal'],
                addslashes($player['player_name']),
                addslashes($player['player_avatar'])
            );
        }
        self::DbQuery($sql . implode(',', $values));

        $this->reloadPlayersBasicInfos();

        // ---- Board setup ------------------------------------------------------

        $playerIds = array_keys($players);
        // By convention the first inserted player = "bottom" (row 2), second = "top" (row 5).
        $bottomPlayerId = (int) $playerIds[0];
        $topPlayerId    = (int) ($playerIds[1] ?? $playerIds[0]); // 1-player solo: same id (rare)

        $this->boardManager->initializeBoard(self::BOARD_SIZE, $bottomPlayerId, $topPlayerId);

        // ---- Stats init -------------------------------------------------------

        $this->initStat('table',  'turns_number',   0);
        $this->initStat('table',  'captures_total', 0);
        foreach ($playerIds as $playerId) {
            $this->initStat('player', 'moves_made',     0, (int) $playerId);
            $this->initStat('player', 'captures_made',  0, (int) $playerId);
            $this->initStat('player', 'pieces_lost',    0, (int) $playerId);
            $this->initStat('player', 'edge_moves',     0, (int) $playerId);
        }

        // ---- Activate first player & jump into the FSM ------------------------

        $this->activeNextPlayer();
    }

    /**
     * Returns the full client-visible game state on page load / reconnect.
     *
     * NOTE: this is sent to ALL spectators too — never include hidden info here.
     * In Tackticus there's no hidden information, so we just dump everything.
     */
    protected function getAllDatas(): array
    {
        $currentPlayerId = (int) self::getCurrentPlayerId();

        $players = self::getCollectionFromDb(
            "SELECT `player_id` `id`, `player_score` `score`, `player_color` `color`, `player_name` `name`
             FROM `player`"
        );

        return [
            'players'        => $players,
            'board'          => $this->boardManager->getOccupiedSquares(),
            'boardSize'      => self::BOARD_SIZE,
            'capturesToWin'  => $this->getCapturesToWin(),
            'captures'       => $this->boardManager->countCapturesByPlayer($players),
            'currentPlayer'  => $currentPlayerId,
        ];
    }

    /**
     * Numeric progression 0–100 shown in the BGA UI.
     * Crude heuristic: progress = (total captures / (capturesToWin * 2)) * 100.
     */
    public function getGameProgression(): int
    {
        $capturesToWin = $this->getCapturesToWin();
        $totalCaptures = (int) self::getUniqueValueFromDb(
            "SELECT SUM(stats_value) FROM stats WHERE stats_type = 11" // table-level stat #11
        );
        $progress = (int) round(($totalCaptures / max(1, $capturesToWin * 2)) * 100);
        return max(0, min(99, $progress));
    }

    // ------------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------------

    public function getCapturesToWin(): int
    {
        $opt = (int) self::getGameStateValue('captures_to_win_option') ?: 0;
        if ($opt > 0) {
            return $opt;
        }
        // Read from game options table directly (option id 100).
        $row = self::getNonEmptyObjectFromDB(
            "SELECT `value` FROM `global` WHERE `global_id` = 100"
        );
        $val = isset($row['value']) ? (int) $row['value'] : self::DEFAULT_CAPTURES_TO_WIN;
        return $val ?: self::DEFAULT_CAPTURES_TO_WIN;
    }

    /** Lookup a player's color (hex string) by id. */
    public function getPlayerColor(int $playerId): string
    {
        $row = self::getNonEmptyObjectFromDB(
            "SELECT `player_color` `color` FROM `player` WHERE `player_id` = $playerId"
        );
        return (string) $row['color'];
    }

    // ------------------------------------------------------------------------
    // Debug helpers (Studio-only — visible from the "Bug" menu)
    // ------------------------------------------------------------------------

    /**
     * Plays random legal moves until either someone wins or `$moves` total moves
     * have been made. Handy for stress-testing the FSM and animations.
     */
    public function debug_playAutomatically(int $moves = 50): void
    {
        if (!isset($this->bga)) {
            return;
        }
        $this->bga->debug->playUntil(fn (int $count) => $count >= $moves);
    }

    public function debug_dumpBoard(): array
    {
        return $this->boardManager->getOccupiedSquares();
    }
}
