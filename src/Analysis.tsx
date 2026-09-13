import { useEffect, useMemo, useState } from 'react'
import { Chess, type Square } from 'chess.js'
import ChessBoard, { pieceNames, PieceImage } from './ChessBoard'
import Modal from './Modal'
import GameReview from './GameReview'
import { colorName, type AnalysisResult } from './game'
import { downloadPgn, gameRecords } from './storage'
import './analysis.css'

export function positionAt(pgn: string, step: number) {
  const game = new Chess(); game.loadPgn(pgn)
  const length = game.history().length
  for (let i = length; i > step; i--) game.undo()
  return game
}
const scoreText = (score: number) => Math.abs(score) >= 90000 ? `${score > 0 ? 'White' : 'Black'} has a forced mate` : `${score >= 0 ? '+' : ''}${(score / 100).toFixed(2)}`

export default function Analysis({ initialPgn = '', onSelectGame }: { initialPgn?: string; onSelectGame: (pgn: string) => void }) {
  const savedGames = gameRecords()
  const [pgn, setPgn] = useState(initialPgn)
  const [input, setInput] = useState(initialPgn)
  const [step, setStep] = useState(0)
  const [selected, setSelected] = useState<Square | null>(null)
  const [promotion, setPromotion] = useState<{ from: Square; to: Square } | null>(null)
  const [flipped, setFlipped] = useState(false)
  const [result, setResult] = useState<AnalysisResult | null>(null)
  const [error, setError] = useState('')
  const [engineError, setEngineError] = useState('')
  const [notice, setNotice] = useState('Explore the board or import a game to begin.')
  const game = useMemo(() => positionAt(pgn, step), [pgn, step])
  const moves = useMemo(() => { const full = new Chess(); full.loadPgn(pgn); return full.history() }, [pgn])
  useEffect(() => {
    setResult(null); setEngineError('')
    let worker: Worker
    try { worker = new Worker(new URL('./analysis.worker.ts', import.meta.url), { type: 'module' }) }
    catch { setEngineError('Analysis could not start. Reload the page to try again.'); return }
    worker.onmessage = event => { if (event.data.error) setEngineError(event.data.error); else setResult(event.data.result) }
    worker.onerror = () => setEngineError('Analysis stopped unexpectedly. Move to another position to retry.')
    worker.postMessage(game.pgn())
    return () => worker.terminate()
  }, [game])
  const go = (next: number) => { setStep(next); setSelected(null); setPromotion(null) }
  const play = (from: Square, to: Square, promote = 'q') => {
    const branch = positionAt(pgn, step)
    try { branch.move({ from, to, promotion: promote }) } catch { setNotice('That move is not legal. Try a highlighted destination.'); return }
    // An explored continuation is separate from the saved game it came from.
    branch.header('Result', '*')
    setPgn(branch.pgn()); setStep(step + 1); setSelected(null); setPromotion(null)
    setNotice(step < moves.length ? 'Exploring a new continuation. Import again to restore the original line. Saved games are unchanged.' : 'Move added to your analysis line.')
  }
  const click = (square: Square) => {
    if (game.isGameOver() || promotion) return
    if (game.get(square)?.color === game.turn()) { setSelected(selected === square ? null : square); return }
    if (!selected) return
    const candidate = game.moves({ square: selected, verbose: true }).find(move => move.to === square)
    if (!candidate) { setNotice('Choose a highlighted destination.'); return }
    if (candidate.promotion) setPromotion({ from: selected, to: square })
    else play(selected, square)
  }
  const load = () => {
    if (!input.trim()) { setError('Paste a PGN game or FEN position first.'); return }
    if (input.length > 100000) { setError('Please import a single game under 100 KB.'); return }
    try {
      let imported: Chess
      try { imported = new Chess(input.trim()) } catch { imported = new Chess(); imported.loadPgn(input.trim()) }
      setPgn(imported.pgn()); go(0); setError(''); setNotice('Imported. Step through the moves or explore a continuation.')
    } catch { setError('Invalid PGN or FEN. Check the notation and try again. Your current board has been kept.') }
  }
  return <section className="analysis-layout"><div><div className="analysis-board-heading"><strong>{colorName(game.turn())} to move</strong><button onClick={() => setFlipped(value => !value)}>Flip board ↻</button></div><ChessBoard game={game} selected={selected} onSquare={click} flipped={flipped} label="Analysis chessboard" /><div className="review-controls"><button aria-label="First position" disabled={!step} onClick={() => go(0)}>«</button><button aria-label="Previous move" disabled={!step} onClick={() => go(step - 1)}>←</button><span aria-live="polite">{step} / {moves.length}</span><button aria-label="Next move" disabled={step === moves.length} onClick={() => go(step + 1)}>→</button><button aria-label="Final position" disabled={step === moves.length} onClick={() => go(moves.length)}>»</button></div><p className="small-note" aria-live="polite">{notice}</p></div>
    <aside className="analysis-sidebar"><div className="surface analysis-import"><label htmlFor="saved-analysis-game">Saved game</label><select id="saved-analysis-game" value={savedGames.find(record => record.pgn === initialPgn)?.id ?? ''} onChange={event => { const record = savedGames.find(game => game.id === event.target.value); if (record) onSelectGame(record.pgn) }}><option value="">Choose a saved game</option>{savedGames.map(record => <option key={record.id} value={record.id}>{new Date(record.updatedAt).toLocaleString()} · {record.result}</option>)}</select><p className="small-note">Your last 50 completed practice games are saved here automatically on this device. Online games stay in your account under Online. No PGN download is needed.</p></div>{initialPgn && <GameReview pgn={initialPgn} />}<div className="surface analysis-evaluation"><span className="section-kicker">POSITION EVALUATION</span><div role="status"><h2>{engineError || (result ? result.outcome ?? scoreText(result.score) : 'Analyzing…')}</h2></div><p>Positive scores favor White; negative scores favor Black. One point is roughly one pawn.</p><span className="section-kicker">SUGGESTED MOVES</span><div className="analysis-candidates">{result?.moves.map((move, i) => <button key={move.san} onClick={() => { const candidate = game.moves({ verbose: true }).find(item => item.san === move.san); if (candidate) play(candidate.from, candidate.to, candidate.promotion) }}><span>{i + 1}. <strong>{move.san}</strong></span><span>{scoreText(move.score)}</span></button>)}</div><p className="small-note">Basic local analysis, looking two half-moves ahead. Suggestions are approximate and can miss deeper tactics. Click a suggestion to explore it.</p></div>
      <div className="surface analysis-line"><h3>Analysis line</h3><div className="analysis-moves">{moves.length ? moves.map((move, i) => <button key={i} aria-current={step === i + 1 ? 'step' : undefined} onClick={() => go(i + 1)}>{i % 2 === 0 ? `${Math.floor(i / 2) + 1}. ` : ''}{move}</button>) : <p className="small-note">No moves yet. Try a move on the board.</p>}</div><button className="secondary-action" onClick={() => downloadPgn(pgn)}>Download analysis PGN</button></div>
      <form className="surface analysis-import" onSubmit={event => { event.preventDefault(); load() }}><label htmlFor="analysis-input">Import PGN or FEN</label><textarea id="analysis-input" value={input} onChange={event => setInput(event.target.value)} placeholder="Paste a game, e.g. 1. e4 e5 2. Nf3 Nc6" maxLength={100001} rows={4} spellCheck={false} /><button className="primary-action" type="submit">Load analysis</button>{error && <p className="import-error" role="alert">{error}</p>}</form>
    </aside>
    {promotion && <Modal title="Choose analysis promotion" onClose={() => setPromotion(null)}><div className="promotion-options">{(['q', 'r', 'b', 'n'] as const).map(piece => <button key={piece} aria-label={`Promote to ${pieceNames[piece]}`} onClick={() => play(promotion.from, promotion.to, piece)}><PieceImage type={piece} color={game.turn()} /><small>{pieceNames[piece]}</small></button>)}</div></Modal>}
  </section>
}
