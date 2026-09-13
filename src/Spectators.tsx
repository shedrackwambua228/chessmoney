import { useEffect, useRef, useState } from 'react'
import { api } from './api'
import './spectators.css'

type Audience = { count: number; freeText: boolean; reactions: string[]; comments: { id: number; name: string; text: string; createdAt: number }[] }
export default function Spectators({ gameId, watching = false }: { gameId?: string; watching?: boolean }) {
  const [audience, setAudience] = useState<Audience | null>(null)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState('')
  const [offline, setOffline] = useState(false)
  const [busy, setBusy] = useState(false)
  const list = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!gameId) return
    const abort = new AbortController()
    let timer: ReturnType<typeof setTimeout>
    async function poll() {
      const request = new AbortController()
      const cancel = () => request.abort()
      abort.signal.addEventListener('abort', cancel, { once: true })
      const timeout = setTimeout(cancel, 5000)
      try {
        const data = await api<Audience>(`/games/${gameId}/audience`, { method: watching ? 'POST' : 'GET', signal: request.signal })
        if (!abort.signal.aborted) { setAudience(data); setOffline(false) }
      } catch { if (!abort.signal.aborted) setOffline(true) }
      finally {
        clearTimeout(timeout); abort.signal.removeEventListener('abort', cancel)
        if (!abort.signal.aborted) timer = setTimeout(poll, 2500)
      }
    }
    void poll()
    return () => { abort.abort(); clearTimeout(timer) }
  }, [gameId, watching])
  const lastId = audience?.comments[audience.comments.length - 1]?.id
  useEffect(() => { if (list.current) list.current.scrollTop = list.current.scrollHeight }, [lastId])
  async function send(text: string) {
    if (!text.trim() || busy || !gameId) return
    setBusy(true); setError('')
    try {
      await api(`/games/${gameId}/comments`, { method: 'POST', body: JSON.stringify({ text }) })
      setDraft('')
    } catch (err) { setError(err instanceof Error ? err.message : 'Comment could not be sent.') }
    finally { setBusy(false) }
  }
  return <section className="spectators" aria-label="Spectators">
    <h3>Spectators <span>{offline ? 'Reconnecting...' : audience ? `${audience.count} watching` : gameId ? 'Loading...' : '0 watching'}</span></h3>
    {!gameId ? <p>Play online to let people watch and react to your game.</p> : <>
      <p>{audience?.freeText ? 'The game has ended. Spectators can now discuss the moves.' : 'Live comments are limited to preset reactions. Move advice and other text are blocked until the game ends.'}</p>
      <div ref={list} className="spectator-comments" role="log" aria-label="Spectator comments">
        {!audience?.comments.length && <p>No comments yet.</p>}
        {audience?.comments.map(comment => <div key={comment.id}><strong>{comment.name}</strong><p>{comment.text}</p></div>)}
      </div>
      {watching && (audience?.freeText ? <form onSubmit={event => { event.preventDefault(); void send(draft) }}>
        <label>Comment on the game<textarea value={draft} onChange={event => setDraft(event.target.value)} maxLength={500} rows={2} disabled={busy} /></label>
        <button disabled={busy || offline || !draft.trim()}>Post comment</button>
      </form> : <div className="spectator-reactions">{audience?.reactions.map(text => <button key={text} disabled={busy || offline} onClick={() => void send(text)}>{text}</button>)}</div>)}
      {error && <p role="alert">{error}</p>}
    </>}
  </section>
}
