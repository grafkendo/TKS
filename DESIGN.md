# Tackticus — Game Design (v0 draft)

> This is a **starting-point** design. Treat it as a strawman to argue with.
> Every rule below is negotiable — adjust freely as the prototype reveals what's fun.

## Pitch (one line)

A small, sharp 2-player tactical abstract where every move risks getting flanked.

## Theme

Light Roman-tactics flavor (the name is a riff on *tactics* + Roman cognomen "-icus").
The art can lean into Roman legion iconography, but theme is purely cosmetic — rules are abstract.

## Players

- **2 players**, alternating turns
- No simultaneous moves, no hidden information, no randomness — pure abstract strategy

## Components

- **Board:** 6×6 grid (36 squares). Small enough that every move matters; large enough for maneuver.
- **Pieces:** 6 per player (12 total). One color per player (e.g., red vs. blue). All pieces identical — no piece types in v0.

## Setup

```
. . . . . .       (row 6)
B B B B B B       (row 5)  <- Blue starts here
. . . . . .       (row 4)
. . . . . .       (row 3)
R R R R R R       (row 2)  <- Red starts here
. . . . . .       (row 1)
```

- Each player's 6 pieces start on a single row, 1 square in from their edge.
- Red moves first.

## Turn

On your turn, do **one** action:

1. **Move:** Slide one of your pieces exactly 1 square orthogonally (up/down/left/right) into an empty square. No diagonals. No moving onto an occupied square.

That's it. One move per turn. Capture is automatic.

## Capture (the core mechanic)

After your move resolves, check every enemy piece on the board:

- If an enemy piece is **flanked** — meaning there are two of YOUR pieces on directly opposite orthogonal sides of it (left+right OR up+down) — that enemy piece is **captured** (removed from the board).
- Multiple captures can happen from a single move.
- Captures are **passive**: you cannot capture a piece by moving it into a sandwich (no suicide-flanks). Captures only happen *to* a piece when an enemy completes the flank around it.
- Diagonal flanks do **not** capture.

### Worked example

Before your move:
```
. R . .
. . . .
. B . .
. . . .
. R . .
```

You move the top R down one square:
```
. . . .
. R . .
. B . .   <- B is now flanked vertically (R above, R below)
. . . .
. R . .
```

The B is captured and removed:
```
. . . .
. R . .
. . . .
. . . .
. R . .
```

## Win Condition

**First player to capture 4 enemy pieces wins.**
(Reduces opponent from 6 to 2, which is small enough to feel decisive without dragging.)

Tiebreakers / edge cases:
- **Stalemate** (a player has no legal moves): they immediately lose.
- **Both at 3 captures** simultaneously: shouldn't be possible since only one player moves per turn, but if a single move causes both to reach 4 (impossible in v0 ruleset because only you can capture on your turn), the active player wins.

## Why this design works for a 10% project

| Property | Why it matters |
|---|---|
| Tiny rule set (1 movement type, 1 capture mechanic) | Implementable in a few weekends |
| No hidden info, no random | No deck/dice/shuffle code; pure deterministic game state |
| Small board (36 squares, 12 pieces) | Server-side move validation is fast and trivial |
| Symmetric & 2-player only | No per-player-count branching, no asymmetry bugs |
| Capture happens *to* you, not *by* you | Forces planning ahead — natural tactical depth |
| Familiar look (grid + colored discs) | Asset budget is one sprite sheet (red disc, blue disc) |

## Possible Expansions (DO NOT BUILD UNTIL v0 SHIPS)

These are tempting but defer them:

- **Variable starting positions** (player-chosen deployment)
- **Piece types** (e.g., a "general" that can't be flanked, "cavalry" that moves 2)
- **Larger boards** (8×8 with 8 pieces each)
- **Push capture** (flanked piece is pushed away instead of removed)
- **Asymmetric factions**
- **Time-limited turns**

## Open questions for the designer (you)

- [ ] Is **6×6 with 6 pieces** the right size? Could be 5×5/4 or 7×7/7.
- [ ] Is **first to 4 captures** the right win condition vs. "eliminate all" or "reduce to 1"?
- [ ] Should there be a **"pass" action** when no captures are available, or do we force a move?
- [ ] Should we add a **"protected" rule** — a piece against the board edge can't be flanked from that side because there's no opposite square? (Currently: yes, edge pieces are partially safe. This is probably good — it means corners are valuable.)
- [ ] Visual: **discs vs. tokens vs. legion icons**?
