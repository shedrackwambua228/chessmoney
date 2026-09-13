import { useEffect, useRef, useState } from 'react'
import { api } from './api'
import './chat.css'

type Message = { id: number; userId: string; name: string; text: string; createdAt: number }
export default function GameChat({ gameId, userId, enabled = false, explanation = 'Chat with your opponent when you play an online game.' }: {
  gameId?: string; userId?: string; enabled?: boolean; explanation?: string
}) {
  const [messages, setMessages] = useState<Message[]>([])
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [offline, setOffline] = useState(false)
  const list = useRef<HTMLDivElement>(null)
  const merge = (incoming: Message[]) => setMessages(previous => [...new Map([...previous, ...incoming].map(message => [message.id, message])).values()].sort((a, b) => a.id - b.id).slice(-100))
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
        const data = await api<{ messages: Message[] }>(`/games/${gameId}/messages`, { signal: request.signal })
        if (!abort.signal.aborted) { merge(data.messages); setOffline(false) }
      } catch { if (!abort.signal.aborted) setOffline(true) }
      finally {
        clearTimeout(timeout); abort.signal.removeEventListener('abort', cancel)
        if (!abort.signal.aborted) timer = setTimeout(poll, 1500)
      }
    }
    void poll()
    return () => { abort.abort(); clearTimeout(timer) }
  }, [gameId])
  useEffect(() => { if (list.current) list.current.scrollTop = list.current.scrollHeight }, [messages[messages.length - 1]?.id])
  async function send(text: string) {
    if (!gameId || !enabled || sending || !text.trim()) return
    setSending(true); setError('')
    try {
      const data = await api<{ messages: Message[] }>(`/games/${gameId}/messages`, { method: 'POST', body: JSON.stringify({ text: text.trim() }) })
      merge(data.messages); setDraft(''); setOffline(false)
    } catch (err) { setError(err instanceof Error ? err.message : 'Message could not be sent. Try again.') }
    finally { setSending(false) }
  }
  return <aside className="game-chat" aria-label="Opponent chat">
    <h2>Opponent chat</h2>
    <div className="chat-messages" ref={list} role="log" aria-label="Chat messages" aria-live="polite">
      {!messages.length && <p className="chat-empty">{enabled ? 'Say hello to your opponent. Keep it friendly!' : explanation}</p>}
      {messages.map(message => <div className={`chat-message ${message.userId === userId ? 'chat-own' : ''}`} key={message.id}>
        <div><strong>{message.userId === userId ? 'You' : message.name}</strong><time dateTime={new Date(message.createdAt).toISOString()}>{new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time></div>
        <p>{message.text}</p>
      </div>)}
    </div>
    {offline && <p className="chat-note" role="status">Chat disconnected. Reconnecting...</p>}
    {error && <p className="chat-note" role="alert">{error}</p>}
    <div className="chat-quick">{['Good luck!', 'Well played!', 'Good game!'].map(text => <button type="button" disabled={!enabled || sending || offline} key={text} onClick={() => void send(text)}>{text}</button>)}</div>
    <form onSubmit={event => { event.preventDefault(); void send(draft) }}>
      <label className="chat-note" htmlFor="chat-message">Message your opponent</label>
      <textarea id="chat-message" value={draft} maxLength={500} rows={2} disabled={!enabled || sending} onChange={event => setDraft(event.target.value)} placeholder={enabled ? 'Type a message...' : 'Online opponents only'} />
      <button type="submit" disabled={!enabled || sending || offline || !draft.trim()}>{sending ? 'Sending...' : 'Send message'}</button>
    </form>
  </aside>
}
