import { ConflictException } from '@nestjs/common'
import { Store } from './database'

// Integer demo cents; mutations run within the enclosing game transaction.
export class DemoStakes {
  constructor(private readonly store: Store) {}
  wallet(user: string) {
    const db = this.store.db
    if (db.prepare('INSERT OR IGNORE INTO demo_wallets VALUES (?,10000)').run(user).changes)
      db.prepare('INSERT INTO demo_ledger(user_id,kind,amount,created_at) VALUES (?,?,?,?)').run(user, 'welcome', 10000, Date.now())
    return { currency: 'DEMO', balance: (db.prepare('SELECT balance FROM demo_wallets WHERE user_id=?').get(user) as { balance: number }).balance,
      ledger: db.prepare('SELECT game_id gameId,kind,amount,created_at createdAt FROM demo_ledger WHERE user_id=? ORDER BY id DESC LIMIT 30').all(user) }
  }
  transfer(user: string, game: string, amount: number, kind: string) {
    this.wallet(user)
    if (!this.store.db.prepare('UPDATE demo_wallets SET balance=balance+? WHERE user_id=? AND balance+? >= 0').run(amount, user, amount).changes) throw new ConflictException('Insufficient demo credits')
    this.store.db.prepare('INSERT INTO demo_ledger(user_id,game_id,kind,amount,created_at) VALUES (?,?,?,?,?)').run(user, game, kind, amount, Date.now())
  }
  view(game: string) {
    const row = this.store.db.prepare('SELECT amount,settled FROM demo_stakes WHERE game_id=?').get(game) as { amount: number; settled: number } | undefined
    return row ? { amount: row.amount, commissionPerPlayer: row.amount / 20, winnerPayout: row.amount * 19 / 10, settled: !!row.settled, currency: 'DEMO' } : null
  }
  settle(row: { id: string; status: string; result: string | null; white_id: string; black_id: string | null }) {
    if (!['finished', 'cancelled'].includes(row.status)) return
    const stake = this.view(row.id)
    if (!stake || stake.settled) return
    if (!this.store.db.prepare('UPDATE demo_stakes SET settled=1 WHERE game_id=? AND settled=0').run(row.id).changes) return
    const winner = row.result?.startsWith('White wins') ? row.white_id : row.result?.startsWith('Black wins') ? row.black_id : null
    if (winner && row.black_id) {
      this.transfer(winner, row.id, stake.winnerPayout, 'prize')
      this.store.db.prepare('INSERT INTO demo_commissions VALUES (?,?)').run(row.id, stake.commissionPerPlayer * 2)
    } else {
      this.transfer(row.white_id, row.id, stake.amount, 'refund')
      if (row.black_id) this.transfer(row.black_id, row.id, stake.amount, 'refund')
    }
  }
}
