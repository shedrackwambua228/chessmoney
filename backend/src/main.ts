import 'reflect-metadata'
import { createApp } from './application'

async function bootstrap() {
  const app = await createApp()
  await app.listen(Number(process.env.API_PORT ?? 8787), process.env.API_HOST ?? '127.0.0.1')
}
bootstrap().catch(error => { console.error(error); process.exitCode = 1 })
