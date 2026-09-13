import { Injectable } from '@nestjs/common'

@Injectable()
export class LiveMatchesService {
  findAll() {
    return [
      { id: 'live-1', tournament: 'Global Rapid Cup', white: 'Alex Mercer', black: 'Mira Knight', whiteRating: 1921, blackRating: 1842, timeControl: '10 + 5', viewers: 184, status: 'live', round: 'Round 1' },
      { id: 'live-2', tournament: 'European Masters', white: 'Rook Ritual', black: 'Endgame Eve', whiteRating: 1810, blackRating: 2012, timeControl: '15 + 10', viewers: 96, status: 'live', round: 'Round 3' },
      { id: 'live-3', tournament: 'Women\'s Grand Prix', white: 'Pawn Star', black: 'The Gambit', whiteRating: 1768, blackRating: 1888, timeControl: '5 + 3', viewers: 42, status: 'live', round: 'Round 2' },
    ]
  }

  findOne(id: string) { return this.findAll().find((match) => match.id === id) ?? null }
}
