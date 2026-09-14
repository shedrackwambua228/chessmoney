import 'reflect-metadata'
import { createApp } from './application'

async function bootstrap() {
  const app = await createApp()
  await app.listen(process.env.PORT || 10000, '0.0.0.0')
}
bootstrap().catch(error => { console.error(error); process.exitCode = 1 })
