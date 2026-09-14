import { Injectable, OnModuleDestroy } from '@nestjs/common'
import Database = require('better-sqlite3')
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

@Injectable()
export class Store implements OnModuleDestroy {
  readonly db: Database.Database
  constructor() {
    const path = process.env.DATABASE_PATH ?? resolve(process.cwd(), 'data', 'mochess.sqlite')
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
    this.db = new Database(path)
    this.db.pragma('foreign_keys = ON')
    this.db.pragma('busy_timeout = 5000')
    this.db.pragma('journal_mode = DELETE')
    this.db.pragma('synchronous = FULL')
    const version = this.db.pragma('user_version', { simple: true }) as number
    if (version > 8) { this.db.close(); throw new Error('Database schema is newer than this API supports') }
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE COLLATE NOCASE,
        name TEXT NOT NULL UNIQUE COLLATE NOCASE, password_hash TEXT NOT NULL, created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS sessions (
        hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
      CREATE TABLE IF NOT EXISTS preferences (
        user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, data TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS games (
        id TEXT PRIMARY KEY, white_id TEXT NOT NULL REFERENCES users(id), black_id TEXT REFERENCES users(id),
        status TEXT NOT NULL CHECK(status IN ('waiting','active','finished','cancelled')),
        pgn TEXT NOT NULL DEFAULT '', result TEXT, version INTEGER NOT NULL DEFAULT 0,
        clock_white INTEGER NOT NULL, clock_black INTEGER NOT NULL, increment_ms INTEGER NOT NULL,
        last_move_at INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS games_white ON games(white_id, updated_at);
      CREATE INDEX IF NOT EXISTS games_black ON games(black_id, updated_at);
      CREATE INDEX IF NOT EXISTS games_status ON games(status, updated_at);
      CREATE TABLE IF NOT EXISTS saved_games (
        id TEXT NOT NULL, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        data TEXT NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY(user_id, id)
      );
    `)
    if (version < 2) this.db.transaction(() => {
      this.db.exec('ALTER TABLE games ADD COLUMN white_seen_at INTEGER; ALTER TABLE games ADD COLUMN black_seen_at INTEGER;')
      // Existing active games get a fresh presence window when this feature is installed.
      this.db.prepare("UPDATE games SET white_seen_at=?,black_seen_at=? WHERE status='active'").run(Date.now(), Date.now())
      this.db.pragma('user_version = 2')
    }).immediate()
    if (version < 3) this.db.transaction(() => {
      this.db.exec(`
        CREATE TABLE demo_wallets (user_id TEXT PRIMARY KEY REFERENCES users(id), balance INTEGER NOT NULL CHECK(balance >= 0));
        CREATE TABLE demo_stakes (game_id TEXT PRIMARY KEY REFERENCES games(id), amount INTEGER NOT NULL CHECK(amount > 0), settled INTEGER NOT NULL DEFAULT 0);
        CREATE TABLE demo_ledger (id INTEGER PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), game_id TEXT REFERENCES games(id), kind TEXT NOT NULL, amount INTEGER NOT NULL, created_at INTEGER NOT NULL);
        CREATE TABLE demo_commissions (game_id TEXT PRIMARY KEY REFERENCES games(id), amount INTEGER NOT NULL CHECK(amount >= 0));
      `)
      this.db.pragma('user_version = 3')
    }).immediate()
    if (version < 4) this.db.transaction(() => {
      this.db.exec(`CREATE TABLE game_messages (
        id INTEGER PRIMARY KEY, game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id), text TEXT NOT NULL, created_at INTEGER NOT NULL
      ); CREATE INDEX game_messages_game ON game_messages(game_id,id);`)
      this.db.pragma('user_version = 4')
    }).immediate()
    if (version < 5) this.db.transaction(() => {
      this.db.exec(`CREATE TABLE game_viewers (
        game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        seen_at INTEGER NOT NULL, PRIMARY KEY(game_id,user_id)
      ); CREATE TABLE spectator_comments (
        id INTEGER PRIMARY KEY, game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id), text TEXT NOT NULL, created_at INTEGER NOT NULL
      ); CREATE INDEX spectator_comments_game ON spectator_comments(game_id,id);`)
      this.db.pragma('user_version = 5')
    }).immediate()
    if (version < 6) this.db.transaction(() => {
      this.db.exec(`ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0;
        CREATE TABLE email_verification_codes (
          user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
          hash TEXT NOT NULL, expires_at INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0
        );`)
      this.db.pragma('user_version = 6')
    }).immediate()
    if (version < 7) this.db.transaction(() => {
      this.db.exec(`ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('user','admin','support'));
        CREATE TABLE account_notifications (
          id INTEGER PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          kind TEXT NOT NULL, message TEXT NOT NULL, created_at INTEGER NOT NULL
        ); CREATE INDEX account_notifications_created ON account_notifications(created_at DESC);`)
      this.db.pragma('user_version = 7')
    }).immediate()
    if (version < 8) this.db.transaction(() => {
      this.db.exec(`CREATE TABLE password_reset_codes (
        user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        hash TEXT NOT NULL, expires_at INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0
      );`)
      this.db.pragma('user_version = 8')
    }).immediate()
  }
  onModuleDestroy() { this.db.close() }
}

