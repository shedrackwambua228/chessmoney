require('reflect-metadata')
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { mkdtempSync, rmSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join, dirname, resolve } = require('node:path')
const { Store } = require('../dist/database')
const { GamesService, HEARTBEAT_TIMEOUT_MS, RECONNECT_WINDOW_MS } = require('../dist/games')

const START = 1800000000000
function scenario(name, work) {
  test(name, async t => {
    let now = START
    t.mock.method(Date, 'now', () => now)
    process.env.DATABASE_PATH = ':memory:'
    const store = new Store(), service = new GamesService(store)
    delete process.env.DATABASE_PATH
    for (const id of ['white', 'black', 'outsider']) store.db.prepare('INSERT INTO users VALUES (?,?,?,?,?)').run(id, id + '@test.com', id, 'unused', now)
    const created = service.create('white', { timeControl: 'Blitz' })
    const game = service.join('black', created.id)
    const raw = () => store.db.prepare('SELECT * FROM games WHERE id=?').get(game.id)
    try { await work({ store, service, game, raw, time: value => { now = START + value } }) }
    finally { service.onModuleDestroy(); store.onModuleDestroy() }
  })
}

scenario('missing heartbeat starts a full 50-second window and freezes clocks and moves', ({ service, game, time }) => {
  assert.equal(HEARTBEAT_TIMEOUT_MS, 6000)
  assert.equal(RECONNECT_WINDOW_MS, 50000)
  time(4000); service.heartbeat('black', game.id)
  time(6000)
  const paused = service.heartbeat('black', game.id)
  assert.equal(paused.paused, true)
  assert.equal(paused.presence.w.reconnectDeadline, START + 56000)
  assert.equal(paused.presence.b.connected, true)
  assert.equal(paused.clocks.w, 294000)
  assert.throws(() => service.move('white', game.id, { from: 'e2', to: 'e4', version: 1 }), /paused/)
  time(40000)
  const still = service.heartbeat('black', game.id)
  assert.equal(still.status, 'active')
  assert.equal(still.clocks.w, paused.clocks.w)
  assert.equal(still.clocks.b, paused.clocks.b)
  assert.equal(still.presence.w.reconnectDeadline, paused.presence.w.reconnectDeadline)
})

scenario('reconnection at 49.999 seconds cancels the deadline and resumes the same position', ({ service, game, time }) => {
  time(4000); service.heartbeat('black', game.id)
  time(55999); service.heartbeat('black', game.id)
  const returned = service.heartbeat('white', game.id)
  assert.equal(returned.status, 'active')
  assert.equal(returned.paused, false)
  assert.equal(returned.presence.w.reconnectDeadline, null)
  assert.equal(returned.presence.b.reconnectDeadline, null)
  assert.equal(returned.fen, game.fen)
  assert.equal(returned.clocks.w, 294000)
  time(56000); service.sweep()
  const moved = service.move('white', game.id, { from: 'e2', to: 'e4', version: 1 })
  assert.equal(moved.status, 'active')
  assert.match(moved.pgn, /e4/)
  assert.equal(moved.clocks.w, 296999)
  // A new disconnect receives its own full grace period, not the cancelled deadline.
  time(62000)
  const again = service.heartbeat('black', game.id)
  assert.equal(again.presence.w.reconnectDeadline, START + 111999)
})

for (const disconnected of ['white', 'black']) {
  scenario(`${disconnected} reconnecting exactly at the deadline loses; subsequent events cannot change the winner`, ({ service, game, time, raw }) => {
    const opponent = disconnected === 'white' ? 'black' : 'white'
    const winner = disconnected === 'white' ? 'Black' : 'White'
    time(4000); service.heartbeat(opponent, game.id)
    time(55999); service.heartbeat(opponent, game.id)
    assert.equal(raw().status, 'active')
    time(56000)
    const finished = service.heartbeat(disconnected, game.id)
    assert.equal(finished.status, 'finished')
    assert.equal(finished.winner, winner)
    assert.equal(finished.result, `${winner} wins by abandonment`)
    assert.match(finished.pgn, winner === 'White' ? /\[Result "1-0"\]/ : /\[Result "0-1"\]/)
    const version = finished.version
    time(100000); service.sweep()
    assert.equal(service.heartbeat(disconnected, game.id).version, version)
    assert.equal(service.end(opponent, game.id, { version }, false).winner, winner)
    assert.equal(service.move('white', game.id, { from: 'e2', to: 'e4', version }).winner, winner)
  })
}

