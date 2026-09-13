import { BadRequestException, Body, Controller, Delete, Get, Param, Put, Req, UseGuards } from '@nestjs/common'
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator'
import { Chess } from 'chess.js'
import { AuthGuard, AuthRequest } from './auth/auth.guard'
import { Store } from './database'

class PreferencesDto {
  @IsIn(['Blitz', 'Rapid', 'Classical']) timeControl!: string
  @IsIn(['olive', 'walnut']) board!: string
  @IsBoolean() hints!: boolean
}
class SavedGameDto {
  @IsString() @MaxLength(50000) pgn!: string
  @IsIn(['computer', 'local']) mode!: string
  @IsIn(['Blitz', 'Rapid', 'Classical']) timeControl!: string
  @IsInt() @Min(0) @Max(86400000) w!: number
  @IsInt() @Min(0) @Max(86400000) b!: number
  @IsOptional() @IsString() @MaxLength(100) result?: string
}
@Controller('profile') @UseGuards(AuthGuard)
export class ProfileController {
  constructor(private readonly store: Store) {}
  @Get('preferences') preferences(@Req() req: AuthRequest) {
    const row = this.store.db.prepare('SELECT data FROM preferences WHERE user_id=?').get(req.user.id) as { data: string } | undefined
    return { preferences: row ? JSON.parse(row.data) : { timeControl: 'Blitz', board: 'olive', hints: true } }
  }
  @Put('preferences') savePreferences(@Req() req: AuthRequest, @Body() dto: PreferencesDto) {
    this.store.db.prepare('INSERT INTO preferences VALUES (?,?) ON CONFLICT(user_id) DO UPDATE SET data=excluded.data').run(req.user.id, JSON.stringify(dto))
    return { preferences: dto }
  }
  @Get('saved-games') saved(@Req() req: AuthRequest) {
    const rows = this.store.db.prepare('SELECT data FROM saved_games WHERE user_id=? ORDER BY updated_at DESC LIMIT 100').all(req.user.id) as { data: string }[]
    return { games: rows.map(row => JSON.parse(row.data)) }
  }
  @Put('saved-games/:id') save(@Req() req: AuthRequest, @Param('id') id: string, @Body() dto: SavedGameDto) {
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(id)) throw new BadRequestException('Invalid saved game ID')
    try { new Chess().loadPgn(dto.pgn) } catch { throw new BadRequestException('Invalid PGN') }
    const game = { ...dto, id, updatedAt: Date.now() }
    this.store.db.transaction(() => {
      this.store.db.prepare('INSERT INTO saved_games VALUES (?,?,?,?) ON CONFLICT(user_id,id) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at')
        .run(id, req.user.id, JSON.stringify(game), game.updatedAt)
      this.store.db.prepare('DELETE FROM saved_games WHERE user_id=? AND id NOT IN (SELECT id FROM saved_games WHERE user_id=? ORDER BY updated_at DESC LIMIT 100)').run(req.user.id, req.user.id)
    }).immediate()
    return { game }
  }
  @Delete('saved-games/:id') remove(@Req() req: AuthRequest, @Param('id') id: string) {
    this.store.db.prepare('DELETE FROM saved_games WHERE user_id=? AND id=?').run(req.user.id, id)
    return { ok: true }
  }
}
