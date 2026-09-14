import { Body, Controller, Get, Post, Req, Res, UseGuards } from '@nestjs/common'
import { Response } from 'express'
import { AuthService, SESSION_MS } from './auth.service'
import { AuthGuard, AuthRequest, sessionToken } from './auth.guard'
import { LoginDto, RegisterDto, ResendVerificationDto, ResetPasswordDto, VerifyEmailDto } from './auth.dto'

const cookieOptions = () => ({ httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict' as const, path: '/api' })
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}
  @Post('register')
  async register(@Body() dto: RegisterDto, @Res({ passthrough: true }) response: Response) {
    return this.auth.register(dto.email, dto.name, dto.password)
  }
  @Post('verify-email')
  async verifyEmail(@Body() dto: VerifyEmailDto, @Res({ passthrough: true }) response: Response) {
    const { user, token } = await this.auth.verifyEmail(dto.email, dto.code)
    response.cookie('mochess_session', token, { ...cookieOptions(), maxAge: SESSION_MS })
    return { user }
  }
  @Post('resend-verification') resendVerification(@Body() dto: ResendVerificationDto) { return this.auth.resendVerification(dto.email) }
  @Post('forgot-password') forgotPassword(@Body() dto: ResendVerificationDto) { return this.auth.forgotPassword(dto.email) }
  @Post('reset-password') resetPassword(@Body() dto: ResetPasswordDto) { return this.auth.resetPassword(dto.email, dto.code, dto.password) }
  @Get('stats') stats() { return { registeredUsers: this.auth.registeredUserCount() } }
  @Post('login')
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) response: Response) {
    const { user, token } = await this.auth.login(dto.email, dto.password)
    response.cookie('mochess_session', token, { ...cookieOptions(), maxAge: SESSION_MS })
    return { user }
  }
  @Get('me') @UseGuards(AuthGuard)
  me(@Req() request: AuthRequest) { return { user: request.user } }
  @Get('notifications') @UseGuards(AuthGuard)
  notifications(@Req() request: AuthRequest) { return { notifications: this.auth.notifications(request.user), registeredUsers: this.auth.registeredUserCount() } }
  @Post('logout') @UseGuards(AuthGuard)
  logout(@Req() request: AuthRequest, @Res({ passthrough: true }) response: Response) {
    this.auth.logout(sessionToken(request))
    response.clearCookie('mochess_session', cookieOptions())
    return { ok: true }
  }
}

