import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './tests',
  use: { baseURL: 'http://127.0.0.1:5173', browserName: 'chromium', launchOptions: { channel: 'msedge' } },
  webServer: [
    { command: 'npm run api:build && node backend/dist/main.js', url: 'http://127.0.0.1:8787/api/health', reuseExistingServer: false, env: { DATABASE_PATH: ':memory:', API_PORT: '8787' } },
    { command: 'npm run dev -- --host 127.0.0.1 --port 5173 --strictPort', url: 'http://127.0.0.1:5173', reuseExistingServer: true },
  ],
})
