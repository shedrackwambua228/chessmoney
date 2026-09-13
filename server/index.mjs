// Compatibility entry point: both API scripts start the same authenticated backend.
import { fileURLToPath } from 'node:url'
process.chdir(fileURLToPath(new URL('../backend/', import.meta.url)))
await import('../backend/dist/main.js')
