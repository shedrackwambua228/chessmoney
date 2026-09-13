import { Module } from '@nestjs/common'
import { AppController } from './app.controller'
import { AuthModule } from './auth/auth.module'
import { GamesController, GamesService } from './games'
import { ProfileController } from './profile'
import { VideosModule } from './videos/videos.module'

@Module({ imports: [AuthModule, VideosModule], controllers: [AppController, GamesController, ProfileController], providers: [GamesService] })
export class AppModule {}

