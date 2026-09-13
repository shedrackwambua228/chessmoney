import { Controller, Get } from '@nestjs/common'
import { NewsService } from './news.service'

@Controller('news')
export class NewsController {
  constructor(private readonly news: NewsService) {}

  @Get()
  findAll() { return { articles: this.news.findAll() } }

  @Get('events')
  findEvents() { return { events: this.news.findEvents() } }
}
