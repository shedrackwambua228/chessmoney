import { useEffect, useRef, useState } from 'react'
import { Chess, type Square, type PieceSymbol } from 'chess.js'
import { colorName, controls, resultOf, type Mode } from './game'
import { computerMove, computerLevels, type ComputerLevel } from './computer'
import GameReview from './GameReview'
import GameChat from './GameChat'
import Spectators from './Spectators'
import './play.css'
import ChessBoard, { pieceNames as names, PieceImage } from './ChessBoard'
import Modal from './Modal'
import { clearSaved, downloadPgn, gameRecords, write, type SavedGame } from './storage'

const formatTime = (ms: number) => `${Math.floor(Math.max(0, Math.ceil(ms / 1000)) / 60).toString().padStart(2, '0')}:${(Math.max(0, Math.ceil(ms / 1000)) % 60).toString().padStart(2, '0')}`

export default function PlayRoom({ initialMode, timeControl, saved, hints = true, onClose, onAnalyze }: { initialMode: Mode; timeControl: keyof typeof controls; saved?: SavedGame; hints?: boolean; onClose: () => void; onAnalyze: (pgn: string) => void }) {
  const [game] = useState(() => { const value = new Chess(); if (saved) value.loadPgn(saved.pgn); return value })
  const gameId = useRef(saved?.id ?? crypto.randomUUID())
  const [storageError, setStorageError] = useState(false)
  const moveList = useRef<HTMLDivElement>(null)
  const [version, refresh] = useState(0)
  const [engineError, setEngineError] = useState(false)
  const [engineRetry, setEngineRetry] = useState(0)
  const cancelComputer = useRef<(() => void) | null>(null)
  const [mode, setMode] = useState(initialMode)
  const [level, setLevel] = useState<ComputerLevel>(saved?.computerLevel === 'easy' || saved?.computerLevel === 'medium' ? saved.computerLevel : 'hard')
  const currentLevel = useRef(level)
  currentLevel.current = level
  const currentMode = useRef(mode)
  currentMode.current = mode
  const [selected, setSelected] = useState<Square | null>(null)
  const [promotion, setPromotion] = useState<{ from: Square; to: Square } | null>(null)
  const [flipped, setFlipped] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<'new' | 'resign' | null>(null)
  const [hint, setHint] = useState(hints ? 'Select a piece, then a highlighted square.' : 'Select a piece, then its destination.')
  const [times, setTimes] = useState({ w: saved?.w ?? controls[timeControl][0] * 1000, b: saved?.b ?? controls[timeControl][0] * 1000 })
  const clock = useRef({ ...times, since: Date.now(), running: !!saved && game.history().length > 0 })
  const finished = useRef(false)
  const snapshot = (): SavedGame => ({ id: gameId.current, pgn: game.pgn(), mode: currentMode.current, computerLevel: currentLevel.current, timeControl, w: clock.current.w, b: clock.current.b, updatedAt: Date.now() })
  const persist = () => { if (!finished.current && game.history().length) setStorageError(!write('game', snapshot())) }
  const end = (message: string) => {
    if (finished.current) return
    finished.current = true; clock.current.running = false
    const resultCode = message.startsWith('Draw') ? '1/2-1/2' : message.startsWith('White') ? '1-0' : '0-1'
    game.header('Event', 'mochess practice', 'White', currentMode.current === 'computer' ? 'You' : 'White player', 'Black', currentMode.current === 'computer' ? `Stockfish · ${computerLevels[currentLevel.current].label}` : 'Black player', 'Result', resultCode, 'TimeControl', `${controls[timeControl][0]}+${controls[timeControl][1]}`)
    const record = { ...snapshot(), result: message }
    const archived = write('history', [record, ...gameRecords().filter(item => item.id !== record.id)].slice(0, 50))
    setStorageError(!archived)
    if (archived) clearSaved()
    setResult(message); setPromotion(null); setSelected(null); setConfirm(null)
  }
  const tick = () => {
    if (!clock.current.running || finished.current) return true
    const now = Date.now(), side = game.turn()
    clock.current[side] = Math.max(0, clock.current[side] - (now - clock.current.since))
    clock.current.since = now
    setTimes({ w: clock.current.w, b: clock.current.b })
    if (!clock.current[side]) { end(`${colorName(side === 'w' ? 'b' : 'w')} wins on time`); return false }
    return true
  }
  useEffect(() => {
    const timer = window.setInterval(tick, 100)
    const saveTimer = window.setInterval(persist, 1000)
    return () => { window.clearInterval(timer); window.clearInterval(saveTimer) }
  }, [game])
  const move = (from: Square, to: Square, promote: PieceSymbol = 'q') => {
    if (finished.current || !tick()) return
    const side = game.turn()
    try { game.move({ from, to, promotion: promote }) } catch { setHint('That move is not legal. Try another destination.'); return }
    clock.current[side] += controls[timeControl][1] * 1000
    clock.current.since = Date.now()
    clock.current.running = true
    setTimes({ w: clock.current.w, b: clock.current.b })
    setSelected(null); setPromotion(null); setHint(hints ? 'Select a piece, then a highlighted square.' : 'Select a piece, then its destination.')
    const outcome = resultOf(game)
    if (outcome) end(outcome)
    else persist()
    refresh(value => value + 1)
  }
  useEffect(() => {
    if (mode !== 'computer' || game.turn() !== 'b' || result) return
    const position = game.fen()
    const history = game.history({ verbose: true })
    const command = history.length ? `position fen ${history[0].before} moves ${history.map(m => m.from + m.to + (m.promotion ?? '')).join(' ')}` : `position fen ${position}`
    const fail = () => { if (!finished.current && game.fen() === position) { clock.current.running = false; setEngineError(true) } }
    try {
      const cancel = computerMove(command, Math.max(100, Math.min(2500, Math.floor(clock.current.b / 20))), uci => {
        if (finished.current || game.fen() !== position) return
        const candidate = game.moves({ verbose: true }).find(m => m.from + m.to + (m.promotion ?? '') === uci)
        if (candidate) move(candidate.from, candidate.to, candidate.promotion)
        else fail()
      }, fail, level)
      cancelComputer.current = cancel
      return () => { cancel(); if (cancelComputer.current === cancel) cancelComputer.current = null }
    } catch { fail() }
  }, [version, mode, result, engineRetry, level])
  useEffect(() => {
    const saveBeforeLeave = () => { tick(); persist() }
    window.addEventListener('pagehide', saveBeforeLeave)
    window.addEventListener('beforeunload', saveBeforeLeave)
    return () => { window.removeEventListener('pagehide', saveBeforeLeave); window.removeEventListener('beforeunload', saveBeforeLeave) }
  }, [])
  useEffect(() => { window.scrollTo(0, 0) }, [])
  useEffect(() => { if (moveList.current) moveList.current.scrollTop = moveList.current.scrollHeight }, [version])
  const leave = () => { tick(); persist(); onClose() }
  const takeBack = () => {
    if (finished.current || !game.history().length || !tick()) return
    cancelComputer.current?.(); cancelComputer.current = null
    const count = mode === 'computer' && game.turn() === 'w' ? Math.min(2, game.history().length) : 1
    for (let i = 0; i < count; i++) {
      const undone = game.undo()
      if (undone) clock.current[undone.color] = Math.max(0, clock.current[undone.color] - controls[timeControl][1] * 1000)
    }
    clock.current.since = Date.now()
    clock.current.running = game.history().length > 0
    setTimes({ w: clock.current.w, b: clock.current.b })
    setSelected(null); setPromotion(null); setConfirm(null); setEngineError(false)
    setHint('Move taken back. Try a different move. Time already spent is not refunded.')
    if (game.history().length) persist()
    else clearSaved()
    refresh(value => value + 1)
    if (!clock.current.w || !clock.current.b) end(`${!clock.current.w ? 'Black' : 'White'} wins on time`)
  }
  const reset = () => {
    setEngineError(false)
    game.reset(); finished.current = false; gameId.current = crypto.randomUUID(); clearSaved()
    clock.current = { w: controls[timeControl][0] * 1000, b: controls[timeControl][0] * 1000, since: Date.now(), running: false }
    setTimes({ w: clock.current.w, b: clock.current.b }); setResult(null); setSelected(null); setPromotion(null); setConfirm(null)
    setHint(hints ? 'Select a piece, then a highlighted square.' : 'Select a piece, then its destination.'); refresh(value => value + 1)
  }
  const legal = selected ? game.moves({ square: selected, verbose: true }) : []
  const history = game.history({ verbose: true })
  const click = (square: Square) => {
    if (result || promotion || (mode === 'computer' && game.turn() === 'b')) return
    if (selected === square) { setSelected(null); return }
    if (selected && legal.some(candidate => candidate.to === square)) {
      if (legal.some(candidate => candidate.to === square && candidate.promotion)) setPromotion({ from: selected, to: square })
      else move(selected, square)
    } else if (game.get(square)?.color === game.turn()) setSelected(square)
    else setHint(selected ? 'Choose a legal destination for this piece.' : `Select a ${colorName(game.turn()).toLowerCase()} piece.`)
  }
  const player = (side: 'w' | 'b') => <div className={`play-player ${game.turn() === side && !result ? 'active-player' : ''}`}><span className="play-avatar">{side === 'w' ? '♔' : '♚'}</span><div><strong>{side === 'b' && mode === 'computer' ? `Stockfish · ${computerLevels[currentLevel.current].label}` : mode === 'computer' ? 'You' : `${colorName(side)} player`}</strong><small>{colorName(side)}{game.turn() === side && !result ? ' · to move' : ''}</small></div><b className={times[side] < 30000 ? 'play-clock low-time' : 'play-clock'}>{formatTime(times[side])}</b></div>
  return <div className="play-room">
    <main className="play-layout"><section className="play-main">{player('b')}
      <ChessBoard game={game} selected={selected} onSquare={click} flipped={flipped} hints={hints} />{player('w')}<p className="play-hint">{hint} Clocks start after White’s first move.</p></section>
      <aside className="play-details"><header className="play-header"><a className="brand" href="#" onClick={event => { event.preventDefault(); leave() }}>♞ mochess</a><span>FREE PRACTICE · {controls[timeControl][0] / 60} + {controls[timeControl][1]}</span><button onClick={() => leave()}>Back to lobby</button></header><div className="play-context"><Spectators /><div className="play-status" role="status"><span className="section-kicker">{result ? 'GAME OVER' : 'IN PLAY'}</span><h2>{result ?? (mode === 'computer' && game.turn() === 'b' ? 'Computer is thinking…' : `${colorName(game.turn())} to move${game.isCheck() ? ' · Check!' : ''}`)}</h2><p>{mode === 'computer' ? 'You play White against Stockfish at your selected difficulty.' : 'Two players share this device. Take turns moving your pieces.'}</p><p>Free game · no wallet funds used</p></div>
        {result && <><p className="small-note">{storageError ? 'The game could not be saved on this device. Download its PGN to keep a copy.' : 'Saved automatically in My games. Open it there anytime for analysis.'}</p><GameReview pgn={game.pgn()} onAnalyze={() => onAnalyze(game.pgn())} /></>}
        {engineError && <div className="storage-notice" role="alert">The chess engine could not load. Clocks are paused.<button className="secondary-action" onClick={() => { setEngineError(false); clock.current.since = Date.now(); clock.current.running = true; setEngineRetry(value => value + 1) }}>Retry computer</button></div>}
        <label className="play-mode">Opponent<select value={mode} disabled={history.length > 0} onChange={event => setMode(event.target.value as Mode)}><option value="computer">Computer</option><option value="local">Friend on this device</option></select></label>
        {mode === 'computer' && <label className="play-mode">Computer level<select value={level} disabled={history.length > 0} onChange={event => setLevel(event.target.value as ComputerLevel)}>{(Object.keys(computerLevels) as ComputerLevel[]).map(key => <option key={key} value={key}>{computerLevels[key].label}</option>)}</select></label>}
        {mode === 'computer' && <p className="small-note">Stockfish 18 · <a href={`${import.meta.env.BASE_URL}engine/COPYING.txt`} target="_blank" rel="noreferrer">License</a> · <a href={`${import.meta.env.BASE_URL}engine/SOURCE.txt`} target="_blank" rel="noreferrer">Source</a></p>}
        </div><div className="move-panel"><h3>Move history <span>{history.length} moves</span></h3><div className="move-scroll" ref={moveList}>{history.length === 0 ? <p>Your opening move goes here.</p> : Array.from({ length: Math.ceil(history.length / 2) }, (_, i) => <div className="notation-row" key={i}><span>{i + 1}.</span><b>{history[i * 2]?.san}</b><b>{history[i * 2 + 1]?.san ?? '—'}</b></div>)}</div></div>
        <div className="play-actions"><button type="button" className="secondary-action" onClick={() => setFlipped(value => !value)}>Flip board ↻</button><button className="secondary-action" disabled={!!result || history.length === 0} onClick={takeBack}>Take back</button><p className="small-note">{mode === 'computer' ? 'Undo your last move and the computer’s reply.' : 'Undo the last move.'} Time already spent is not refunded.</p><button className="primary-action" onClick={() => history.length && !result ? setConfirm('new') : reset()}>New game</button><button className="secondary-action" disabled={!!result || history.length === 0} onClick={() => setConfirm('resign')}>Resign</button><button className="secondary-action" disabled={history.length === 0} onClick={() => downloadPgn(game.pgn())}>Download moves (PGN)</button></div>
        {storageError && <p className="storage-notice" role="alert">Your browser could not save this game. Download the PGN before leaving.</p>}
      </aside><GameChat explanation={mode === 'computer' ? 'Playing the computer? Join an online game to chat with a human opponent.' : 'For live chat, play your friend in an online game on separate devices.'} /></main>
    {promotion && !result && <Modal title="Promote your pawn"><p>Your clock keeps running. Choose a piece.</p><div className="promotion-options">{(['q', 'r', 'b', 'n'] as const).map(piece => <button key={piece} onClick={() => move(promotion.from, promotion.to, piece)} aria-label={`Promote to ${names[piece]}`}><PieceImage type={piece} color={game.turn()} /><small>{names[piece]}</small></button>)}</div></Modal>}
    {confirm && <Modal title={confirm === 'resign' ? 'Resign this game?' : 'Start a new game?'} onClose={() => setConfirm(null)}><p>{confirm === 'resign' ? 'Your opponent will win.' : 'This replaces the current game. Download your moves first if you want to keep them.'}</p><button className="primary-action" onClick={() => { if (confirm === 'new') reset(); else end(`${colorName(mode === 'computer' ? 'b' : game.turn() === 'w' ? 'b' : 'w')} wins by resignation`); setConfirm(null) }}>Confirm</button><button className="secondary-action" onClick={() => setConfirm(null)}>Keep playing</button></Modal>}
  </div>
}
