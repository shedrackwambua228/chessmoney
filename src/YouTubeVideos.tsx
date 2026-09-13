import { useEffect, useState } from 'react'

type Video = { id: string; title: string; channel: string; publishedAt: string; thumbnail: string; url: string }
type Response = { videos: Video[]; configured: boolean }

export default function YouTubeVideos() {
  const [result, setResult] = useState<Response | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/videos/recent-chess-competitions', { signal: controller.signal })
      .then(response => response.ok ? response.json() as Promise<Response> : Promise.reject())
      .then(setResult)
      .catch(() => setResult({ videos: [], configured: true }))
    return () => controller.abort()
  }, [])
  if (!result) return <section className="surface video-section" aria-busy="true"><span className="section-kicker">LIVE FROM THE PROS</span><h2>Live from the Pros</h2><p className="muted">Loading recent videos…</p></section>
  if (!result.configured) return <section className="surface video-section"><span className="section-kicker">LIVE FROM THE PROS</span><h2>Live from the Pros</h2><p className="muted">Video highlights will appear once the YouTube API key is configured.</p></section>
  if (!result.videos.length) return <section className="surface video-section"><span className="section-kicker">LIVE FROM THE PROS</span><h2>Live from the Pros</h2><p className="muted">Recent competition videos are unavailable right now. Please try again later.</p></section>
  return <section className="surface video-section"><span className="section-kicker">LIVE FROM THE PROS</span><h2>Live from the Pros</h2><div className="video-grid">{result.videos.map(video => <a key={video.id} className="video-card" href={video.url} target="_blank" rel="noreferrer"><img src={video.thumbnail} alt="" /><span>{video.channel}</span><strong>{video.title}</strong><small>{video.publishedAt ? new Date(video.publishedAt).toLocaleDateString() : 'Recent upload'}</small></a>)}</div></section>
}
