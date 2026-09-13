import { BadRequestException, Body, ConflictException, Controller, Get, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit, Param, Post, Req, UseGuards } from '@nestjs/common'
import { IsIn, IsInt, IsOptional, Matches, Min, Max, IsDivisibleBy, IsString, MaxLength } from 'class-validator'
import { Chess } from 'chess.js'
import { randomUUID } from 'node:crypto'
import { AuthGuard, AuthRequest } from './auth/auth.guard'
import { Store } from './database'
import { DemoStakes } from './demo-stakes'

const controls = { Blitz: [300000, 3000], Rapid: [600000, 5000], Classical: [1800000, 0] } as const
export const HEARTBEAT_TIMEOUT_MS = 6000
export const RECONNECT_WINDOW_MS = 50000
export const VIEWER_TIMEOUT_MS = 15000
const spectatorReactions = ['Enjoying the game!', 'Good luck to both players!', 'Thanks for the game!']
class CreateGameDto {
  @IsIn(Object.keys(controls)) timeControl!: keyof typeof controls
}
class ChatDto {
  @IsString() @MaxLength(500) @Matches(/\S/) text!: string
}
class VersionDto {
  @IsInt() @Min(0) version!: number
}
class MatchDto extends CreateGameDto {
  @IsInt() @Min(100) @Max(10000) @IsDivisibleBy(20) stakeCents!: number
}
class MoveDto extends VersionDto {
  @Matches(/^[a-h][1-8]$/) from!: string
  @Matches(/^[a-h][1-8]$/) to!: string
  @IsOptional() @IsIn(['q', 'r', 'b', 'n']) promotion?: string
}
type GameRow = {
  id: string; white_id: string; black_id: string | null; white_name: string; black_name: string | null
  status: 'waiting' | 'active' | 'finished' | 'cancelled'; pgn: string; result: string | null; version: number
  clock_white: number; clock_black: number; increment_ms: number; last_move_at: number | null; created_at: number; updated_at: number
  white_seen_at: number | null; black_seen_at: number | null
}
const selectGame = `SELECT g.*, w.name white_name, b.name black_name FROM games g
  JOIN users w ON w.id = g.white_id LEFT JOIN users b ON b.id = g.black_id`
const boardFor = (row: GameRow) => { const board = new Chess(); if (row.pgn) board.loadPgn(row.pgn); return board }

