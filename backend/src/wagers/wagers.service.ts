import { ConflictException, ForbiddenException, Injectable, BadRequestException } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import { WalletService } from '../wallet/wallet.service'
import { CreateWagerDto } from './create-wager.dto'

@Injectable()
export class WagersService {
  private readonly processed = new Map<string, object>()
  private readonly wagers = new Map<string, { id: string; userId: string; matchId: string; selection: string; amountCents: number; potentialReturnCents: number; status: 'held' | 'won' | 'lost' | 'refunded'; createdAt: string }>()
  constructor(private readonly wallet: WalletService) {}

  create(userId: string, dto: CreateWagerDto, idempotencyKey?: string) {
    if (idempotencyKey && this.processed.has(`${userId}:${idempotencyKey}`)) return this.processed.get(`${userId}:${idempotencyKey}`)
    const user = this.wallet.getUser(userId)
    const amountCents = Math.round(Number(dto.amount) * 100)
    if (user.banned || user.kycStatus !== 'verified') throw new ForbiddenException('Verified, active accounts only')
    if (amountCents < 100) throw new BadRequestException('Wager must be at least $1.00')
    if (!this.wallet.debit(userId, amountCents)) throw new ConflictException('Wallet balance is too low')
    const odds = dto.selection === 'Alex Mercer' ? 1.72 : 2.1
    const wager: { id: string; userId: string; matchId: string; selection: string; amountCents: number; potentialReturnCents: number; status: 'held' | 'won' | 'lost' | 'refunded'; createdAt: string } = { id: randomUUID(), userId, matchId: dto.matchId, selection: dto.selection, amountCents, potentialReturnCents: Math.round(amountCents * odds), status: 'held', createdAt: new Date().toISOString() }
    this.wagers.set(wager.id, wager)
    const result = { wager, user: this.wallet.getWallet(userId) }
    if (idempotencyKey) this.processed.set(`${userId}:${idempotencyKey}`, result)
    return result
  }

  settle(matchId: string, winningSelection: string) {
    const settled = []
    for (const wager of this.wagers.values()) {
      if (wager.matchId !== matchId || wager.status !== 'held') continue
      wager.status = wager.selection === winningSelection ? 'won' : 'lost'
      if (wager.status === 'won') this.wallet.credit(wager.userId, wager.potentialReturnCents, 'payout')
      settled.push(wager)
    }
    return { matchId, winningSelection, wagers: settled }
  }

  refund(matchId: string) {
    const refunded = []
    for (const wager of this.wagers.values()) {
      if (wager.matchId !== matchId || wager.status !== 'held') continue
      wager.status = 'refunded'; this.wallet.credit(wager.userId, wager.amountCents, 'refund'); refunded.push(wager)
    }
    return { matchId, wagers: refunded }
  }
}
