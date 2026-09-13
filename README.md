# mochess

Playable chess practice in React and TypeScript.

## Run

```sh
npm install
npm run dev
```

Open the local URL printed by Vite. Select **Play computer** to play White against Stockfish on Hard, or **Play a friend · same device** for two people sharing a board. Select a piece and then a highlighted destination. Choose Blitz, Rapid, or Classical in the lobby before starting a game. Clocks begin after White's first move.

## Accounts and online play

To start the frontend and the persistent API together, run:

```sh
npm install
npm --prefix backend install
npm run dev:all
```

Open http://localhost:5173 and select **Online**. Create two accounts in separate browser profiles (or an incognito window), create a game with one, and join with the other. Online clocks start when Black joins. If a player disconnects, clocks pause and a 50-second reconnect countdown begins. Returning before the deadline resumes play; otherwise the opponent wins by abandonment. Keep the game open: leaving the game screen also stops its heartbeats. The server detects a lost connection after six seconds without a heartbeat. Online games automatically persist; sign in again and open them from **Your online games**. **Back up this device** explicitly copies completed local practice games and preferences into your account. Download backed-up PGNs from any signed-in browser.

For separate terminals, use `npm run api:nest` and `npm run dev`. Both `npm run api` and `npm run api:nest` now run the same NestJS API. The combined command builds the API at startup; use `api:nest` for backend hot reload. See [backend setup and API reference](backend/README.md) for configuration, storage, tests, and deployment limits.

## YouTube competition videos

The Puzzles page can show recent chess-competition videos from YouTube. Copy `.env.example` to a private environment configuration or set `YOUTUBE_API_KEY` in the shell that starts the API; never commit the key. In PowerShell:

```powershell
$env:YOUTUBE_API_KEY = 'your-restricted-youtube-api-key'
npm run dev:all
```

Restrict the key in Google Cloud to the YouTube Data API v3 and to the server's environment. The browser calls the local API endpoint, so the key is not exposed in client-side JavaScript.

Includes legal moves, check/checkmate, castling, en passant, a promotion picker, draw detection, clocks with increments, resignation, board flipping, move history, and PGN downloads. Use the arrow keys to navigate the board and Enter or Space to select a square.

Unfinished games save in browser storage after each move and periodically during play. Return to the lobby or refresh, then select **Resume game**. Clocks pause while away from the game screen; they continue while a game screen is open, including in a background tab. Starting a fresh game asks before replacing a saved game. Browser storage may be unavailable or cleared, so download PGN files for a lasting copy.

**My games** stores up to 50 completed games with step-by-step review and PGN export. The home page shows your actual results against the computer. **Puzzles** contains four multi-move tactical combinations with automatic defensive replies and saved completion progress; **Learn** provides four beginner lessons. **Settings** offers olive or walnut board colors, legal-move hints, and a preferred time control.

This is a free chess site with local practice and authenticated, unrated online multiplayer. Real payments, identity verification, and anti-cheat services are not connected. The old demo wallet, betting, news, and self-verification modules are not mounted in the API.

## Verify

```sh
npm run build
npm run test:api
npm test
```