@Injectable()
export class GamesService implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>
  private readonly logger = new Logger(GamesService.name)
  private readonly stakes: DemoStakes
  constructor(private readonly store: Store) { this.stakes = new DemoStakes(store) }
  wallet(user: string) { return this.store.db.transaction(() => this.stakes.wallet(user)).immediate() }
  match(user: string, dto: MatchDto) {
    return this.store.db.transaction(() => {
      this.sweep()
      const existing = this.store.db.prepare(selectGame + " JOIN demo_stakes s ON s.game_id=g.id WHERE (white_id=? OR black_id=?) AND g.status IN ('waiting','active')").get(user, user) as GameRow | undefined
      if (existing) return this.view(existing)
      const [clock, increment] = controls[dto.timeControl]
      const waiting = this.store.db.prepare(selectGame + " JOIN demo_stakes s ON s.game_id=g.id WHERE g.status='waiting' AND white_id!=? AND s.amount=? AND g.clock_white=? AND g.increment_ms=? AND g.updated_at>? ORDER BY g.created_at,g.id LIMIT 1").get(user, dto.stakeCents, clock, increment, Date.now() - HEARTBEAT_TIMEOUT_MS) as GameRow | undefined
      if (waiting) {
        this.stakes.transfer(user, waiting.id, -dto.stakeCents, 'stake')
        return this.join(user, waiting.id, true)
      }
      const game = this.create(user, dto)
      this.store.db.prepare('INSERT INTO demo_stakes(game_id,amount) VALUES (?,?)').run(game.id, dto.stakeCents)
      this.stakes.transfer(user, game.id, -dto.stakeCents, 'stake')
      return this.view(this.find(game.id))
    }).immediate()
  }
  onModuleInit() {
    this.sweep()
    this.timer = setInterval(() => {
      try { this.sweep() } catch (error) { this.logger.error('Could not settle game deadlines', error) }
    }, 500)
    this.timer.unref()
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer) }
  // A server-owned sweep settles games even when no clients are polling.
  sweep() {
    this.store.db.transaction(() => {
      const now = Date.now()
      const rows = this.store.db.prepare(selectGame + " WHERE g.status='active'").all() as GameRow[]
      rows.forEach(row => this.tick(row, now))
      const stale = this.store.db.prepare(selectGame + " JOIN demo_stakes s ON s.game_id=g.id WHERE g.status='waiting' AND g.updated_at<=?").all(now - 60000) as GameRow[]
      for (const row of stale) { row.status = 'cancelled'; row.updated_at = now; row.version++; this.save(row) }
    }).immediate()
  }
  private find(id: string) {
    const row = this.store.db.prepare(selectGame + ' WHERE g.id = ?').get(id) as GameRow | undefined
    if (!row) throw new NotFoundException('Game not found')
    return row
  }
  private member(row: GameRow, user: string) {
    if (row.white_id !== user && row.black_id !== user) throw new NotFoundException('Game not found')
  }
  private watchable(id: string) {
    const row = this.find(id)
    if (!row.black_id || !['active', 'finished'].includes(row.status)) throw new NotFoundException('This game is not available to watch')
    return row
  }
  watch(user: string, id: string) {
    const row = this.watchable(id)
    this.tick(row, Date.now())
    return this.view(row)
  }
  audience(user: string, id: string, heartbeat = false) {
    const row = this.find(id)
    const player = row.white_id === user || row.black_id === user
    if (!player) this.watchable(id)
    const now = Date.now()
    if (heartbeat && !player) this.store.db.prepare(`INSERT INTO game_viewers(game_id,user_id,seen_at) VALUES (?,?,?)
      ON CONFLICT(game_id,user_id) DO UPDATE SET seen_at=excluded.seen_at`).run(id, user, now)
    this.store.db.prepare('DELETE FROM game_viewers WHERE seen_at<=?').run(now - VIEWER_TIMEOUT_MS)
    const count = this.store.db.prepare('SELECT count(*) count FROM game_viewers WHERE game_id=? AND user_id!=? AND user_id!=?').get(id, row.white_id, row.black_id ?? '') as { count: number }
    const comments = this.store.db.prepare(`SELECT c.id,c.text,c.created_at createdAt,
      CASE WHEN ?='finished' THEN u.name ELSE 'Spectator' END name
      FROM spectator_comments c JOIN users u ON u.id=c.user_id WHERE c.game_id=? ORDER BY c.id DESC LIMIT 100`).all(row.status, id).reverse()
    return { count: count.count, comments, reactions: spectatorReactions, freeText: row.status === 'finished' }
  }
  comment(user: string, id: string, dto: ChatDto) {
    return this.store.db.transaction(() => {
      const row = this.watchable(id)
      if (row.white_id === user || row.black_id === user) throw new ConflictException('This comment area is for spectators')
      const text = dto.text.trim()
      // An allowlist also blocks obfuscated, multilingual and indirect move advice.
      if (row.status !== 'finished' && !spectatorReactions.includes(text)) throw new BadRequestException('Live games allow preset reactions only. Move advice and free-text comments are blocked until the game ends.')
      const now = Date.now()
      const last = this.store.db.prepare('SELECT created_at time FROM spectator_comments WHERE game_id=? AND user_id=? ORDER BY id DESC LIMIT 1').get(id, user) as { time: number } | undefined
      if (last && now - last.time < 5000) throw new ConflictException('Please wait five seconds before commenting again')
      this.store.db.prepare('INSERT INTO spectator_comments(game_id,user_id,text,created_at) VALUES (?,?,?,?)').run(id, user, text, now)
      this.store.db.prepare('DELETE FROM spectator_comments WHERE game_id=? AND id NOT IN (SELECT id FROM spectator_comments WHERE game_id=? ORDER BY id DESC LIMIT 100)').run(id, id)
      return this.audience(user, id, true)
    }).immediate()
  }
  messages(user: string, id: string) {
    this.member(this.find(id), user)
    return this.store.db.prepare(`SELECT m.id, m.user_id userId, u.name, m.text, m.created_at createdAt
      FROM game_messages m JOIN users u ON u.id=m.user_id WHERE m.game_id=? ORDER BY m.id DESC LIMIT 100`).all(id).reverse()
  }
  sendMessage(user: string, id: string, dto: ChatDto) {
    return this.store.db.transaction(() => {
      const row = this.find(id); this.member(row, user)
      if (!row.black_id || row.status === 'cancelled') throw new ConflictException('Chat opens when an opponent joins')
      const now = Date.now()
      const last = this.store.db.prepare('SELECT created_at time FROM game_messages WHERE game_id=? AND user_id=? ORDER BY id DESC LIMIT 1').get(id, user) as { time: number } | undefined
      if (last && now - last.time < 1000) throw new ConflictException('Please wait a moment before sending another message')
      this.store.db.prepare('INSERT INTO game_messages(game_id,user_id,text,created_at) VALUES (?,?,?,?)').run(id, user, dto.text.trim(), now)
      this.store.db.prepare('DELETE FROM game_messages WHERE game_id=? AND id NOT IN (SELECT id FROM game_messages WHERE game_id=? ORDER BY id DESC LIMIT 100)').run(id, id)
      return this.messages(user, id)
    }).immediate()
  }
  private expireFor(user: string) {
    const rows = this.store.db.prepare(selectGame + " WHERE (white_id=? OR black_id=?) AND g.status='active'").all(user, user) as GameRow[]
    const now = Date.now()
    rows.forEach(row => this.tick(row, now))
  }
  private save(row: GameRow) {
    this.store.db.prepare(`UPDATE games SET black_id=?,status=?,pgn=?,result=?,version=?,clock_white=?,clock_black=?,last_move_at=?,updated_at=?,white_seen_at=?,black_seen_at=? WHERE id=?`)
      .run(row.black_id, row.status, row.pgn, row.result, row.version, row.clock_white, row.clock_black, row.last_move_at, row.updated_at, row.white_seen_at, row.black_seen_at, row.id)
    this.stakes.settle(row)
  }
  private finish(row: GameRow, result: string, now: number) {
    row.status = 'finished'; row.result = result; row.updated_at = now; row.version++
    const board = boardFor(row)
    board.header('Result', result.startsWith('White wins') ? '1-0' : result.startsWith('Black wins') ? '0-1' : '1/2-1/2', 'Termination', result)
    row.pgn = board.pgn()
    this.save(row)
  }
  private tick(row: GameRow, now: number) {
    if (row.status !== 'active' || row.last_move_at === null) return
    const board = boardFor(row)
    const key = board.turn() === 'w' ? 'clock_white' : 'clock_black'
    const whiteDisconnect = row.white_seen_at! + HEARTBEAT_TIMEOUT_MS
    const blackDisconnect = row.black_seen_at! + HEARTBEAT_TIMEOUT_MS
    const firstDisconnect = Math.min(whiteDisconnect, blackDisconnect)
    // Stop charging the chess clock at the instant the first heartbeat lease expires.
    const clockUntil = Math.max(row.last_move_at, Math.min(now, firstDisconnect))
    const elapsed = clockUntil - row.last_move_at
    row[key] = Math.max(0, row[key] - elapsed)
    row.last_move_at = clockUntil
    if (row[key] === 0) {
      // Casual timeout rule: a player with only a king cannot win on time.
      const opponent = board.turn() === 'w' ? 'b' : 'w'
      const canWin = board.board().flat().some(piece => piece?.color === opponent && piece.type !== 'k')
      this.finish(row, canWin ? `${opponent === 'w' ? 'White' : 'Black'} wins on time` : 'Draw on time (opponent has only a king)', now)
      return
    }
    if (now >= firstDisconnect + RECONNECT_WINDOW_MS) {
      const result = whiteDisconnect === blackDisconnect ? 'Draw by mutual abandonment' : `${whiteDisconnect < blackDisconnect ? 'Black' : 'White'} wins by abandonment`
      this.finish(row, result, now)
    } else if (elapsed > 0) this.save(row)
  }
  private presence(row: GameRow, now: number) {
    const side = (seen: number | null) => {
      const disconnected = row.status === 'active' && seen !== null && now >= seen + HEARTBEAT_TIMEOUT_MS
      return { connected: row.status === 'active' && !disconnected,
        reconnectDeadline: disconnected ? seen! + HEARTBEAT_TIMEOUT_MS + RECONNECT_WINDOW_MS : null }
    }
    return { w: side(row.white_seen_at), b: side(row.black_seen_at) }
  }
  private view(row: GameRow, now = Date.now()) {
    const board = boardFor(row)
    const clocks = { w: row.clock_white, b: row.clock_black }
    const presence = this.presence(row, now)
    const paused = row.status === 'active' && (!presence.w.connected || !presence.b.connected)
    if (row.status === 'active' && row.last_move_at !== null) {
      const until = Math.min(now, row.white_seen_at! + HEARTBEAT_TIMEOUT_MS, row.black_seen_at! + HEARTBEAT_TIMEOUT_MS)
      clocks[board.turn()] = Math.max(0, clocks[board.turn()] - Math.max(0, until - row.last_move_at))
    }
    return { id: row.id, white: { id: row.white_id, name: row.white_name }, black: row.black_id ? { id: row.black_id, name: row.black_name } : null,
      status: row.status, pgn: row.pgn, fen: board.fen(), turn: board.turn(), result: row.result, version: row.version, stake: this.stakes.view(row.id),
      clocks, paused, presence, winner: row.result?.startsWith('White wins') ? 'White' : row.result?.startsWith('Black wins') ? 'Black' : null,
      incrementMs: row.increment_ms, serverTime: now, createdAt: row.created_at, updatedAt: row.updated_at }
  }
  create(user: string, dto: CreateGameDto) {
    return this.store.db.transaction(() => {
      this.expireFor(user)
      const count = this.store.db.prepare("SELECT count(*) n FROM games WHERE (white_id=? OR black_id=?) AND status IN ('waiting','active')").get(user, user) as { n: number }
      if (count.n >= 10) throw new ConflictException('Finish or cancel a game before creating another (limit 10)')
      const id = randomUUID(), now = Date.now(), [clock, increment] = controls[dto.timeControl]
      this.store.db.prepare(`INSERT INTO games (id,white_id,status,clock_white,clock_black,increment_ms,created_at,updated_at) VALUES (?,?,'waiting',?,?,?,?,?)`)
        .run(id, user, clock, clock, increment, now, now)
      return this.view(this.find(id), now)
    }).immediate()
  }
  list(user: string) {
    return this.store.db.transaction(() => {
      const now = Date.now()
      const mine = this.store.db.prepare(selectGame + " WHERE white_id=? OR black_id=? ORDER BY g.status IN ('waiting','active') DESC, g.updated_at DESC LIMIT 100").all(user, user) as GameRow[]
      mine.forEach(row => this.tick(row, now))
      const open = this.store.db.prepare(selectGame + " WHERE g.status='waiting' AND white_id != ? AND NOT EXISTS (SELECT 1 FROM demo_stakes s WHERE s.game_id=g.id) ORDER BY g.created_at DESC LIMIT 50").all(user) as GameRow[]
      const watch = this.store.db.prepare(selectGame + " WHERE g.status='active' AND white_id!=? AND black_id!=? ORDER BY g.created_at DESC LIMIT 50").all(user, user) as GameRow[]
      return { mine: mine.map(row => this.view(row, now)), open: open.map(row => this.view(row, now)), watch: watch.map(row => this.view(row, now)) }
    }).immediate()
  }
  get(user: string, id: string) {
    return this.store.db.transaction(() => {
      const row = this.find(id); this.member(row, user)
      this.tick(row, Date.now())
      return this.view(row)
    }).immediate()
  }
  heartbeat(user: string, id: string) {
    return this.store.db.transaction(() => {
      const row = this.find(id); this.member(row, user)
      const now = Date.now()
      // Settle before renewing: a late reconnect must never resurrect a finished game.
      this.tick(row, now)
      if (row.status === 'waiting' && this.stakes.view(row.id)) { row.updated_at = now; this.save(row) }
      if (row.status === 'active') {
        row[row.white_id === user ? 'white_seen_at' : 'black_seen_at'] = now
        // Any time spent waiting for reconnection is excluded from both chess clocks.
        row.last_move_at = now
        this.save(row)
      }
      return this.view(row, now)
    }).immediate()
  }
  join(user: string, id: string, matched = false) {
    return this.store.db.transaction(() => {
      this.expireFor(user)
      const row = this.find(id)
      if (this.stakes.view(id) && !matched) throw new ConflictException('Use stake matchmaking to join this game')
      if (row.black_id === user && row.status === 'active') return this.view(row)
      if (row.white_id === user) throw new ConflictException('You cannot join your own game')
      if (row.status !== 'waiting') throw new ConflictException('This game is no longer open')
      const count = this.store.db.prepare("SELECT count(*) n FROM games WHERE (white_id=? OR black_id=?) AND status IN ('waiting','active')").get(user, user) as { n: number }
      if (count.n >= 10) throw new ConflictException('Finish or cancel a game before joining another (limit 10)')
      row.black_id = user; row.status = 'active'; row.last_move_at = Date.now(); row.updated_at = row.last_move_at; row.version++
      row.white_seen_at = row.last_move_at; row.black_seen_at = row.last_move_at
      this.save(row)
      const joined = this.find(id), board = boardFor(joined)
      board.header('Event', 'mochess casual online', 'White', joined.white_name, 'Black', joined.black_name!, 'Result', '*')
      joined.pgn = board.pgn(); this.save(joined)
      return this.view(this.find(id))
    }).immediate()
  }
  move(user: string, id: string, dto: MoveDto) {
    return this.store.db.transaction(() => {
      const row = this.find(id); this.member(row, user)
      const now = Date.now(); this.tick(row, now)
      if (row.status === 'finished') return this.view(row, now)
      if (row.status !== 'active') throw new ConflictException('Game is not active')
      if (!this.presence(row, now).w.connected || !this.presence(row, now).b.connected) throw new ConflictException('Game paused while a player reconnects')
      if (row.version !== dto.version) throw new ConflictException('Position changed. Refresh the game and try again')
      const board = boardFor(row), turn = board.turn()
      if ((turn === 'w' ? row.white_id : row.black_id) !== user) throw new ConflictException('Wait for your turn')
      try { board.move({ from: dto.from, to: dto.to, promotion: dto.promotion }) } catch { throw new BadRequestException('Illegal move') }
      const key = turn === 'w' ? 'clock_white' : 'clock_black'
      row[key] = Math.max(0, row[key] - Math.max(0, now - row.last_move_at!)) + row.increment_ms
      row.last_move_at = now; row.updated_at = now; row.version++; row.pgn = board.pgn()
      if (board.isCheckmate()) { row.status = 'finished'; row.result = `${turn === 'w' ? 'White' : 'Black'} wins by checkmate` }
      else if (board.isDraw()) {
        row.status = 'finished'
        row.result = board.isStalemate() ? 'Draw by stalemate' : board.isInsufficientMaterial() ? 'Draw by insufficient material' : board.isThreefoldRepetition() ? 'Draw by repetition' : 'Draw by the fifty-move rule'
      }
      if (row.result) {
        board.header('Result', row.result.startsWith('White wins') ? '1-0' : row.result.startsWith('Black wins') ? '0-1' : '1/2-1/2', 'Termination', row.result)
        row.pgn = board.pgn()
      }
      this.save(row)
      return this.view(row, now)
    }).immediate()
  }
  end(user: string, id: string, dto: VersionDto, cancel: boolean) {
    return this.store.db.transaction(() => {
      const row = this.find(id); this.member(row, user)
      this.tick(row, Date.now())
      if (row.status === 'finished' || row.status === 'cancelled') return this.view(row)
      if (row.version !== dto.version) throw new ConflictException('Position changed. Refresh the game and try again')
      if (cancel) {
        if (row.status !== 'waiting') throw new ConflictException('Only waiting games can be cancelled')
        row.status = 'cancelled'; row.version++; row.updated_at = Date.now(); this.save(row)
      } else {
        if (row.status !== 'active') throw new ConflictException('Game is not active')
        this.finish(row, `${row.white_id === user ? 'Black' : 'White'} wins by resignation`, Date.now())
      }
      return this.view(row)
    }).immediate()
  }
}

