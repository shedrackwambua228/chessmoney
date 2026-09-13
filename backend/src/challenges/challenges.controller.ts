import { Controller, Get, Query } from '@nestjs/common'
import { ChallengesService } from './challenges.service'

@Controller('challenges')
export class ChallengesController {
  constructor(private readonly challenges: ChallengesService) {}

  @Get()
  findAll(@Query('minStake') minStake = '0', @Query('maxStake') maxStake = '99999999', @Query('minRating') minRating = '0', @Query('maxRating') maxRating = '9999') {
    const toCents = (value: string) => Math.round(Number(value) * 100)
    return { challenges: this.challenges.findAll(toCents(minStake), toCents(maxStake), Number(minRating), Number(maxRating)) }
  }
}
