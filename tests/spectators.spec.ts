import { test, expect } from '@playwright/test'

test('spectators watch, are counted once, and cannot give live move advice', async ({ browser }) => {
  test.setTimeout(70000)
  const contexts = await Promise.all([0, 1, 2].map(() => browser.newContext({ baseURL: 'http://127.0.0.1:5173' })))
  const [white, black, viewer] = contexts
  const suffix = Date.now()
  try {
    for (const [index, context] of contexts.entries()) {
      const response = await context.request.post('/api/auth/register', { data: { name: `ViewerTest${index}${suffix}`, email: `view${index}${suffix}@example.com`, password: 'Spectator test password!' } })
      expect(response.status()).toBe(201)
    }
    const { game } = await (await white.request.post('/api/games', { data: { timeControl: 'Blitz' } })).json()
    await black.request.post(`/api/games/${game.id}/join`)
    const page = await viewer.newPage()
    await page.goto('/')
    await page.getByRole('button', { name: 'Online', exact: true }).click()
    await page.locator('.online-row').filter({ hasText: `ViewerTest0${suffix}` }).getByRole('button', { name: 'Watch', exact: true }).click()
    await expect(page.getByRole('region', { name: 'Spectators', exact: true })).toContainText('1 watching')
    await expect(page.getByRole('button', { name: 'Resign', exact: true })).toHaveCount(0)
    await viewer.request.post(`/api/games/${game.id}/audience`)
    await white.request.post(`/api/games/${game.id}/audience`)
    expect((await (await white.request.get(`/api/games/${game.id}/audience`)).json()).count).toBe(1)
    for (const text of ['Play Nf3', 'your queen is hanging', 'e 2 to e 4', 'Enjoying the game! Move the rook']) {
      expect((await viewer.request.post(`/api/games/${game.id}/comments`, { data: { text } })).status()).toBe(400)
    }
    expect((await viewer.request.get(`/api/games/${game.id}/messages`)).status()).toBe(404)
    expect((await viewer.request.post(`/api/games/${game.id}/moves`, { data: { from: 'e2', to: 'e4', version: 1 } })).status()).toBe(404)
    await page.getByRole('button', { name: 'Enjoying the game!', exact: true }).click()
    await expect(page.getByRole('log', { name: 'Spectator comments', exact: true })).toContainText('Enjoying the game!')
    const audience = await (await white.request.get(`/api/games/${game.id}/audience`)).json()
    expect(audience.comments[0].name).toBe('Spectator')
    expect(audience.comments).toHaveLength(1)
    expect((await viewer.request.post(`/api/games/${game.id}/comments`, { data: { text: 'Enjoying the game!' } })).status()).toBe(409)
    await page.screenshot({ path: 'test-results/spectators.png' })
    await page.getByRole('button', { name: 'Back to online lobby', exact: true }).click()
    await expect.poll(async () => (await (await white.request.get(`/api/games/${game.id}/audience`)).json()).count, { timeout: 20000, intervals: [1000] }).toBe(0)
    // Watching must not renew either player's presence lease.
    const state = await (await viewer.request.get(`/api/games/${game.id}/watch`)).json()
    expect(state.game.paused).toBe(true)
    await white.request.post(`/api/games/${game.id}/resign`, { data: { version: state.game.version } })
    expect((await viewer.request.post(`/api/games/${game.id}/comments`, { data: { text: 'After the game: Nf3 was worth considering.' } })).status()).toBe(201)
    expect((await (await viewer.request.get(`/api/games/${game.id}/audience`)).json()).freeText).toBe(true)
  } finally { await Promise.all(contexts.map(context => context.close())) }
})
