import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common'
import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import { Store } from '../database'

const derive = promisify(scrypt)
const digest = (token: string) => createHash('sha256').update(token).digest('hex')
export type User = { id: string; email: string; name: string; created_at: number }
type Account = User & { password_hash: string }
export const SESSION_MS = 7 * 24 * 60 * 60 * 1000

@Injectable()
export class AuthService {
  constructor(private readonly store: Store) {}
  async register(email: string, name: string, password: string) {
    const salt = randomBytes(16).toString('hex')
    const hash = (await derive(password, salt, 64) as Buffer).toString('hex')
    const user: User = { id: randomUUID(), email: email.trim().toLowerCase(), name: name.trim(), created_at: Date.now() }
    return this.store.db.transaction(() => {
      try {
        this.store.db.prepare('INSERT INTO users (id,email,name,password_hash,created_at) VALUES (?,?,?,?,?)')
          .run(user.id, user.email, user.name, salt + ':' + hash, user.created_at)
      } catch (error) {
        if ((error as { code?: string }).code?.startsWith('SQLITE_CONSTRAINT')) throw new ConflictException('Email or player name already registered')
        throw error
      }
      return { user, token: this.session(user.id) }
    })()
  }
  async login(email: string, password: string) {
    const account = this.store.db.prepare('SELECT * FROM users WHERE email = ?').get(email.trim().toLowerCase()) as Account | undefined
    const [salt, expected] = account?.password_hash.split(':') ?? ['0'.repeat(32), '0'.repeat(128)]
    const actual = await derive(password, salt, 64) as Buffer
    if (!timingSafeEqual(actual, Buffer.from(expected, 'hex')) || !account) throw new UnauthorizedException('Invalid credentials')
    const { password_hash: _, ...user } = account
    return { user, token: this.session(user.id) }
  }
  private session(userId: string) {
    const token = randomBytes(32).toString('hex')
    this.store.db.transaction(() => {
      this.store.db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(Date.now())
      this.store.db.prepare('DELETE FROM sessions WHERE user_id = ? AND hash NOT IN (SELECT hash FROM sessions WHERE user_id = ? ORDER BY expires_at DESC LIMIT 9)').run(userId, userId)
      this.store.db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(digest(token), userId, Date.now() + SESSION_MS)
    })()
    return token
  }
  authenticate(token: string): User {
    const user = this.store.db.prepare(`SELECT u.id,u.email,u.name,u.created_at FROM users u
      JOIN sessions s ON s.user_id = u.id WHERE s.hash = ? AND s.expires_at > ?`).get(digest(token), Date.now()) as User | undefined
    if (!user) throw new UnauthorizedException('Sign in required')
    return user
  }
  logout(token: string) { this.store.db.prepare('DELETE FROM sessions WHERE hash = ?').run(digest(token)) }
}

