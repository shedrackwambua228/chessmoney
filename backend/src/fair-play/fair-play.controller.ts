import { Body, Controller, Post, Headers, BadRequestException } from '@nestjs/common'
import { WalletService } from '../wallet/wallet.service'

@Controller('fair-play')
export class FairPlayController {
  constructor(private readonly wallet: WalletService) {}

  @Post('strikes')
  strike(@Headers('x-user-id') userId = 'demo-user', @Body() body: { userId?: string; matchId?: string; reason?: string }) {
    if (body.userId !== userId || !body.matchId || body.reason !== 'engine-detected') throw new BadRequestException('Invalid fair-play event')
    return { immediateForfeit: true, user: this.wallet.addStrike(userId) }
  }
}
