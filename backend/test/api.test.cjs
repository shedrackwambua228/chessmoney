require('reflect-metadata')
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { mkdtempSync, rmSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join, dirname, resolve } = require('node:path')
const { createApp } = require('../dist/application')
const { Store } = require('../dist/database')

test('persistent authenticated chess API', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'mochess-api-test-'))
  process.env.DATABASE_PATH = join(directory, 'test.sqlite')
  let app, base, white, black, outsider, gameId
  async function start() {
    app = await createApp()
    await app.listen(0, '127.0.0.1')
    base = await app.getUrl()
  }
  async function request(path, { method = 'GET', cookie, body, headers = {} } = {}) {
    const response = await fetch(base + '/api' + path, {
      method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...headers },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    })
    return { status: response.status, body: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0], headers: response.headers }
  }
  async function account(name) {
    const result = await request('/auth/register', { method: 'POST', body: { name, email: name + '@example.com', password: 'Good test password 123!' } })
    assert.equal(result.status, 201)
    assert.ok(result.cookie)
    assert.ok(result.headers.get('set-cookie').includes('HttpOnly'))
    return { ...result.body.user, cookie: result.cookie }
  }
  try {
    await start()
    await t.test('health, validation, secure sessions and legacy routes', async () => {
      assert.equal((await request('/health')).status, 200)
      assert.equal((await request('/games', { headers: { 'x-user-id': 'demo-user' } })).status, 401)
      assert.equal((await request('/auth/register', { method: 'POST', body: { name: 'X', email: 'invalid', password: 'short', admin: true } })).status, 400)
      white = await account('WhitePlayer'); black = await account('BlackPlayer'); outsider = await account('Observer')
      assert.equal((await request('/auth/me', { cookie: white.cookie })).body.user.id, white.id)
      assert.equal((await request('/auth/register', { method: 'POST', body: { name: 'Another', email: 'WHITEPLAYER@example.com', password: 'Good test password 123!' } })).status, 409)
      assert.equal((await request('/auth/login', { method: 'POST', body: { email: white.email, password: 'Wrong password 123' } })).status, 401)
      assert.equal((await request('/wallet/deposit', { method: 'POST', cookie: white.cookie, body: { amount: 100 } })).status, 404)
      assert.equal((await request('/auth/kyc/verify', { method: 'POST', cookie: white.cookie })).status, 404)
      const hash = app.get(Store).db.prepare('SELECT password_hash FROM users WHERE id=?').get(white.id).password_hash
      assert.ok(!hash.includes('Good test password'))
      assert.equal(app.get(Store).db.prepare('SELECT count(*) n FROM sessions WHERE hash=?').get(white.cookie.split('=')[1]).n, 0)
    })
    await t.test('transactional join, ownership, turn order and duplicate move protection', async () => {
      const made = await request('/games', { method: 'POST', cookie: white.cookie, body: { timeControl: 'Blitz' } })
      assert.equal(made.status, 201); gameId = made.body.game.id
      assert.equal((await request(`/games/${gameId}/join`, { method: 'POST', cookie: white.cookie })).status, 409)
      const joins = await Promise.all([black, outsider].map(user => request(`/games/${gameId}/join`, { method: 'POST', cookie: user.cookie })))
      assert.deepEqual(joins.map(value => value.status).sort(), [201, 409])
      if (joins[1].status === 201) [black, outsider] = [outsider, black]
      assert.equal((await request(`/games/${gameId}`, { cookie: outsider.cookie })).status, 404)
      assert.equal((await request(`/games/${gameId}/heartbeat`, { method: 'POST' })).status, 401)
      assert.equal((await request(`/games/${gameId}/heartbeat`, { method: 'POST', cookie: outsider.cookie })).status, 404)
      assert.equal((await request(`/games/${gameId}/heartbeat`, { method: 'POST', cookie: white.cookie })).status, 201)
      const move = (cookie, from, to, version) => request(`/games/${gameId}/moves`, { method: 'POST', cookie, body: { from, to, version } })
      assert.equal((await move(black.cookie, 'e7', 'e5', 1)).status, 409)
      assert.equal((await move(white.cookie, 'e2', 'e5', 1)).status, 400)
      assert.equal((await move(outsider.cookie, 'e2', 'e4', 1)).status, 404)
      const results = await Promise.all([move(white.cookie, 'e2', 'e4', 1), move(white.cookie, 'e2', 'e4', 1)])
      assert.deepEqual(results.map(value => value.status).sort(), [201, 409])
      const game = (await request(`/games/${gameId}`, { cookie: white.cookie })).body.game
      assert.equal(game.version, 2); assert.equal(game.turn, 'b'); assert.match(game.pgn, /e4/)
    })
    await t.test('private backups, PGN validation and preferences', async () => {
      const body = { pgn: '1. e4 e5', mode: 'local', timeControl: 'Blitz', w: 300000, b: 300000 }
      assert.equal((await request('/profile/saved-games/practice-1', { method: 'PUT', cookie: white.cookie, body })).status, 200)
      assert.equal((await request('/profile/saved-games/bad', { method: 'PUT', cookie: white.cookie, body: { ...body, pgn: '1. invalid' } })).status, 400)
      assert.equal((await request('/profile/saved-games', { cookie: outsider.cookie })).body.games.length, 0)
      assert.equal((await request('/profile/saved-games', { cookie: white.cookie })).body.games.length, 1)
      const prefs = { board: 'walnut', hints: false, timeControl: 'Rapid' }
      assert.equal((await request('/profile/preferences', { method: 'PUT', cookie: white.cookie, body: prefs })).status, 200)
      assert.deepEqual((await request('/profile/preferences', { cookie: white.cookie })).body.preferences, prefs)
    })
    await t.test('restart preserves accounts, sessions, games and backups', async () => {
      await app.close(); await start()
      assert.equal((await request('/auth/me', { cookie: white.cookie })).body.user.id, white.id)
      assert.equal((await request(`/games/${gameId}`, { cookie: white.cookie })).body.game.version, 2)
      assert.equal((await request('/profile/saved-games', { cookie: white.cookie })).body.games.length, 1)
      const login = await request('/auth/login', { method: 'POST', body: { email: white.email, password: 'Good test password 123!' } })
      assert.equal(login.status, 201)
      assert.equal((await request('/auth/logout', { method: 'POST', cookie: login.cookie })).status, 201)
      assert.equal((await request('/auth/me', { cookie: login.cookie })).status, 401)
    })
    await t.test('server clocks reject late moves and settlement is stable', async () => {
      app.get(Store).db.prepare('UPDATE games SET clock_black=1,last_move_at=? WHERE id=?').run(Date.now() - 100, gameId)
      const timed = await request(`/games/${gameId}/moves`, { method: 'POST', cookie: black.cookie, body: { from: 'e7', to: 'e5', version: 2 } })
      assert.equal(timed.body.game.status, 'finished')
      assert.equal(timed.body.game.result, 'White wins on time')
      assert.equal(timed.body.game.version, 3)
      const repeat = await request(`/games/${gameId}/resign`, { method: 'POST', cookie: black.cookie, body: { version: 3 } })
      assert.equal(repeat.body.game.version, 3)
    })
    await t.test('checkmate is calculated from legal moves', async () => {
      const id = (await request('/games', { method: 'POST', cookie: white.cookie, body: { timeControl: 'Rapid' } })).body.game.id
      await request(`/games/${id}/join`, { method: 'POST', cookie: black.cookie })
      let result
      for (const [index, [from, to]] of [['f2','f3'], ['e7','e5'], ['g2','g4'], ['d8','h4']].entries()) {
        result = await request(`/games/${id}/moves`, { method: 'POST', cookie: index % 2 ? black.cookie : white.cookie, body: { from, to, version: index + 1 } })
        assert.equal(result.status, 201)
      }
      assert.equal(result.body.game.status, 'finished')
      assert.equal(result.body.game.result, 'Black wins by checkmate')
      assert.match(result.body.game.pgn, /\[Result "0-1"\]/)
    })
    await t.test('origin, payload, expiry and rate limit boundaries', async () => {
      assert.equal((await request('/auth/logout', { method: 'POST', cookie: white.cookie, headers: { Origin: 'https://attacker.example' } })).status, 403)
      assert.equal((await request('/auth/login', { method: 'POST', body: { email: 'x'.repeat(70000) } })).status, 413)
      app.get(Store).db.prepare('UPDATE sessions SET expires_at=0 WHERE user_id=?').run(outsider.id)
      assert.equal((await request('/auth/me', { cookie: outsider.cookie })).status, 401)
      let result
      for (let i = 0; i < 22; i++) result = await request('/auth/login', { method: 'POST', body: {} })
      assert.equal(result.status, 429)
      assert.ok(Number(result.headers.get('retry-after')) > 0)
    })
  } finally {
    if (app) await app.close()
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()))
    rmSync(directory, { recursive: true, force: true })
    delete process.env.DATABASE_PATH
  }
})
