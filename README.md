# mochess

Playable chess practice in React and TypeScript.

## Run

```sh
npm install
npm run dev
```

Open the local URL printed by Vite. Select **Play computer** to play White against a basic computer, or **Play a friend · same device** for two people sharing a board. Select a piece and then a highlighted destination. Choose Blitz, Rapid, or Classical in the lobby before starting a game. Clocks begin after White's first move.

Includes legal moves, check/checkmate, castling, en passant, a promotion picker, draw detection, clocks with increments, resignation, board flipping, move history, and PGN downloads. Use the arrow keys to navigate the board and Enter or Space to select a square.

Unfinished games save in browser storage after each move and periodically during play. Return to the lobby or refresh, then select **Resume game**. Clocks pause while away from the game screen; they continue while a game screen is open, including in a background tab. Starting a fresh game asks before replacing a saved game. Browser storage may be unavailable or cleared, so download PGN files for a lasting copy.

**My games** stores up to 50 completed games with step-by-step review and PGN export. The home page shows your actual results against the computer. **Puzzles** contains three interactive mate-in-one positions with saved completion progress; **Learn** provides four beginner lessons. **Settings** offers olive or walnut board colors, legal-move hints, and a preferred time control.

This is a free practice site. Remote multiplayer, real payments, account verification, and anti-cheat services are not connected. The old sample wallet, fabricated live activity, and placeholder features have been removed from the public interface. The existing backend directories remain separate from local gameplay.

## Verify

```sh
npm run build
npm test
```

Browser tests use installed Microsoft Edge via Playwright. Rules are provided by [chess.js](https://github.com/jhlywa/chess.js); the practice opponent uses a small two-ply search.

## Analysis

Open Analysis in the sidebar, or select Analyze this game from a saved game review. Paste PGN or FEN, step through moves, explore legal continuations, and export your analysis as PGN. The background worker provides a basic two-half-move evaluation and up to three suggested moves; it can miss deeper tactics. Scores favor White when positive and Black when negative. Exploring a continuation replaces the subsequent analysis moves without changing saved games. Analysis lines are temporary; download them before leaving the screen.
# chessmoney
