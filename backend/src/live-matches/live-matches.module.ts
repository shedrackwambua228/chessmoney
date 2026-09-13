import { Module } from '@nestjs/common'
import { LiveMatchesController } from './live-matches.controller'
import { LiveMatchesService } from './live-matches.service'

@Module({ controllers: [LiveMatchesController], providers: [LiveMatchesService] })
export class LiveMatchesModule {}
