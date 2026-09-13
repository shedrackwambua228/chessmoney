import { useEffect, useState, type FormEvent } from 'react'
import { Chess, type Square } from 'chess.js'
import ChessBoard, { PieceImage } from './ChessBoard'
import Modal from './Modal'
import GameReview from './GameReview'
import GameChat from './GameChat'
import Spectators from './Spectators'
import { api, ApiError } from './api'
import { downloadPgn, gameRecords, preferences, type GameRecord } from './storage'
import './online.css'

type User = { id: string; name: string; email: string }
type OnlineGame = {
  stake: { amount: number; commissionPerPlayer: number; winnerPayout: number; settled: boolean; currency: 'DEMO' } | null
  id: string; white: { id: string; name: string }; black: { id: string; name: string } | null
  status: 'waiting' | 'active' | 'finished' | 'cancelled'; pgn: string; fen: string; turn: 'w' | 'b'
  version: number; result: string | null; clocks: { w: number; b: number }; incrementMs: number
  paused: boolean; winner: 'White' | 'Black' | null; serverTime: number; receivedAt?: number
  presence: Record<'w' | 'b', { connected: boolean; reconnectDeadline: number | null }>
}
const received = (game: OnlineGame): OnlineGame => ({ ...game, receivedAt: performance.now() })
type Lobby = { mine: OnlineGame[]; open: OnlineGame[]; watch: OnlineGame[] }
type Wallet = { balance: number; ledger: { gameId: string | null; kind: string; amount: number; createdAt: number }[] }
const credits = (cents: number) => `$${(cents / 100).toFixed(2)} demo`
const clock = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms % 60000 / 1000)).padStart(2, '0')}`

export default function Online({ onAnalyze }: { onAnalyze: (pgn: string) => void }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [register, setRegister] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [lobby, setLobby] = useState<Lobby>({ mine: [], open: [], watch: [] })
  const [current, setCurrent] = useState<OnlineGame | null>(null)
  const [selected, setSelected] = useState<Square | null>(null)
  const [promotion, setPromotion] = useState<{ from: Square; to: Square } | null>(null)
  const [resign, setResign] = useState(false)
  const [pace, setPace] = useState('Blitz')
  const [stake, setStake] = useState('10')
  const [wallet, setWallet] = useState<Wallet | null>(null)
  const [cloud, setCloud] = useState<GameRecord[]>([])
  const [connected, setConnected] = useState(true)
  const [displayTime, setDisplayTime] = useState(() => performance.now())
  useEffect(() => {
    const abort = new AbortController()
    api<{ user: User }>('/auth/me', { signal: abort.signal }).then(data => setUser(data.user)).catch(err => {
      if (!abort.signal.aborted && !(err instanceof ApiError && err.status === 401)) setError('Cannot reach the server. Start the API and refresh this page.')
    }).finally(() => { if (!abort.signal.aborted) setLoading(false) })
    return () => abort.abort()
  }, [])
  const watching = !!current && current.white.id !== user?.id && current.black?.id !== user?.id
  const currentId = current?.id
  useEffect(() => { if (currentId) window.scrollTo(0, 0) }, [currentId])
  useEffect(() => {
    if (!user) return
    const abort = new AbortController()
    let timer: ReturnType<typeof setTimeout>
    async function poll() {
      const requestAbort = new AbortController()
      const cancel = () => requestAbort.abort()
      abort.signal.addEventListener('abort', cancel, { once: true })
      // A stalled network request must not prevent subsequent reconnect attempts.
      const timeout = setTimeout(cancel, 4000)
      try {
        if (currentId) {
          const { game } = await api<{ game: OnlineGame }>(`/games/${currentId}/${watching ? 'watch' : 'heartbeat'}`, { method: watching ? 'GET' : 'POST', signal: requestAbort.signal })
          if (!abort.signal.aborted) setCurrent(previous => previous?.id === game.id && previous.version <= game.version && previous.serverTime <= game.serverTime ? received(game) : previous)
        } else {
          const data = await api<Lobby>('/games', { signal: requestAbort.signal })
          if (!abort.signal.aborted) setLobby({ mine: data.mine.map(received), open: data.open.map(received), watch: data.watch.map(received) })
        }
        const balance = await api<Wallet>('/games/demo-wallet', { signal: requestAbort.signal })
        if (!abort.signal.aborted) { setWallet(balance); setConnected(true) }
      } catch (err) {
        if (!abort.signal.aborted) {
          setConnected(false)
          if (err instanceof ApiError && err.status === 401) { setUser(null); setCurrent(null); setError('Your session expired. Please sign in again.') }
        }
      } finally {
        clearTimeout(timeout); abort.signal.removeEventListener('abort', cancel)
        if (!abort.signal.aborted) timer = setTimeout(poll, 1500)
      }
    }
    void poll()
    return () => { abort.abort(); clearTimeout(timer) }
  }, [user, currentId, watching])
  useEffect(() => { setSelected(null); setPromotion(null) }, [current?.version, currentId])
  useEffect(() => {
    if (!current?.paused) return
    setDisplayTime(performance.now())
    const timer = setInterval(() => setDisplayTime(performance.now()), 250)
    return () => clearInterval(timer)
  }, [current?.paused, currentId])

  async function run(work: () => Promise<void>) {
    if (busy) return
    setBusy(true); setError(''); setNotice('')
    try { await work() } catch (err) { setError(err instanceof Error ? err.message : 'Something went wrong. Try again.') }
    finally { setBusy(false) }
  }
  function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    void run(async () => {
      const body = { email: form.get('email'), password: form.get('password'), ...(register ? { name: form.get('name') } : {}) }
      const result = await api<{ user: User }>(`/auth/${register ? 'register' : 'login'}`, { method: 'POST', body: JSON.stringify(body) })
      setUser(result.user); setCloud([]); setCurrent(null)
    })
  }
  function command(path: string, body?: unknown) {
    void run(async () => {
      const { game } = await api<{ game: OnlineGame }>(path, { method: 'POST', body: JSON.stringify(body ?? {}) })
      setCurrent(previous => previous?.id === game.id && previous.serverTime > game.serverTime ? previous : received(game)); setSelected(null); setPromotion(null); setResign(false)
    })
  }
  const board = new Chess()
  if (current?.pgn) board.loadPgn(current.pgn)
  const color = watching || current?.white.id === user?.id ? 'w' : 'b'
  const canMove = !watching && current?.status === 'active' && !current.paused && current.turn === color && connected && !busy
  const serverNow = current ? current.serverTime + Math.max(0, displayTime - (current.receivedAt ?? displayTime)) : 0
  function squareClicked(square: Square) {
    if (!canMove || !current) return
    const piece = board.get(square)
    if (piece?.color === color) { setSelected(square); return }
    if (!selected) return
    const legal = board.moves({ square: selected, verbose: true }).filter(move => move.to === square)
    if (!legal.length) { setSelected(null); return }
    if (legal.some(move => move.promotion)) { setPromotion({ from: selected, to: square }); return }
    command(`/games/${current.id}/moves`, { from: selected, to: square, version: current.version })
  }
  if (loading) return <p role="status">Connecting to your chess account…</p>
  return <section className="online-section">
    {error && <p role="alert" className="storage-notice">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {!user ? <form className="surface account-form" onSubmit={signIn}>
      <h2>{register ? 'Create your chess account' : 'Welcome back'}</h2>
      <p>Play people online and keep a copy of your practice games in your account.</p>
      {register && <label>Player name<input name="name" required minLength={2} maxLength={32} autoComplete="nickname" /></label>}
      <label>Email<input name="email" type="email" required maxLength={254} autoComplete="email" /></label>
      <label>Password<input name="password" type="password" required minLength={10} maxLength={128} autoComplete={register ? 'new-password' : 'current-password'} /></label>
      <small>Use at least 10 characters.</small>
      <button className="primary-action" disabled={busy}>{busy ? 'Please wait…' : register ? 'Create account' : 'Sign in'}</button>
      <button className="secondary-action" type="button" disabled={busy} onClick={() => { setRegister(value => !value); setError('') }}>{register ? 'Already registered? Sign in' : 'Create an account'}</button>
    </form> : <>
      <div className="online-toolbar"><strong>Playing as {user.name}</strong><button disabled={busy} onClick={() => void run(async () => { await api('/auth/logout', { method: 'POST' }); setUser(null); setCurrent(null); setCloud([]); setLobby({ mine: [], open: [], watch: [] }) })}>Sign out</button></div>
      {!connected && <p className="storage-notice" role="status">Connection lost. Reconnecting… Return within 50 seconds of the server detecting the disconnect to avoid losing by abandonment.</p>}
      {current ? <>
        <button className="secondary-action" disabled={busy} onClick={() => { setCurrent(null); setResign(false) }}>Back to online lobby</button>
        {current.paused && <div className="storage-notice" role="status">
          <strong>Game paused. Waiting for reconnection.</strong>
          {(['w', 'b'] as const).map(side => {
            const deadline = current.presence[side].reconnectDeadline
            return deadline === null ? null : <p key={side}>{side === 'w' ? 'White' : 'Black'} disconnected. Reconnect in {Math.max(0, Math.ceil((deadline - serverNow) / 1000))}s or {side === 'w' ? 'Black' : 'White'} wins by abandonment.</p>
          })}
        </div>}
        <div className="online-game"><div>
          <div className="play-player"><strong>{color === 'w' ? current.black?.name ?? 'Waiting for an opponent' : current.white.name}</strong><span className="play-clock">{clock(current.clocks[color === 'w' ? 'b' : 'w'])}</span></div>
          <ChessBoard game={board} selected={selected} flipped={color === 'b'} onSquare={squareClicked} label="Online chessboard" />
          <div className="play-player"><strong>{watching ? current.white.name : user.name} · {color === 'w' ? 'White' : 'Black'}</strong><span className="play-clock">{clock(current.clocks[color])}</span></div>
        </div><div className="surface online-details"><Spectators key={current.id} gameId={current.id} watching={watching} />
          {current.stake && <div className="surface online-details" role="status"><strong>Demo stake: {credits(current.stake.amount)} each</strong><p>Commission: {credits(current.stake.commissionPerPlayer)} per player (5%). Winner receives {credits(current.stake.winnerPayout)}.</p><p>{current.stake.settled ? current.winner ? `${current.winner} received the prize. Commission recorded.` : 'Stake refunded in full.' : current.status === 'waiting' ? 'Finding a player with the same stake and time control. Keep this screen open. Cancel anytime for a full refund.' : 'Stakes reserved until the game ends. A draw refunds both players in full.'}</p><small>Demo credits have no cash value. {wallet && `Available: ${credits(wallet.balance)}`}</small></div>}
          <h2>{current.result ?? (current.status === 'waiting' ? 'Waiting for an opponent' : current.status === 'cancelled' ? 'Game cancelled' : current.paused ? 'Waiting for reconnection' : watching ? 'Watching live' : current.turn === color ? 'Your turn' : 'Opponent’s turn')}</h2>
          <p>{current.status === 'waiting' && current.stake ? 'Your stake is reserved while we find an opponent with the same stake and time control.' : current.status === 'waiting' ? 'Your game is listed in the online lobby. Ask a friend to sign in on another browser or device and join.' : 'Keep this game open while playing. If a player disconnects, clocks pause and they have 50 seconds to return before losing by abandonment.'}</p>
          <p>{watching ? 'You are watching this game.' : `You are playing ${color === 'w' ? 'White' : 'Black'}.`} Increment: {current.incrementMs / 1000} seconds.</p>
          <div className="online-moves">{board.history().map((move, index) => <span key={index}>{index % 2 === 0 ? `${index / 2 + 1}. ` : ''}{move} </span>)}</div>
          {current.status === 'waiting' && <button className="secondary-action" disabled={busy} onClick={() => command(`/games/${current.id}/cancel`, { version: current.version })}>Cancel game</button>}
          {!watching && current.status === 'active' && <button className="secondary-action" disabled={busy} onClick={() => setResign(true)}>Resign</button>}
          {current.status === 'finished' && <GameReview pgn={current.pgn} onAnalyze={() => onAnalyze(current.pgn)} />}
          <button className="secondary-action" onClick={() => downloadPgn(current.pgn)}>Download PGN</button>
        </div><GameChat key={current.id} gameId={watching ? undefined : current.id} userId={user.id} enabled={!watching && !!current.black && current.status !== 'cancelled'} explanation={watching ? "Opponent chat is private. Use the spectator panel to react." : "Chat opens when your opponent joins."} /></div>
      </> : <>
        <div className="surface online-create">
          <h2>Play for demo stakes</h2><p>Start with $100 demo credits. No deposits or withdrawals; credits have no cash value.</p>
          <strong>Available: {wallet ? credits(wallet.balance) : 'Loading…'}</strong>
          <label>Stake per player (demo dollars)<input type="number" min="1" max="100" step="0.20" value={stake} onChange={event => setStake(event.target.value)} /></label>
          <label>Time control<select value={pace} onChange={event => setPace(event.target.value)}><option>Blitz</option><option>Rapid</option><option>Classical</option></select></label>
          <p>Each player pays 5% commission. At $10 each, commission is $0.50 each and the winner gets $19 demo. Draws and cancelled searches receive a full refund.</p>
          <button className="primary-action" disabled={busy || !connected || !wallet || !Number.isFinite(Number(stake)) || Number(stake) < 1 || Number(stake) > 100 || Math.abs(Number(stake) * 100 - Math.round(Number(stake) * 100)) > 0.00001 || Math.round(Number(stake) * 100) % 20 !== 0 || Math.round(Number(stake) * 100) > wallet.balance} onClick={() => command('/games/match', { timeControl: pace, stakeCents: Math.round(Number(stake) * 100) })}>Stake {credits(Math.round(Number(stake || 0) * 100))} &amp; find opponent</button>
          <small>Stakes from $1 to $100 in $0.20 increments. Leaving a search for 60 seconds cancels it and refunds your stake.</small>
          {wallet && <details><summary>Demo credit history</summary>{wallet.ledger.map((entry, index) => <p key={index}>{entry.kind}: {credits(entry.amount)} · {new Date(entry.createdAt).toLocaleString()}</p>)}</details>}
        </div>
        <div className="surface online-create"><h2>Find your next opponent</h2><p>Create a game as White or join an open game as Black. All games are free and unrated.</p><label>Time control<select value={pace} onChange={event => setPace(event.target.value)}><option value="Blitz">Blitz · 5 + 3</option><option value="Rapid">Rapid · 10 + 5</option><option value="Classical">Classical · 30 + 0</option></select></label><button className="primary-action" disabled={busy || !connected} onClick={() => command('/games', { timeControl: pace })}>Create online game</button></div>
        <div className="online-lists">{([['Open games', lobby.open], ['Your online games', lobby.mine], ['Watch live games', lobby.watch]] as const).map(([title, games]) => <div className="surface" key={title}><h2>{title}</h2>{!games.length && <p>No games yet.</p>}{games.map(game => <article className="online-row" key={game.id}><div><strong>{game.white.name} vs {game.black?.name ?? 'Anyone'}</strong><small>{game.result ?? game.status} · {clock(game.clocks.w)} + {game.incrementMs / 1000}</small></div>{game.status === 'finished' && <button onClick={() => onAnalyze(game.pgn)}>Analyze</button>}<button disabled={busy || !connected} onClick={() => title === 'Open games' ? command(`/games/${game.id}/join`) : setCurrent(game)}>{title === 'Open games' ? 'Join' : title === 'Watch live games' ? 'Watch' : 'Open'}</button></article>)}</div>)}</div>
        <div className="surface cloud-games"><h2>Your practice backup</h2><p>Save this browser’s completed practice games and preferences to your account. Your last 100 backups are kept.</p><button className="secondary-action" disabled={busy} onClick={() => void run(async () => {
          for (const record of gameRecords()) {
            const { id, updatedAt: _, ...data } = record
            await api(`/profile/saved-games/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(data) })
          }
          await api('/profile/preferences', { method: 'PUT', body: JSON.stringify(preferences()) })
          setNotice('Practice games and preferences backed up.')
        })}>Back up this device</button><button className="secondary-action" disabled={busy} onClick={() => void run(async () => { const data = await api<{ games: GameRecord[] }>('/profile/saved-games'); setCloud(data.games); if (!data.games.length) setNotice('No practice backups yet.') })}>Show backed-up games</button>
          {cloud.map(game => <article className="online-row" key={game.id}><div><strong>{game.result ?? 'Practice game'}</strong><small>{new Date(game.updatedAt).toLocaleString()}</small></div><button onClick={() => onAnalyze(game.pgn)}>Analyze</button><button onClick={() => downloadPgn(game.pgn)}>Download PGN</button></article>)}
        </div>
      </>}
    </>}
    {promotion && current && <Modal title="Promote your pawn" onClose={() => setPromotion(null)}><div className="promotion-options">{(['q', 'r', 'b', 'n'] as const).map((piece, i) => <button disabled={busy} key={piece} onClick={() => command(`/games/${current.id}/moves`, { ...promotion, promotion: piece, version: current.version })}><PieceImage type={piece} color={color} /><small>{['Queen', 'Rook', 'Bishop', 'Knight'][i]}</small></button>)}</div></Modal>}
    {resign && current && <Modal title="Resign this game?" onClose={() => setResign(false)}><p>Your opponent will win.</p><button className="primary-action" disabled={busy} onClick={() => command(`/games/${current.id}/resign`, { version: current.version })}>Confirm resignation</button><button className="secondary-action" onClick={() => setResign(false)}>Keep playing</button></Modal>}
  </section>
}
