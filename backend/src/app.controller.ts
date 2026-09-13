import { Controller, Get } from '@nestjs/common'
import { Store } from './database'

@Controller()
export class AppController {
  constructor(private readonly store: Store) {}
  @Get('health')
  health() {
    this.store.db.prepare('SELECT 1').get()
    return { ok: true, service: 'mochess-api', time: new Date().toISOString() }
  }
}
