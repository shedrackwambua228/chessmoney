import { Body, Controller, Headers, Param, Post } from '@nestjs/common'
import { CreateWagerDto } from './create-wager.dto'
import { WagersService } from './wagers.service'

@Controller('wagers')
export class WagersController {
  constructor(private readonly wagers: WagersService) {}

  @Post()
  create(@Headers('x-user-id') userId = 'demo-user', @Headers('idempotency-key') idempotencyKey: string | undefined, @Body() dto: CreateWagerDto) {
    return this.wagers.create(userId, dto, idempotencyKey)
  }

  @Post('matches/:matchId/settle')
  settle(@Param('matchId') matchId: string, @Body('winningSelection') winningSelection: string) { return this.wagers.settle(matchId, winningSelection) }

  @Post('matches/:matchId/refund')
  refund(@Param('matchId') matchId: string) { return this.wagers.refund(matchId) }
}
