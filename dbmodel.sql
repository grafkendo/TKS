-- ============================================================================
-- Tackticus — Database schema
--
-- One row per board square (always BOARD_SIZE * BOARD_SIZE rows for a 6x6 = 36).
--   * board_owner = NULL  -> empty square
--   * board_owner = player_id -> occupied by that player's piece
--
-- A separate `game_state` table stores top-level scalars (captures, turn count)
-- so we don't have to recompute them on every page load.
-- ============================================================================

CREATE TABLE IF NOT EXISTS `board` (
  `board_x`      tinyint  unsigned NOT NULL,
  `board_y`      tinyint  unsigned NOT NULL,
  `board_owner`  int      unsigned DEFAULT NULL,
  PRIMARY KEY (`board_x`, `board_y`),
  KEY `idx_owner` (`board_owner`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


-- Move history: every legal piece move recorded for replay / undo / audit.
-- Use AUTO_INCREMENT id so we can order chronologically.
CREATE TABLE IF NOT EXISTS `move_log` (
  `move_id`        int       unsigned NOT NULL AUTO_INCREMENT,
  `player_id`      int       unsigned NOT NULL,
  `from_x`         tinyint   unsigned NOT NULL,
  `from_y`         tinyint   unsigned NOT NULL,
  `to_x`           tinyint   unsigned NOT NULL,
  `to_y`           tinyint   unsigned NOT NULL,
  `captures_count` tinyint   unsigned NOT NULL DEFAULT 0,
  `created_at`     timestamp          NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`move_id`),
  KEY `idx_player` (`player_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
