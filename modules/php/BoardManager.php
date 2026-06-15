<?php

declare(strict_types=1);

/**
 * Tackticus — Board manager (PHP port of src/core/rules.ts).
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  ⚠️  PORT NOTICE                                                          │
 * │                                                                          │
 * │  This is a manual port of the canonical TypeScript rules engine at       │
 * │      src/core/rules.ts                                                   │
 * │                                                                          │
 * │  When changing rules, ALWAYS:                                            │
 * │    1. Update src/core/rules.ts first.                                    │
 * │    2. Update src/core/rules.test.ts to cover the change.                 │
 * │    3. Update server/core.mjs (Node mirror).                              │
 * │    4. Update THIS file last.                                             │
 * │                                                                          │
 * │  Algorithms here MUST match TS exactly. Vitest is the source of truth    │
 * │  for behavior; if PHP disagrees, PHP is wrong.                           │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Responsibilities:
 *   - initialization (starting pieces on rows 2 and (size-1) of a 6×6 board)
 *   - move legality (1 square orthogonal into empty square)
 *   - flanking capture (after move, any enemy with two of mover's pieces
 *     on directly opposite orthogonal sides is captured)
 *
 * The class is intentionally framework-light: it takes a Game reference for
 * DB access but otherwise the algorithms are pure.
 */

namespace Bga\Games\Tackticus;

class BoardManager
{
    public function __construct(private Game $game)
    {
    }

    // ------------------------------------------------------------------------
    // Setup
    // ------------------------------------------------------------------------

    /**
     * Fill the `board` table with $boardSize² rows.
     *  - "Bottom" player gets row 2.
     *  - "Top"    player gets row ($boardSize - 1)  i.e. row 5 on a 6×6 board.
     *
     * Coordinates are 1-indexed to match BGA tutorial conventions.
     */
    public function initializeBoard(int $boardSize, int $bottomPlayerId, int $topPlayerId): void
    {
        $bottomRow = 2;
        $topRow    = $boardSize - 1;

        $values = [];
        for ($x = 1; $x <= $boardSize; $x++) {
            for ($y = 1; $y <= $boardSize; $y++) {
                $owner = 'NULL';
                if ($y === $bottomRow) {
                    $owner = (string) $bottomPlayerId;
                } elseif ($y === $topRow) {
                    $owner = (string) $topPlayerId;
                }
                $values[] = "($x,$y,$owner)";
            }
        }

        $sql = "INSERT INTO `board` (`board_x`, `board_y`, `board_owner`) VALUES " . implode(',', $values);
        $this->game->DbQuery($sql);
    }

    // ------------------------------------------------------------------------
    // Queries
    // ------------------------------------------------------------------------

    /**
     * Returns a 2D array indexed by [x][y] => owner_id|null  for the WHOLE board.
     * Loaded once per request so we don't pummel the DB during move validation.
     *
     * @return array<int, array<int, ?int>>
     */
    public function getBoard(): array
    {
        $rows = $this->game->getObjectListFromDB(
            "SELECT `board_x` `x`, `board_y` `y`, `board_owner` `owner` FROM `board`"
        );
        $board = [];
        foreach ($rows as $row) {
            $x = (int) $row['x'];
            $y = (int) $row['y'];
            $board[$x][$y] = $row['owner'] !== null ? (int) $row['owner'] : null;
        }
        return $board;
    }

    /**
     * Returns only the occupied squares (smaller payload for the client).
     * Shape: [ ['x' => 1, 'y' => 2, 'player' => 12345], ... ]
     */
    public function getOccupiedSquares(): array
    {
        return $this->game->getObjectListFromDB(
            "SELECT `board_x` `x`, `board_y` `y`, `board_owner` `player`
             FROM `board`
             WHERE `board_owner` IS NOT NULL"
        );
    }

    public function countPiecesForPlayer(int $playerId): int
    {
        return (int) $this->game->getUniqueValueFromDB(
            "SELECT COUNT(*) FROM `board` WHERE `board_owner` = $playerId"
        );
    }

    /**
     * Captures = (starting pieces) - (current pieces) for the OPPONENT.
     * For a 6x6 board the starting count is BOARD_SIZE (one row of pieces).
     *
     * @param array $players  collection from `player` table (keyed by id)
     * @return array<int,int>  playerId => captures made by that player
     */
    public function countCapturesByPlayer(array $players): array
    {
        $boardSize = \Bga\Games\Tackticus\Game::BOARD_SIZE;
        $result = [];
        $playerIds = array_keys($players);
        foreach ($playerIds as $playerId) {
            // captures THIS player has made = starting pieces of opponent minus opponent's current pieces
            $opponentId = $this->getOpponentId((int) $playerId, $playerIds);
            $opponentPieces = $opponentId !== null ? $this->countPiecesForPlayer($opponentId) : 0;
            $result[(int) $playerId] = $boardSize - $opponentPieces;
        }
        return $result;
    }

    private function getOpponentId(int $playerId, array $allIds): ?int
    {
        foreach ($allIds as $id) {
            if ((int) $id !== $playerId) {
                return (int) $id;
            }
        }
        return null;
    }

    // ------------------------------------------------------------------------
    // Move legality
    // ------------------------------------------------------------------------