@Controller('games') @UseGuards(AuthGuard)
export class GamesController {
  constructor(private readonly games: GamesService) {}
  @Get() list(@Req() req: AuthRequest) { return this.games.list(req.user.id) }
  @Get('demo-wallet') wallet(@Req() req: AuthRequest) { return this.games.wallet(req.user.id) }
  @Get(':id/watch') watch(@Req() req: AuthRequest, @Param('id') id: string) { return { game: this.games.watch(req.user.id, id) } }
  @Get(':id/audience') audience(@Req() req: AuthRequest, @Param('id') id: string) { return this.games.audience(req.user.id, id) }
  @Post(':id/audience') viewing(@Req() req: AuthRequest, @Param('id') id: string) { return this.games.audience(req.user.id, id, true) }
  @Post(':id/comments') comment(@Req() req: AuthRequest, @Param('id') id: string, @Body() dto: ChatDto) { return this.games.comment(req.user.id, id, dto) }
  @Get(':id/messages') messages(@Req() req: AuthRequest, @Param('id') id: string) { return { messages: this.games.messages(req.user.id, id) } }
  @Post(':id/messages') sendMessage(@Req() req: AuthRequest, @Param('id') id: string, @Body() dto: ChatDto) { return { messages: this.games.sendMessage(req.user.id, id, dto) } }
  @Post('match') match(@Req() req: AuthRequest, @Body() dto: MatchDto) { return { game: this.games.match(req.user.id, dto) } }
  @Post() create(@Req() req: AuthRequest, @Body() dto: CreateGameDto) { return { game: this.games.create(req.user.id, dto) } }
  @Get(':id') get(@Req() req: AuthRequest, @Param('id') id: string) { return { game: this.games.get(req.user.id, id) } }
  @Post(':id/heartbeat') heartbeat(@Req() req: AuthRequest, @Param('id') id: string) { return { game: this.games.heartbeat(req.user.id, id) } }
  @Post(':id/join') join(@Req() req: AuthRequest, @Param('id') id: string) { return { game: this.games.join(req.user.id, id) } }
  @Post(':id/moves') move(@Req() req: AuthRequest, @Param('id') id: string, @Body() dto: MoveDto) { return { game: this.games.move(req.user.id, id, dto) } }
  @Post(':id/resign') resign(@Req() req: AuthRequest, @Param('id') id: string, @Body() dto: VersionDto) { return { game: this.games.end(req.user.id, id, dto, false) } }
  @Post(':id/cancel') cancel(@Req() req: AuthRequest, @Param('id') id: string, @Body() dto: VersionDto) { return { game: this.games.end(req.user.id, id, dto, true) } }
}
