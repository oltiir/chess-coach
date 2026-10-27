# Adaptive coach — design

Date: 2026-10-28.
The player asked for faster progress: no time wasted on puzzles that are too easy, and no casual bot games. He handed the design to me: "you design it, act like a PhD professor".

## Diagnosis (data, not opinion)
Stockfish analysis of his last 40 rapid games (1,370 own moves):
- **Pieces hung: 1.05 per game.**
  - By piece: queen 12, knight 13, rook 9, bishop 8.
  - 17 of the 42 hangs happen in the first 12 moves.
- **Labelled mistakes:**

  | Type | Count |
  |---|---|
  | hung piece | 29 |
  | missed pin | 11 |
  | missed free piece | 8 |
  | missed mate | 5 |
  | allowed mate | 3 |
  | missed skewer | 1 |
  | missed fork | 1 |
  | other | 79 |

- **Clock used: 43% on average.** He leaves more than half his time unused.
- The problem is **threat detection and speed**: what can they take after my move? Attacking pattern recognition is secondary. Pins are the main tactical gap.

## Research basis
Research done by a Fable agent; sources are in the conversation.
- **Lichess** rates every puzzle attempt as a Glicko-2 game, and treats a visible theme as a hint.
- **Optimal training success is about 80–85%** (Wilson 2019; Math Garden samples items at p≈0.75).
- **Interleaving beats blocked practice** for telling confusable patterns apart (Kang & Pashler).
- **Pre-testing helps:** trying before being shown improves learning (Kornell).
- **Fading feedback helps:** frequent feedback inflates practice performance but hurts retention unless it is faded (the guidance hypothesis).
- **Chunk recognition is fast:** fluency, not just correctness, marks a learned pattern (Chase & Simon; Gobet).

## Rules (all my calls, from the research)
1. **Ratings.** Per-theme-group rating θ_g plus a global θ, using Glicko-1 (no volatility term).
   - Every first-try attempt is a game against the puzzle's Lichess rating (puzzle RD taken as 80). Score: solved first try = 1, else 0.
   - Player RD starts at 350; it is 150 after placement, with a floor of 50.
   - Every group the puzzle belongs to is updated, and so is the global rating.
2. **Difficulty.** A new puzzle's rating is drawn from [θ_g − 300, θ_g − 190], which gives an expected first-try success of 0.75–0.85.
   - The window widens in 100-point steps when it runs out of puzzles.
3. **Placement** happens on first use, and once for existing users: 16 puzzles with themes hidden.
   - **Stage A (8 puzzles):** mixed groups, each served at the current θ, starting at θ = 900. After each answer θ moves up or down by 200, 200, 150, 100, 75, 50, 50, 50.
   - **Stage B (8 puzzles):** one per group, served at θ − 150. A miss sets θ_g = θ − 150; a solve sets θ_g = θ + 50.
   - Finally RD = 150.
4. **Groups.** The puzzle set is rebuilt to 60k puzzles, rated 400–2000, across 8 groups:

   | Group | Lichess themes |
   |---|---|
   | Defence | `defensiveMove` |
   | Free pieces | `hangingPiece` |
   | Pins & skewers | `pin`, `skewer` |
   | Forks | `fork` |
   | Discovered attacks | `discoveredAttack`, `discoveredCheck` |
   | Mates | `mateIn1`, `mateIn2`, `backRankMate` |
   | Removing the defender | `deflection`, `attraction`, `capturingDefender` |
   | Trapped pieces | `trappedPiece` |

5. **Curriculum.** Open: nothing is locked, themes are hidden until after the answer, and the same group never comes twice in a row.
   - Group weight = 0.5·(share of his labelled mistakes in the last 20 analysed rapid games mapped to that group) + 0.3·weakness + 0.2·uniform, where weakness = clip((max θ − θ_g)/300, 0, 1).
   - **Label → group mapping:**

     | Mistake label | Group |
     |---|---|
     | hung-piece | Defence |
     | allowed-mate | Defence |
     | missed-free-piece | Free pieces |
     | missed-pin, missed-skewer | Pins & skewers |
     | missed-fork | Forks |
     | missed-mate | Mates |

   - Labels mapped to Defence also feed the two new drills (rule 7).
   - Before any games are analysed, use the measured profile above as the prior.
6. **Repetition with a speed gate.**
   - **Intervals:** missed items come back after 1, 3, 7 and 21 days.
   - **First try and fast** (time to first move ≤ 10 s): advance one interval.
   - **First try but slow:** repeat the same interval.
   - **Miss:** back to 1 day.
   - **Retire** after 2 consecutive fast first-try solves.
   - This replaces the old rule, and the 7/21-day steps are now reachable.
7. **Two new drills built for hanging pieces.** Both are generated from positions, with no engine needed:
   - **Threat scan.** Shows a position after the opponent's move, taken from his own games where available, otherwise from puzzle positions.
     - Task: "Tap every piece of yours they can win."
     - Answer: own pieces of value ≥ 3 where the opponent has a capture with net static-exchange gain ≥ 3, or "Nothing is loose".
     - Correct means the exact set.
   - **Safe or not?** Shows a position and one highlighted candidate move; the answer is yes or no, with a visible soft 8-second timer.
     - **Unsafe:** after the move, a piece worth ≥ 3 can be won (net static exchange ≥ 3, using the same trade rule as the analysis).
     - **Safe:** nothing can be won after the move.
     - Unsafe and safe positions are mixed 50/50. Answers are scored and their time logged.
     - It is a binary task, so it runs at 85%: when the last 10 answers are above 90% correct, the timer shrinks by 1 s (minimum 4 s).
8. **The daily session has 14 items, interleaved.**
   - **Mix:** up to 3 own-mistake drills, up to 3 due reviews, 1 Threat scan, 1 Safe-or-not block (5 quick answers counted as one item), 2 puzzles from the Defence group, and the rest new puzzles chosen by rule 5.
   - **Plan card** with one line of "why", computed from the data, e.g. "Most of your mistakes are pieces left loose (32 of the last 58), so today leans on defence and threat scans. You use 43% of your clock: slow down in real games."
9. **Training games** (Play):
   - **Default "Fix a mistake":** the game starts from the position before one of his own hangs, played to the end. The other mode is "Full game".
   - **Bot strength:** Maia at his rapid rating + 100 (minimum 600).
   - **Goal shown:** "No pieces hung, at most 1 alarm."
   - **Alarm stages,** stored and moved automatically:

     | Stage | What happens |
     |---|---|
     | 0 | Stop before the move |
     | 1 | Flag after: the move stands, the hung square is marked red, and the answer isn't shown |
     | 2 | Off |

     - **Up** a stage after 2 consecutive games with ≤ 1 alarm or flag and 0 hangs.
     - **Down** a stage after any game with ≥ 3 hangs.
   - **After the game:** he must try to find a better move for each key moment before the answer shows (retrieval before feedback). Those moments become drills.
10. **Progress:**
    - global puzzle rating, and a rating per group with ± uncertainty
    - pieces hung per game
    - repeat solve speed
    - clock used
    - no XP and no streaks

## Non-goals
- New puzzle sources beyond Lichess (CC0).
- An LLM coach.
- Changes to the crew layer.

## Constraints
- Offline. The puzzle file grows to about 2.2 MB compressed; the total download stays under 25 MB compressed.
- Existing attempts and drills are kept.
- Old attempts don't carry ratings; they still count for the spacing rules.
