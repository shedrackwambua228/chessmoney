import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common'
import { Request } from 'express'
import { AuthService, User } from './auth.service'

export type AuthRequest = Request & { user: User }
export function sessionToken(request: Request): string {
  const bearer = request.headers.authorization
  if (bearer?.startsWith('Bearer ')) return bearer.slice(7)
  return request.headers.cookie?.split(';').map(value => value.trim()).find(value => value.startsWith('mochess_session='))?.slice('mochess_session='.length) ?? ''
}
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthRequest>()
    request.user = this.auth.authenticate(sessionToken(request))
    return true
  }
}

