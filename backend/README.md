# mochess API

Persistent NestJS backend for free, unrated chess. Includes accounts, revocable sessions, an online lobby, authoritative games and clocks, and private practice backups.

## Run

From the repository root:

```sh
npm install
npm --prefix backend install
npm run dev:all
```

Frontend: http://localhost:5173. API health: http://127.0.0.1:8787/api/health.

Use `npm run api:nest` for backend hot reload, or `npm run api` for a compiled server. Vite proxies /api to port 8787. Production must serve the frontend and /api from the same origin through an HTTPS reverse proxy. Do not expose Vite as a production server.

Configuration is read from environment variables; see [.env.example](.env.example). No .env is loaded automatically. After building, `node --env-file=.env dist/main.js` can load your own file from the backend directory.

| Variable | Default | Meaning |
| --- | --- | --- |
| API_PORT | 8787 | Listen port |
| API_HOST | 127.0.0.1 | Bind interface; use 0.0.0.0 only when deliberately exposing the server |
| DATABASE_PATH | data/mochess.sqlite in the process working directory | SQLite database file; scripts use backend as their working directory |
| WEB_ORIGIN | http://127.0.0.1:5173,http://localhost:5173 | Exact comma-separated browser origin allowlist |
| NODE_ENV | development | production requires explicit HTTPS origins and uses Secure cookies |

The installed environment was tested on Node 20.11.0; the Nest CLI dependencies request at least 20.11.1. Use a supported Node LTS version for deployment and reinstall dependencies for its native SQLite binding.

## Authentication and request security

Register or log in to receive a seven-day HttpOnly, SameSite=Strict session cookie scoped to /api. Production adds Secure. Passwords use salted asynchronous scrypt; only SHA-256 session token digests are stored. Logout revokes the session in the database. Each account retains at most 10 sessions. User IDs, including the former x-user-id header, never authenticate requests.

Send JSON with Content-Type: application/json. Browser requests with an unlisted Origin are rejected. The API limits JSON to 64 KiB, rejects unknown DTO fields, and returns generic login errors. Auth endpoints allow 20 requests/minute per connection IP; other endpoints allow 600. Rate limits are local to one process and reset on restart. Retry-After is returned with 429 responses. Forwarded IP headers are deliberately not trusted; put per-client limits at the reverse proxy for public deployments. Responses include X-Request-Id, no-store, and nosniff headers.

## API reference

Only health, registration and login are public. Protected resources derive their owner from the authenticated session.

| Method and route | Request / response |
| --- | --- |
| GET /api/health | Database-backed health check |
| POST /api/auth/register | {email, name, password}; returns {user} plus session cookie |
| POST /api/auth/login | {email, password}; returns {user} plus session cookie |
| GET /api/auth/me | {user} |
| POST /api/auth/logout | Revokes current session and clears cookie |
| GET /api/games | {mine, open}; latest 100 own games (unfinished first), latest 50 open games |
| POST /api/games | {timeControl: "Blitz" or "Rapid" or "Classical"}; creator plays White |
| GET /api/games/:id | {game}; participants only |
| POST /api/games/:id/heartbeat | Renews only the authenticated player's presence and returns {game}; send every 1.5 seconds while in the game |
| POST /api/games/:id/join | Claims Black atomically; cannot join your own game |
| POST /api/games/:id/moves | {from, to, version, promotion?}; promotion q/r/b/n |
| POST /api/games/:id/resign | {version}; participant resigns |
| POST /api/games/:id/cancel | {version}; cancel a waiting game |
| GET /api/profile/preferences | {preferences}; defaults if none saved |
| PUT /api/profile/preferences | {timeControl, board: "olive" or "walnut", hints: boolean} |
| GET /api/profile/saved-games | {games}; latest 100 private practice backups |
| PUT /api/profile/saved-games/:id | {pgn, mode: "computer" or "local", timeControl, w, b, result?}; clocks in milliseconds |
| DELETE /api/profile/saved-games/:id | Deletes only the caller's matching backup |

Registration: email <=254 characters, name 2–32 letters/numbers/spaces/underscore/dot/hyphen, password 10–128 characters. Email is normalized and names/emails are unique. Saved IDs allow 1–80 letters, numbers, hyphens or underscores. PGNs are parsed before saving; client-reported practice results are untrusted and do not change online results.

