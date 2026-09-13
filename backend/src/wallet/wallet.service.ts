import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { randomUUID } from 'node:crypto'

export type UserAccount = { id: string; name: string; balanceCents: number; kycStatus: 'verified' | 'pending' | 'rejected'; strikes: number; banned: boolean }
export type WalletTransaction = { id: string; userId: string; type: 'deposit' | 'withdrawal' | 'wager_hold' | 'payout' | 'refund'; amountCents: number; status: 'succeeded' | 'pending'; createdAt: string }

@Injectable()
export class WalletService {
  private readonly users = new Map<string, UserAccount>([['demo-user', { id: 'demo-user', name: 'Jordan D.', balanceCents: 12840, kycStatus: 'verified', strikes: 0, banned: false }]])
  private readonly transactions: WalletTransaction[] = []

  createUser(id: string, name: string) { this.users.set(id, { id, name, balanceCents: 0, kycStatus: 'pending', strikes: 0, banned: false }) }

  getUser(id: string) {
    const user = this.users.get(id)
    if (!user) throw new NotFoundException('User not found')
    return user
  }

  getWallet(id: string) { return this.toPublic(this.getUser(id)) }

  debit(id: string, amountCents: number) {
    if (!Number.isInteger(amountCents) || amountCents <= 0) throw new BadRequestException('Amount must be positive cents')
    const user = this.getUser(id)
    if (user.balanceCents < amountCents) return false
    user.balanceCents -= amountCents
    this.transactions.push({ id: randomUUID(), userId: id, type: 'wager_hold', amountCents: -amountCents, status: 'succeeded', createdAt: new Date().toISOString() })
    return true
  }

  credit(id: string, amountCents: number, type: 'deposit' | 'payout' | 'refund' = 'deposit') { if (!Number.isInteger(amountCents) || amountCents <= 0) throw new BadRequestException('Amount must be positive cents'); const user = this.getUser(id); user.balanceCents += amountCents; this.transactions.push({ id: randomUUID(), userId: id, type, amountCents, status: 'succeeded', createdAt: new Date().toISOString() }); return this.toPublic(user) }
  requestWithdrawal(id: string, amountCents: number) { const user = this.getUser(id); if (user.kycStatus !== 'verified' || user.banned) throw new BadRequestException('Verified, active accounts only'); if (!this.debit(id, amountCents)) throw new BadRequestException('Wallet balance is too low'); const transaction = this.transactions[this.transactions.length - 1]; transaction.type = 'withdrawal'; transaction.status = 'pending'; return { transaction, user: this.toPublic(user) } }
  getTransactions(id: string) { this.getUser(id); return this.transactions.filter((transaction) => transaction.userId === id) }
  setKycStatus(id: string, status: UserAccount['kycStatus']) { const user = this.getUser(id); user.kycStatus = status; return this.toPublic(user) }

  addStrike(id: string) {
    const user = this.getUser(id)
    user.strikes += 1
    if (user.strikes >= 3) user.banned = true
    return this.toPublic(user)
  }

  toPublic(user: UserAccount) { return { ...user, balance: (user.balanceCents / 100).toFixed(2) } }
}
