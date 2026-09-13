import { Controller, Get, NotFoundException, Param } from '@nestjs/common'
import { LiveMatchesService } from './live-matches.service'

@Controller('live-matches')
export class LiveMatchesController {
  constructor(private readonly liveMatches: LiveMatchesService) {}

  @Get()
  findAll() { return { matches: this.liveMatches.findAll() } }

  @Get(':id')
  findOne(@Param('id') id: string) {
    const match = this.liveMatches.findOne(id)
    if (!match) throw new NotFoundException('Live match not found')
    return { match }
  }
}