Browser tests use installed Microsoft Edge via Playwright. Rules are provided by [chess.js](https://github.com/jhlywa/chess.js); the practice opponent uses Stockfish 18 at full skill in a browser worker, calculating for up to 2.5 seconds per move (less when its clock is low).

## Analysis

Open Analysis in the sidebar, or select Analyze this game from a saved game review. Paste PGN or FEN, step through moves, explore legal continuations, and export your analysis as PGN. The background worker provides a basic two-half-move evaluation and up to three suggested moves; it can miss deeper tactics. Scores favor White when positive and Black when negative. Exploring a continuation replaces the subsequent analysis moves without changing saved games. Analysis lines are temporary; download them before leaving the screen.
# chessmoney

## Demo stake matchmaking

In Online, sign in and choose **Play for demo stakes**. Each account receives a one-time $100 demo balance. Stakes use integer demo cents ($1�$100 in $0.20 increments so 5% is exact). Players are automatically paired by equal stake and time control, with one unfinished staked game per account. Stakes are reserved atomically when entering the queue. Keep the game screen open; an unattended search expires after 60 seconds and refunds its stake.

For two $10 stakes, commission is $0.50 per player and the winner receives $19. Checkmate, resignation, timeout and abandonment settle automatically. Draws and cancelled searches refund the full stake without commission. Balances, transaction history and commission records persist in SQLite; repeated requests cannot pay twice. Demo credits have no cash value and cannot be deposited or withdrawn. Real-money payment integration is not implemented.

Authenticated endpoints: `GET /api/games/demo-wallet` returns the private balance and latest 30 ledger entries; `POST /api/games/match` accepts `{stakeCents: 1000, timeControl: "Blitz"}` and returns the queued or paired game. Existing game heartbeat and cancellation endpoints maintain/cancel searches. Staked games cannot be joined through the free-game join endpoint. Schema version 3 adds separate demo wallet, stake, ledger and commission tables.

## Strong computer and harder puzzles

The computer uses the single-threaded lite WebAssembly build of Stockfish.js 18.0.8, Skill Level 20 with strength limiting disabled. This is a strong opponent, not an assigned or guaranteed Elo rating. Calculation runs in a worker, preserving responsive controls and clocks. Resetting or leaving cancels the worker; engine errors pause clocks and offer a retry. The separate Analysis screen retains its basic evaluation.

`npm install`, `npm run dev`, `npm run dev:all`, and `npm run build` prepare the approximately 7 MB engine assets under `public/engine`. These generated files are excluded from Git and copied to the production build. The engine is unmodified GPL-3.0 software; its license and exact source link ship as `/engine/COPYING.txt` and `/engine/SOURCE.txt`. Upstream source and build instructions: https://github.com/nmrugg/stockfish.js/tree/93c994592dcf3b4b21052ab925e9b534df9c0918.

Hard puzzles include smothered mates for both colors, Anastasia's mating pattern, and the Opera Game's final queen sacrifice. All require a full two- or three-move combination. Legal but incorrect moves leave the current position unchanged; correct moves trigger an automatic reply. Progress uses a separate key so beginner puzzle completions do not mark the hard puzzles solved. Run `node scripts/check-puzzles.cjs` to validate the legal solutions and Stockfish mate distances.
## Automatic post-game review

Completed computer, same-device and online games automatically start a Stockfish review in the result panel. Review progress is shown while each position is evaluated (about 250 ms of search per position, plus loading). Reports highlight inaccuracies, mistakes and blunders for both colors, suggest a stronger move, and offer a board to compare the played move with up to eight half-moves of the recommended continuation. Open full analysis loads the game directly; archived games also receive the report when opened through Analyze this game. No engine advice is exposed in ongoing online games.

This is a quick educational estimate, not a definitive move-quality or Elo assessment. Labels use the evaluation drop from the mover's perspective: 0.5 pawns for an inaccuracy, 1 for a mistake, and 2 for a blunder. Evaluation extremes are capped for classification so changes in already decisive positions do not overwhelm the report. Mate threats get specific feedback. Resignation, clock and disconnect results are kept separate from board evaluation. Reports for up to ten games are cached in memory; leaving cancels an unfinished review, and errors offer a retry. Saved games are never changed by exploring recommendations.

## Reopen saved games without downloading

Completed practice games are automatically kept in **My games** on this device (latest 50). Use a game's **Analyze** button or the **Saved game** picker in Analysis to reopen it directly. Analysis remembers the last game selected across page reloads, or defaults to the most recent local game if none was selected. PGN downloads remain optional. Online games are saved in the account and have an **Analyze** button in the online history; existing practice backups also open directly for analysis. Browser storage must be available for device history and the last analysis selection to persist.

## Take back a practice move

Use **Take back** during computer or same-device games. Against the computer, it cancels any pending search and undoes your move plus the computer's reply, returning the turn to you. Same-device games undo one move. Captures, castling rights, promotion and en passant state are restored by the chess rules library, and the shortened game is saved immediately. Undoing all moves clears the unfinished save. Time spent is retained and increments awarded for undone moves are removed. Finished games cannot be taken back. Online games do not allow unilateral takebacks.
