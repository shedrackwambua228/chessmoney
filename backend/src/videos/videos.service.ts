import { Injectable } from '@nestjs/common'

type YouTubeItem = { id?: { videoId?: unknown }; snippet?: { title?: unknown; channelTitle?: unknown; publishedAt?: unknown; thumbnails?: { medium?: { url?: unknown }; high?: { url?: unknown } } } }
type Video = { id: string; title: string; channel: string; publishedAt: string; thumbnail: string; url: string }

@Injectable()
export class VideosService {
  private cached: { expiresAt: number; videos: Video[] } | null = null

  async recentChessCompetitions() {
    if (this.cached && this.cached.expiresAt > Date.now()) return { videos: this.cached.videos, configured: true }
    const key = process.env.YOUTUBE_API_KEY
    if (!key) return { videos: [], configured: false }
    const url = new URL('https://www.googleapis.com/youtube/v3/search')
    url.search = new URLSearchParams({ part: 'snippet', q: 'chess tournament highlights', type: 'video', order: 'date', maxResults: '6', key }).toString()
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(5000) })
      if (!response.ok) return { videos: [], configured: true }
      const body = await response.json() as { items?: YouTubeItem[] }
      const videos = (body.items ?? []).flatMap(item => {
        const id = typeof item.id?.videoId === 'string' ? item.id.videoId : null
        const title = typeof item.snippet?.title === 'string' ? item.snippet.title : null
        const thumbnail = item.snippet?.thumbnails?.high?.url ?? item.snippet?.thumbnails?.medium?.url
        if (!id || !title || typeof thumbnail !== 'string') return []
        return [{ id, title, thumbnail, channel: typeof item.snippet?.channelTitle === 'string' ? item.snippet.channelTitle : 'YouTube', publishedAt: typeof item.snippet?.publishedAt === 'string' ? item.snippet.publishedAt : '', url: `https://www.youtube.com/watch?v=${encodeURIComponent(id)}` }]
      })
      this.cached = { videos, expiresAt: Date.now() + 5 * 60_000 }
      return { videos, configured: true }
    } catch { return { videos: [], configured: true } }
  }
}
