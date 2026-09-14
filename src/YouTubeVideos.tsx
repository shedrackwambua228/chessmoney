import { useEffect, useState } from 'react'

type Video = { id: string; title: string; channel: string; publishedAt: string; thumbnail: string; url: string }
type Response = { videos: Video[]; configured: boolean }

export default function YouTubeVideos() {
  const [result, setResult] = useState<Response | null>(null)
  const [playing, setPlaying] = useState<Video | null>(null)
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
  return <section className="surface video-section"><span className="section-kicker">LIVE FROM THE PROS</span><h2>Live from the Pros</h2>{playing && <div className="video-player"><iframe src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(playing.id)}?autoplay=1&rel=0`} title={playing.title} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen /><button type="button" className="video-close" onClick={() => setPlaying(null)}>Close video</button></div>}<div className="video-grid">{result.videos.map(video => <button key={video.id} type="button" className="video-card" onClick={() => setPlaying(video)} aria-label={`Play ${video.title}`}><img src={video.thumbnail} alt="" /><span>{video.channel}</span><strong>{video.title}</strong><small>{video.publishedAt ? new Date(video.publishedAt).toLocaleDateString() : 'Recent upload'}</small></button>)}</div></section>
}
