import { ConflictException, ForbiddenException, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common'
import { createHash, randomBytes, randomInt, randomUUID, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import { Store } from '../database'

const derive = promisify(scrypt)
const digest = (value: string) => createHash('sha256').update(value).digest('hex')
export type Role = 'user' | 'admin' | 'support'
export type User = { id: string; email: string; name: string; role: Role; created_at: number }
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
    const user: User = { id: randomUUID(), email: normalizedEmail, name: name.trim(), role: 'user', created_at: Date.now() }
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
    const role = this.roleFor(account.email)
    this.store.db.transaction(() => { this.store.db.prepare('UPDATE users SET email_verified=1,role=? WHERE id=?').run(role, account.id); this.store.db.prepare('DELETE FROM email_verification_codes WHERE user_id=?').run(account.id); this.store.db.prepare('INSERT INTO account_notifications (user_id,kind,message,created_at) VALUES (?,?,?,?)').run(account.id, 'email_verified', `${account.name} verified their email address.`, Date.now()) })()
    void this.sendAdminAlert(account, role)
    return { user: this.publicUser({ ...account, role }), token: this.session(account.id) }
  }
  async resendVerification(email: string) { this.requireEmailService(); const account = this.account(email); if (account && !account.email_verified) await this.sendCode(account.email); return { ok: true } }
  async forgotPassword(email: string) { this.requireEmailService(); const account = this.account(email); if (account?.email_verified) await this.sendResetCode(account); return { ok: true } }
  async resetPassword(email: string, code: string, password: string) {
    const account = this.account(email), reset = account ? this.store.db.prepare('SELECT * FROM password_reset_codes WHERE user_id=?').get(account.id) as Verification | undefined : undefined
    if (!account || !reset || reset.expires_at <= Date.now() || reset.attempts >= 5 || !timingSafeEqual(Buffer.from(digest(code)), Buffer.from(reset.hash))) {
      if (account && reset) this.store.db.prepare('UPDATE password_reset_codes SET attempts=attempts+1 WHERE user_id=?').run(account.id)
      throw new UnauthorizedException('Reset code expired or invalid')
    }
    const salt = randomBytes(16).toString('hex'), hash = (await derive(password, salt, 64) as Buffer).toString('hex')
    this.store.db.transaction(() => { this.store.db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(`${salt}:${hash}`, account.id); this.store.db.prepare('DELETE FROM password_reset_codes WHERE user_id=?').run(account.id); this.store.db.prepare('DELETE FROM sessions WHERE user_id=?').run(account.id) })()
    return { ok: true }
  }
  registeredUserCount() { return (this.store.db.prepare('SELECT COUNT(*) AS count FROM users WHERE email_verified=1').get() as { count: number }).count }
  notifications(user: User) {
    if (!['admin', 'support'].includes(user.role)) throw new ForbiddenException('Admin or support access required')
    return this.store.db.prepare('SELECT id,user_id AS userId,kind,message,created_at AS createdAt FROM account_notifications ORDER BY id DESC LIMIT 100').all()
  }
  private account(email: string) { return this.store.db.prepare('SELECT * FROM users WHERE email=?').get(email.trim().toLowerCase()) as Account | undefined }
  private publicUser(account: Account): User { return { id: account.id, email: account.email, name: account.name, role: account.role, created_at: account.created_at } }
  private roleFor(email: string): Role { const listed = (value: string | undefined) => value?.split(',').map(item => item.trim().toLowerCase()).includes(email) ?? false; return listed(process.env.ADMIN_EMAILS) ? 'admin' : listed(process.env.SUPPORT_EMAILS) ? 'support' : 'user' }
  private createCode(userId: string) { const code = String(randomInt(0, 1_000_000)).padStart(6, '0'); this.store.db.prepare('INSERT INTO email_verification_codes (user_id,hash,expires_at,attempts) VALUES (?,?,?,0) ON CONFLICT(user_id) DO UPDATE SET hash=excluded.hash,expires_at=excluded.expires_at,attempts=0').run(userId, digest(code), Date.now() + 600_000); return code }
  private requireEmailService() { if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) throw new ServiceUnavailableException('Email verification is not configured') }
  private async sendCode(email: string) { const account = this.account(email); if (!account) return; const code = this.createCode(account.id); const response = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [email], subject: 'Verify your MoChess account', text: `Your MoChess verification code is ${code}. It expires in 10 minutes.` }) }); if (!response.ok) throw new ServiceUnavailableException('Could not send verification email') }
  private async sendResetCode(account: Account) { const code = String(randomInt(0, 1_000_000)).padStart(6, '0'); this.store.db.prepare('INSERT INTO password_reset_codes (user_id,hash,expires_at,attempts) VALUES (?,?,?,0) ON CONFLICT(user_id) DO UPDATE SET hash=excluded.hash,expires_at=excluded.expires_at,attempts=0').run(account.id, digest(code), Date.now() + 600_000); const response = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [account.email], subject: 'Reset your MoChess password', text: `Your MoChess password reset code is ${code}. It expires in 10 minutes.` }) }); if (!response.ok) throw new ServiceUnavailableException('Could not send password reset email') }
  private async sendAdminAlert(account: Account, role: Role) { if (!process.env.ADMIN_ALERT_EMAIL || !process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) return; await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [process.env.ADMIN_ALERT_EMAIL], subject: 'New verified MoChess user', text: `${account.name} (${account.email}) verified their email as ${role}. Total verified users: ${this.registeredUserCount()}.` }) }).catch(() => undefined) }
  private session(userId: string) { const token = randomBytes(32).toString('hex'); this.store.db.transaction(() => { this.store.db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(Date.now()); this.store.db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(digest(token), userId, Date.now() + SESSION_MS) })(); return token }
  authenticate(token: string): User { const user = this.store.db.prepare('SELECT u.id,u.email,u.name,u.role,u.created_at FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.hash=? AND s.expires_at>?').get(digest(token), Date.now()) as User | undefined; if (!user) throw new UnauthorizedException('Sign in required'); return user }
  logout(token: string) { this.store.db.prepare('DELETE FROM sessions WHERE hash=?').run(digest(token)) }
}
