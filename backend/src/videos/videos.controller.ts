import { Controller, Get } from '@nestjs/common'
import { VideosService } from './videos.service'

@Controller('videos')
export class VideosController {
  constructor(private readonly videos: VideosService) {}

  @Get('recent-chess-competitions')
  recentChessCompetitions() { return this.videos.recentChessCompetitions() }
}