scenario('automatic background timer settles abandonment without a client request', async ({ service, game, time, raw }) => {
  time(4000); service.heartbeat('black', game.id)
  service.onModuleInit()
  time(56000)
  await new Promise(resolve => setTimeout(resolve, 700))
  assert.equal(raw().status, 'finished')
  assert.equal(raw().result, 'Black wins by abandonment')
})

scenario('only the authenticated participant can renew their own presence', ({ service, game, time, raw }) => {
  time(4000)
  assert.throws(() => service.heartbeat('outsider', game.id), /not found/)
  assert.equal(raw().white_seen_at, START)
  service.heartbeat('black', game.id)
  assert.equal(raw().white_seen_at, START)
  assert.equal(raw().black_seen_at, START + 4000)
  time(6000)
  service.get('white', game.id)
  service.list('white')
  assert.equal(raw().white_seen_at, START, 'read-only polling must not renew presence')
})

scenario('both disconnecting uses the first deadline, with an exact tie recorded as a draw', ({ service, game, time }) => {
  time(56000); service.sweep()
  const finished = service.get('white', game.id)
  assert.equal(finished.status, 'finished')
  assert.equal(finished.result, 'Draw by mutual abandonment')
  assert.equal(finished.winner, null)
})

scenario('normal chess timeout before a disconnect remains final', ({ store, service, game, time }) => {
  store.db.prepare('UPDATE games SET clock_white=1000 WHERE id=?').run(game.id)
  time(56000); service.sweep()
  assert.equal(service.get('white', game.id).result, 'Black wins on time')
})

scenario('waiting and finished games never acquire abandonment deadlines', ({ service, time }) => {
  const waiting = service.create('white', { timeControl: 'Blitz' })
  time(100000); service.sweep()
  const view = service.heartbeat('white', waiting.id)
  assert.equal(view.status, 'waiting')
  assert.equal(view.paused, false)
  assert.equal(view.presence.w.reconnectDeadline, null)
  service.end('white', waiting.id, { version: 0 }, true)
  time(200000); service.sweep()
  assert.equal(service.get('white', waiting.id).status, 'cancelled')
})

test('schema migration preserves games and restart preserves an in-progress countdown', t => {
  let now = START
  t.mock.method(Date, 'now', () => now)
  const directory = mkdtempSync(join(tmpdir(), 'mochess-presence-'))
  process.env.DATABASE_PATH = join(directory, 'game.sqlite')
  let store = new Store()
  try {
    for (const id of ['white', 'black']) store.db.prepare('INSERT INTO users VALUES (?,?,?,?,?)').run(id, id + '@test.com', id, 'unused', now)
    let service = new GamesService(store)
    const game = service.create('white', { timeControl: 'Blitz' })
    service.join('black', game.id)
    // Reproduce the previous version of the schema, including an existing active game.
    store.db.exec('DROP TABLE game_viewers; DROP TABLE spectator_comments; DROP TABLE game_messages; DROP TABLE demo_commissions; DROP TABLE demo_ledger; DROP TABLE demo_stakes; DROP TABLE demo_wallets; ALTER TABLE games DROP COLUMN white_seen_at; ALTER TABLE games DROP COLUMN black_seen_at; PRAGMA user_version = 1;')
    store.onModuleDestroy()
    store = new Store(); service = new GamesService(store)
    assert.equal(store.db.pragma('user_version', { simple: true }), 5)
    assert.equal(service.get('white', game.id).status, 'active')
    now = START + 4000; service.heartbeat('black', game.id)
    now = START + 6000
    const paused = service.get('black', game.id)
    assert.equal(paused.presence.w.reconnectDeadline, START + 56000)
    store.onModuleDestroy()
    now = START + 30000; store = new Store(); service = new GamesService(store)
    assert.equal(service.get('black', game.id).presence.w.reconnectDeadline, paused.presence.w.reconnectDeadline)
    now = START + 56000; service.sweep()
    assert.equal(service.get('black', game.id).winner, 'Black')
  } finally {
    if (store.db.open) store.onModuleDestroy()
    delete process.env.DATABASE_PATH
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()))
    rmSync(directory, { recursive: true, force: true })
  }
})
