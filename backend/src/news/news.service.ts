import { Injectable } from '@nestjs/common'

@Injectable()
export class NewsService {
  findAll() {
    return [
      { id: 'news-1', category: 'TOURNAMENT', title: 'World Championship candidates announced', summary: 'The strongest challengers prepare for a new chapter in the title race.', publishedAt: '2026-09-04T09:00:00.000Z', source: 'mochess newsroom' },
      { id: 'news-2', category: 'EVENT', title: 'Global Rapid Cup begins this weekend', summary: 'Follow the schedule, pairings, and live boards from round one.', publishedAt: '2026-09-03T14:30:00.000Z', source: 'mochess events' },
      { id: 'news-3', category: 'CHESS NEWS', title: 'The opening trends shaping elite play', summary: 'A look at the positions grandmasters are choosing in 2026.', publishedAt: '2026-09-02T11:15:00.000Z', source: 'mochess analysis' },
    ]
  }

  findEvents() {
    return [
      { id: 'event-1', name: 'Global Rapid Cup', location: 'Singapore', startsAt: '2026-09-06T08:00:00.000Z', rounds: 9, status: 'upcoming' },
      { id: 'event-2', name: 'European Masters', location: 'Prague', startsAt: '2026-09-12T10:00:00.000Z', rounds: 11, status: 'upcoming' },
      { id: 'event-3', name: 'Women\'s Grand Prix', location: 'Tbilisi', startsAt: '2026-09-18T09:00:00.000Z', rounds: 10, status: 'upcoming' },
    ]
  }
}
