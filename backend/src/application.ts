import { ValidationPipe } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { NestExpressApplication } from '@nestjs/platform-express'
import { json, Request, Response, NextFunction } from 'express'
import { randomUUID } from 'node:crypto'
import { resolve } from 'node:path'
import { AppModule } from './app.module'

export async function createApp() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false })
  const frontendDirectory = resolve(__dirname, '../../dist')
  const origins = (process.env.WEB_ORIGIN ?? 'http://127.0.0.1:5173,http://localhost:5173').split(',').map(value => value.trim())
  if (process.env.NODE_ENV === 'production' && (!process.env.WEB_ORIGIN || origins.some(value => !value.startsWith('https://')))) throw new Error('Production requires explicit HTTPS WEB_ORIGIN')
  const limits = new Map<string, { count: number; until: number }>()
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('X-Request-Id', randomUUID())
    if (req.headers.origin && !origins.includes(req.headers.origin)) return res.status(403).json({ message: 'Origin not allowed' })
    const now = Date.now()
    // Expire entries so varying source addresses cannot grow this map indefinitely.
    if (limits.size > 10000) for (const [key, value] of limits) if (value.until <= now) limits.delete(key)
    const auth = req.path.toLowerCase().startsWith('/api/auth')
    const key = `${req.socket.remoteAddress}:${auth ? 'auth' : 'api'}`
    let value = limits.get(key)
    if (!value || value.until <= now) {
      if (limits.size >= 20000 && !value) return res.status(503).json({ message: 'Server busy. Try again shortly' })
      value = { count: 0, until: now + 60000 }; limits.set(key, value)
    }
    if (++value.count > (auth ? 20 : 600)) {
      res.setHeader('Retry-After', Math.ceil((value.until - now) / 1000))
      return res.status(429).json({ message: 'Too many requests. Try again shortly' })
    }
    next()
  })
  app.enableCors({ origin: origins, credentials: true, methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'] })
  app.use(json({ limit: '64kb' }))
  app.use((error: { type?: string }, _req: Request, res: Response, next: NextFunction) => {
    // Avoid logging raw malformed request bodies, which may contain passwords.
    if (error.type === 'entity.too.large') return res.status(413).json({ message: 'Request body exceeds 64 KiB' })
    if (error.type === 'entity.parse.failed') return res.status(400).json({ message: 'Invalid JSON' })
    next(error)
  })
  app.setGlobalPrefix('api')
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }))
  app.useStaticAssets(frontendDirectory)
  await app.init()
  app.getHttpAdapter().getInstance().get('/{*path}', (req: Request, res: Response, next: NextFunction) => {
    if (req.path === '/api' || req.path.startsWith('/api/')) return next()
    res.sendFile(resolve(frontendDirectory, 'index.html'), error => { if (error) next(error) })
  })
  app.enableShutdownHooks()
  return app
}