    /**
     * @param array<int, array<int, ?int>> $board
     * @return array<int, array<int, true>>  legalMoves[fromKey][toKey] = true
     *         where keys are "x_y" strings — but we return a nested {x: {y: {tx: {ty: true}}}}
     *         For UI simplicity we return a flat list instead. See below.
     */
    public function getLegalMoves(int $playerId, ?array $board = null): array
    {
        $board ??= $this->getBoard();
        $size = \Bga\Games\Tackticus\Game::BOARD_SIZE;
        $moves = [];

        for ($x = 1; $x <= $size; $x++) {
            for ($y = 1; $y <= $size; $y++) {
                if (($board[$x][$y] ?? null) !== $playerId) {
                    continue;
                }
                foreach ([[1, 0], [-1, 0], [0, 1], [0, -1]] as [$dx, $dy]) {
                    $tx = $x + $dx;
                    $ty = $y + $dy;
                    if ($tx < 1 || $tx > $size || $ty < 1 || $ty > $size) {
                        continue;
                    }
                    if (($board[$tx][$ty] ?? null) === null) {
                        $moves[] = ['fromX' => $x, 'fromY' => $y, 'toX' => $tx, 'toY' => $ty];
                    }
                }
            }
        }
        return $moves;
    }

    public function isLegalMove(int $playerId, int $fromX, int $fromY, int $toX, int $toY, ?array $board = null): bool
    {
        $board ??= $this->getBoard();
        $size = \Bga\Games\Tackticus\Game::BOARD_SIZE;

        if ($fromX < 1 || $fromX > $size || $fromY < 1 || $fromY > $size) return false;
        if ($toX   < 1 || $toX   > $size || $toY   < 1 || $toY   > $size) return false;

        // Must move yours
        if (($board[$fromX][$fromY] ?? null) !== $playerId) return false;
        // Target must be empty
        if (($board[$toX][$toY] ?? null) !== null) return false;

        // Exactly 1 orthogonal step
        $dx = abs($toX - $fromX);
        $dy = abs($toY - $fromY);
        return ($dx === 1 && $dy === 0) || ($dx === 0 && $dy === 1);
    }

    // ------------------------------------------------------------------------
    // Move execution + flanking capture
    // ------------------------------------------------------------------------

    /**
     * Apply a move and resolve all flanking captures triggered by it.
     *
     * @return array{
     *   captures: array<int, array{x:int,y:int,player:int}>,
     *   board:    array<int, array<int, ?int>>
     * }  captures = list of captured squares (with previous owner); board = post-state
     */
    public function applyMove(int $playerId, int $fromX, int $fromY, int $toX, int $toY): array
    {
        // Persist the move
        $this->game->DbQuery(
            "UPDATE `board` SET `board_owner` = NULL  WHERE `board_x` = $fromX AND `board_y` = $fromY"
        );
        $this->game->DbQuery(
            "UPDATE `board` SET `board_owner` = $playerId WHERE `board_x` = $toX AND `board_y` = $toY"
        );

        // Reload fresh board state and find captures
        $board    = $this->getBoard();
        $captures = $this->findCapturesAround($playerId, $toX, $toY, $board);

        if (!empty($captures)) {
            $coords = [];
            foreach ($captures as $c) {
                $coords[] = "(`board_x` = {$c['x']} AND `board_y` = {$c['y']})";
            }
            $this->game->DbQuery(
                "UPDATE `board` SET `board_owner` = NULL WHERE " . implode(' OR ', $coords)
            );
            $board = $this->getBoard(); // refresh after captures
        }

        return ['captures' => $captures, 'board' => $board];
    }

    /**
     * Find enemy pieces FLANKED by the moving player after a move to ($toX,$toY).
     *
     * An enemy at (ex,ey) is captured iff:
     *   - Some line through (ex,ey) (horizontal OR vertical)
     *   - Has player's piece at one orthogonal neighbor AND another at the opposite neighbor.
     *
     * We only need to check the 4 neighbors of the moved-to square: those are the
     * only squares whose flank status could have changed from this single move.
     *
     * @return array<int, array{x:int,y:int,player:int}>
     */
    public function findCapturesAround(int $playerId, int $toX, int $toY, array $board): array
    {
        $size = \Bga\Games\Tackticus\Game::BOARD_SIZE;
        $captures = [];

        foreach ([[1, 0], [-1, 0], [0, 1], [0, -1]] as [$dx, $dy]) {
            $ex = $toX + $dx;
            $ey = $toY + $dy;
            if ($ex < 1 || $ex > $size || $ey < 1 || $ey > $size) continue;

            $enemyOwner = $board[$ex][$ey] ?? null;
            if ($enemyOwner === null || $enemyOwner === $playerId) continue;

            // Check the opposite side of the enemy along the same axis.
            $ox = $ex + $dx;
            $oy = $ey + $dy;
            if ($ox < 1 || $ox > $size || $oy < 1 || $oy > $size) continue;

            if (($board[$ox][$oy] ?? null) === $playerId) {
                $captures[] = ['x' => $ex, 'y' => $ey, 'player' => $enemyOwner];
            }
        }
        return $captures;
    }
}
