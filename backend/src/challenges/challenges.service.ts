import { Injectable } from '@nestjs/common'

@Injectable()
export class ChallengesService {
  private readonly challenges = [
    { id: 'challenge-mira', opponent: 'Mira Knight', rating: 1842, stakeCents: 2500, timeControl: '10 + 5', status: 'open' },
    { id: 'challenge-pawn', opponent: 'Pawn Star', rating: 1768, stakeCents: 1000, timeControl: '5 + 3', status: 'open' },
    { id: 'challenge-rook', opponent: 'Rook Ritual', rating: 1810, stakeCents: 5000, timeControl: '15 + 10', status: 'open' },
  ]

  findAll(minStake = 0, maxStake = Number.MAX_SAFE_INTEGER, minRating = 0, maxRating = 9999) {
    return this.challenges.filter((challenge) => challenge.status === 'open' && challenge.stakeCents >= minStake && challenge.stakeCents <= maxStake && challenge.rating >= minRating && challenge.rating <= maxRating)
  }
}
