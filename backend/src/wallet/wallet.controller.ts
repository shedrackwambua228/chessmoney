import { Body, Controller, Get, Headers, Post, UnauthorizedException } from '@nestjs/common'
import { WalletService } from './wallet.service'
import { MoneyDto } from './wallet.dto'

@Controller('wallet')
export class WalletController {
  constructor(private readonly wallet: WalletService) {}

  @Get()
  getWallet(@Headers('x-user-id') userId = 'demo-user') {
    if (!userId) throw new UnauthorizedException()
    return { user: this.wallet.getWallet(userId) }
  }

  @Get('transactions')
  getTransactions(@Headers('x-user-id') userId = 'demo-user') { return { transactions: this.wallet.getTransactions(userId) } }

  @Post('deposit')
  deposit(@Headers('x-user-id') userId = 'demo-user', @Body() dto: MoneyDto) { const cents = Math.round(Number(dto.amount) * 100); return { user: this.wallet.credit(userId, cents, 'deposit') } }

  @Post('withdraw')
  withdraw(@Headers('x-user-id') userId = 'demo-user', @Body() dto: MoneyDto) { const cents = Math.round(Number(dto.amount) * 100); return this.wallet.requestWithdrawal(userId, cents) }
}
