import { Module } from '@nestjs/common'
import { WalletModule } from '../wallet/wallet.module'
import { FairPlayController } from './fair-play.controller'

@Module({ imports: [WalletModule], controllers: [FairPlayController] })
export class FairPlayModule {}
