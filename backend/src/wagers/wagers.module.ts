import { Module } from '@nestjs/common'
import { WalletModule } from '../wallet/wallet.module'
import { WagersController } from './wagers.controller'
import { WagersService } from './wagers.service'

@Module({ imports: [WalletModule], controllers: [WagersController], providers: [WagersService] })
export class WagersModule {}