Games expose player IDs and names, status, PGN, FEN, turn, version, current clocks, increment, timestamps and result. They also expose `paused`, `presence.w/b` (connected and reconnectDeadline), and `winner` ("White", "Black", or null). Deadlines and serverTime are Unix milliseconds. Email addresses remain private. Move requests use the returned version; stale or repeated requests return 409 rather than applying a second move. Refresh state after conflicts. A command arriving after a timeout or abandonment returns the finished game. Rejoining an already-joined active game and repeating a terminal resignation/cancellation return current state.

Example move after receiving version 1:

```json
{"from":"e2","to":"e4","version":1}
```

## Game rules and persistence

SQLite foreign keys, unique constraints, FULL synchronous durability, rollback journaling and immediate transactions protect seat claims and game transitions. No client can set a position, clock, winner or opposing player. Schema version 3 is created automatically; version 1 is migrated transactionally with a fresh presence window for existing active games. Startup refuses a newer schema. Version 3 adds separate demo-credit wallets, stakes, transaction history and commission records. Existing accounts receive their one-time demo balance on first use. Future schema changes need explicit migrations.

Clocks: Blitz 5+3, Rapid 10+5, Classical 30+0. White's clock starts at join. Server time is authoritative. The browser sends heartbeats every 1.5 seconds while the game is open; after six seconds without a heartbeat the player is considered disconnected. Both clocks stop at that detection time, moves are blocked, and a full 50-second reconnect period starts. A heartbeat arriving strictly before the deadline cancels that player's countdown; play resumes once both players are present. At the deadline the opponent wins by abandonment, the game becomes finished, winner is "White" or "Black", and PGN records the result and termination reason. Late reconnects cannot change the outcome.

Presence is per account and game, so another open tab for the same game can keep the player connected. Read-only game/lobby requests do not renew presence. Leaving the game screen or signing out stops heartbeats too. If both disconnect, the first expired deadline loses; exactly simultaneous deadlines produce a mutual-abandonment draw. A normal chess timeout occurring before disconnection still takes precedence. Waiting and finished games have no reconnect countdown.

Persisted heartbeat timestamps retain deadlines across restarts; restarting the server does not grant extra reconnect time. A server-owned sweep checks active games every 500ms and settles deadlines without client requests. Browser updates can lag by the 1.5-second polling interval. The countdown uses server timestamps so changing a client's clock cannot change adjudication.

Full legal moves, castling, en passant and promotion use chess.js. Checkmate and draws are derived server-side. Casual rules automatically end games on threefold repetition and the fifty-move rule. On timeout, a bare-king opponent draws; otherwise the opponent wins. This does not implement every FIDE impossible-mate timeout position and is not a tournament adjudication system. There is no draw-offer protocol, rating, spectator feed or engine cheat detection.

Each account can have at most 10 unfinished games. Completed online games remain stored; the lobby shows a bounded recent list. Practice backups keep only the latest 100 per account. Account preferences are backed up explicitly; they are not automatically applied to the device.

Keep the SQLite database on a local persistent volume outside OneDrive or other file-sync/network folders for deployment. Use one API instance. Back up by stopping the API cleanly and copying the database file; test restore before relying on backups. Never commit databases or secrets. Scaling across hosts requires a shared transactional database and shared rate limiting.

## Verification

```sh
npm run test:api
npm run build
npm test
```

Run these from the root. API tests use temporary databases and exercise authentication, ownership, validation, concurrent requests, checkmate, timeout, persistence and request limits. Disconnect tests cover clock pausing, reconnecting at 49.999 seconds, both winning colors at the exact 50-second boundary, repeated/late events, automatic settlement without polling, and migration/restart persistence. Browser tests start an isolated in-memory API on 8787 and take one of two browser sessions offline to verify countdown, recovery, and an actual 50-second abandonment. Stop your local API first so tests can reserve that port. Microsoft Edge must be installed for the browser tests.

## Remaining deployment work

This is a working single-server backend, not a completed real-money platform. Public launch still needs hosting/TLS, operations monitoring, backup and restore procedures, account recovery and email verification, abuse controls, and workload testing. Payment/KYC providers, audited financial ledgers, settlement workflows and anti-cheat integration require a separate implementation.

The old wallet/wager/challenge/fair-play/news/live-match source folders are retained as inactive prototypes for reference. AppModule does not import them. Their old endpoints, including self-approved KYC and demo deposits, return 404. The old server/index.mjs entry delegates to this API after it has been built.

Implementation reference: [better-sqlite3 transactions and database API](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md).

