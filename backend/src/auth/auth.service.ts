import { ConflictException, ForbiddenException, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common'
import { createHash, randomBytes, randomInt, randomUUID, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import { Store } from '../database'

const derive = promisify(scrypt)
const digest = (value: string) => createHash('sha256').update(value).digest('hex')
export type User = { id: string; email: string; name: string; created_at: number }
type Account = User & { password_hash: string; email_verified: number }
type Verification = { hash: string; expires_at: number; attempts: number }
export const SESSION_MS = 7 * 24 * 60 * 60 * 1000

@Injectable()
export class AuthService {
  constructor(private readonly store: Store) {}
  async register(email: string, name: string, password: string) {
    this.requireEmailService()
    const normalizedEmail = email.trim().toLowerCase(), salt = randomBytes(16).toString('hex')
    const hash = (await derive(password, salt, 64) as Buffer).toString('hex')
    const user: User = { id: randomUUID(), email: normalizedEmail, name: name.trim(), created_at: Date.now() }
    this.store.db.transaction(() => {
      try { this.store.db.prepare('INSERT INTO users (id,email,name,password_hash,created_at) VALUES (?,?,?,?,?)').run(user.id, user.email, user.name, `${salt}:${hash}`, user.created_at) }
      catch (error) { if ((error as { code?: string }).code?.startsWith('SQLITE_CONSTRAINT')) throw new ConflictException('Email or player name already registered'); throw error }
      this.createCode(user.id)
    })()
    await this.sendCode(normalizedEmail)
    return { email: normalizedEmail }
  }
  async login(email: string, password: string) {
    const account = this.account(email), [salt, expected] = account?.password_hash.split(':') ?? ['0'.repeat(32), '0'.repeat(128)]
    const actual = await derive(password, salt, 64) as Buffer
    if (!timingSafeEqual(actual, Buffer.from(expected, 'hex')) || !account) throw new UnauthorizedException('Invalid credentials')
    if (!account.email_verified) throw new ForbiddenException('Verify your email before signing in')
    return { user: this.publicUser(account), token: this.session(account.id) }
  }
  async verifyEmail(email: string, code: string) {
    const account = this.account(email), verification = account ? this.store.db.prepare('SELECT * FROM email_verification_codes WHERE user_id=?').get(account.id) as Verification | undefined : undefined
    if (!account || !verification || verification.expires_at <= Date.now() || verification.attempts >= 5 || !timingSafeEqual(Buffer.from(digest(code)), Buffer.from(verification.hash))) {
      if (account && verification) this.store.db.prepare('UPDATE email_verification_codes SET attempts=attempts+1 WHERE user_id=?').run(account.id)
      throw new UnauthorizedException('Verification code expired or invalid')
    }
    this.store.db.transaction(() => { this.store.db.prepare('UPDATE users SET email_verified=1 WHERE id=?').run(account.id); this.store.db.prepare('DELETE FROM email_verification_codes WHERE user_id=?').run(account.id) })()
    return { user: this.publicUser(account), token: this.session(account.id) }
  }
  async resendVerification(email: string) { this.requireEmailService(); const account = this.account(email); if (account && !account.email_verified) await this.sendCode(account.email); return { ok: true } }
  registeredUserCount() { return (this.store.db.prepare('SELECT COUNT(*) AS count FROM users WHERE email_verified=1').get() as { count: number }).count }
  private account(email: string) { return this.store.db.prepare('SELECT * FROM users WHERE email=?').get(email.trim().toLowerCase()) as Account | undefined }
  private publicUser(account: Account): User { return { id: account.id, email: account.email, name: account.name, created_at: account.created_at } }
  private createCode(userId: string) { const code = String(randomInt(0, 1_000_000)).padStart(6, '0'); this.store.db.prepare('INSERT INTO email_verification_codes (user_id,hash,expires_at,attempts) VALUES (?,?,?,0) ON CONFLICT(user_id) DO UPDATE SET hash=excluded.hash,expires_at=excluded.expires_at,attempts=0').run(userId, digest(code), Date.now() + 600_000); return code }
  private requireEmailService() { if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) throw new ServiceUnavailableException('Email verification is not configured') }
  private async sendCode(email: string) { const account = this.account(email); if (!account) return; const code = this.createCode(account.id); const response = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [email], subject: 'Verify your MoChess account', text: `Your MoChess verification code is ${code}. It expires in 10 minutes.` }) }); if (!response.ok) throw new ServiceUnavailableException('Could not send verification email') }
  private session(userId: string) { const token = randomBytes(32).toString('hex'); this.store.db.transaction(() => { this.store.db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(Date.now()); this.store.db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(digest(token), userId, Date.now() + SESSION_MS) })(); return token }
  authenticate(token: string): User { const user = this.store.db.prepare('SELECT u.id,u.email,u.name,u.created_at FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.hash=? AND s.expires_at>?').get(digest(token), Date.now()) as User | undefined; if (!user) throw new UnauthorizedException('Sign in required'); return user }
  logout(token: string) { this.store.db.prepare('DELETE FROM sessions WHERE hash=?').run(digest(token)) }
}
