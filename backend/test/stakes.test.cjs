require('reflect-metadata')
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { createApp } = require('../dist/application')
const { Store } = require('../dist/database')
const { GamesService } = require('../dist/games')

test('demo stakes: pairing, authorization, atomic balances and settlement', async t => {
  process.env.DATABASE_PATH = ':memory:'
  const app = await createApp()
  delete process.env.DATABASE_PATH
  await app.listen(0, '127.0.0.1')
  const base = await app.getUrl(), store = app.get(Store), games = app.get(GamesService)
  async function request(path, cookie, body) {
    const response = await fetch(base + '/api' + path, { method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
    return { status: response.status, body: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] }
  }
  try {
    const users = []
    for (const name of ['StakeA', 'StakeB', 'StakeC']) {
      const r = await request('/auth/register', null, { name, email: name + '@example.com', password: 'Long test password!' })
      users.push({ id: r.body.user.id, cookie: r.cookie })
    }
    const [a,b,c] = users
    const match = (u, stakeCents = 1000, timeControl = 'Blitz') => request('/games/match', u.cookie, { stakeCents, timeControl })
    const balance = u => games.wallet(u.id).balance
    await t.test('validation and private wallet', async () => {
      assert.equal((await request('/games/demo-wallet')).status, 401)
      for (const stakeCents of [-1, 0, 101, 1000.5, 10020, '1000']) assert.equal((await match(a, stakeCents)).status, 400)
      assert.equal((await request('/games/match', a.cookie, { stakeCents: 1000, timeControl: 'Blitz', winner: a.id })).status, 400)
    })
    await t.test('equal stakes pair once; unequal stakes and controls stay separate', async () => {
      const first = (await match(a)).body.game
      assert.equal(balance(a), 9000)
      assert.equal((await match(a)).body.game.id, first.id)
      assert.equal(balance(a), 9000)
      assert.equal((await request(`/games/${first.id}/join`, b.cookie, {})).status, 409)
      const other = (await match(c, 2000)).body.game
      assert.notEqual(other.id, first.id)
      games.end(c.id, other.id, { version: 0 }, true)
      const slower = (await match(c, 1000, 'Rapid')).body.game
      assert.notEqual(slower.id, first.id)
      games.end(c.id, slower.id, { version: 0 }, true)
      const results = await Promise.all([match(b), match(b)])
      assert.ok(results.every(r => r.body.game.id === first.id && r.body.game.status === 'active'))
      assert.equal(balance(b), 9000)
      const finished = games.end(a.id, first.id, { version: 1 }, false)
      assert.equal(finished.stake.settled, true)
      assert.equal(balance(a), 9000); assert.equal(balance(b), 10900)
      games.end(a.id, first.id, { version: finished.version }, false); games.sweep()
      assert.equal(balance(b), 10900)
      assert.equal(store.db.prepare('SELECT amount FROM demo_commissions WHERE game_id=?').get(first.id).amount, 100)
    })
    await t.test('insufficient balance rolls back creation and queue reservation', async () => {
      const count = store.db.prepare('SELECT count(*) n FROM games').get().n
      assert.equal((await match(a, 10000)).status, 409)
      assert.equal(store.db.prepare('SELECT count(*) n FROM games').get().n, count)
    })
    await t.test('cancel and abandoned search refund once', async () => {
      const before = balance(c), waiting = (await match(c)).body.game
      store.db.prepare('UPDATE games SET updated_at=? WHERE id=?').run(Date.now() - 60001, waiting.id)
      games.sweep(); games.sweep()
      assert.equal(games.get(c.id, waiting.id).status, 'cancelled')
      assert.equal(balance(c), before)
    })
    await t.test('mutual abandonment refunds both players without commission', async () => {
      const beforeA = balance(a), beforeB = balance(b)
      const waiting = (await match(a)).body.game
      await match(b)
      store.db.prepare('UPDATE games SET white_seen_at=?,black_seen_at=? WHERE id=?').run(Date.now() - 60000, Date.now() - 60000, waiting.id)
      // Use exactly equal timestamps to exercise the server draw path.
      store.db.prepare('UPDATE games SET black_seen_at=white_seen_at WHERE id=?').run(waiting.id)
      games.sweep()
      assert.equal(games.get(a.id, waiting.id).winner, null)
      assert.equal(balance(a), beforeA); assert.equal(balance(b), beforeB)
      assert.equal(store.db.prepare('SELECT count(*) n FROM demo_commissions WHERE game_id=?').get(waiting.id).n, 0)
    })
    await t.test('checkmate settles the net pot', async () => {
      const before = balance(b), waiting = (await match(a)).body.game
      await match(b)
      for (const [i, [from,to]] of [['f2','f3'],['e7','e5'],['g2','g4'],['d8','h4']].entries()) games.move(i % 2 ? b.id : a.id, waiting.id, { from, to, version: i + 1 })
      assert.equal(games.get(a.id, waiting.id).winner, 'Black')
      assert.equal(balance(b), before + 900)
    })
  } finally { await app.close() }
})
