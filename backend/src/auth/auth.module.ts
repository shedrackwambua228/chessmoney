import { Global, Module } from '@nestjs/common'
import { AuthController } from './auth.controller'
import { AuthService } from './auth.service'
import { AuthGuard } from './auth.guard'
import { Store } from '../database'

@Global()
@Module({ controllers: [AuthController], providers: [Store, AuthService, AuthGuard], exports: [Store, AuthService, AuthGuard] })
export class AuthModule {}

