import { useEffect, useState } from 'react'
import { Chess } from 'chess.js'
import ChessBoard from './ChessBoard'
import Modal from './Modal'
import { reviewGame, type GameReport, type ReviewedMove } from './review-engine'
import './review.css'

export default function GameReview({ pgn, onAnalyze }: { pgn: string; onAnalyze?: () => void }) {
  const [report, setReport] = useState<GameReport | null>(null)
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const [selected, setSelected] = useState<ReviewedMove | null>(null)
  const [variation, setVariation] = useState(0)
  const [played, setPlayed] = useState(false)
  useEffect(() => {
    const abort = new AbortController()
    setReport(null); setError(''); setSelected(null); setProgress({ done: 0, total: 0 })
    reviewGame(pgn, abort.signal, (done, total) => { if (!abort.signal.aborted) setProgress({ done, total }) })
      .then(value => { if (!abort.signal.aborted) setReport(value) })
      .catch(err => { if (!abort.signal.aborted) setError(err instanceof Error ? err.message : 'Review unavailable. Please retry.') })
    return () => abort.abort()
  }, [pgn, retry])
  const mistakes = report?.moves.filter(move => move.loss >= 50 && move.grade !== 'Best') ?? []
  const inspect = (move: ReviewedMove) => { setSelected(move); setVariation(0); setPlayed(false) }
  const board = selected ? new Chess(played ? selected.after : selected.before) : null
  if (board && selected && !played) for (const san of selected.line.slice(0, variation)) board.move(san)
  return <section className="game-review" aria-label="Post-game review">
    <h3>Learn from this game</h3>
    {error ? <><p role="alert">{error}</p><button className="secondary-action" onClick={() => setRetry(value => value + 1)}>Retry review</button></> : !report ? <><p aria-live="polite">Reviewing your game with Stockfish… {progress.total > 0 && `${progress.done} / ${progress.total} positions`}</p><progress aria-label="Game review progress" value={progress.done} max={progress.total || 1} /></> : <>
      {!report.moves.length ? <p>No moves were played, so there are no move mistakes to review.</p> : <>
        <p aria-live="polite">Review ready · {mistakes.length} {mistakes.length === 1 ? 'move' : 'moves'} to revisit.</p>
        <div className="review-summary">{(['w', 'b'] as const).map(color => <span key={color}><strong>{color === 'w' ? 'White' : 'Black'}</strong>{report.moves.filter(m => m.color === color && m.grade === 'Blunder').length} blunders · {report.moves.filter(m => m.color === color && m.grade === 'Mistake').length} mistakes</span>)}</div>
        {!mistakes.length && <p>No major evaluation drops found in this quick review. You can still compare every move below.</p>}
        <div className="review-mistakes">{mistakes.map(move => <button key={move.ply} onClick={() => inspect(move)}><strong>{Math.ceil(move.ply / 2)}{move.color === 'w' ? '.' : '…'} {move.san} · {move.grade}</strong><span>Better: {move.best ?? 'See position'}</span></button>)}</div>
        <details><summary>Review every move</summary><div className="review-mistakes">{report.moves.map(move => <button key={move.ply} onClick={() => inspect(move)}>{Math.ceil(move.ply / 2)}{move.color === 'w' ? '.' : '…'} {move.san} · {move.grade}</button>)}</div></details>
      </>}
    </>}
    <p className="small-note">Quick engine estimates, not a definitive verdict. Move quality is separate from losses on time, resignation or disconnection.</p>
    {onAnalyze && <button className="primary-action" onClick={onAnalyze}>Open full analysis</button>}
    {selected && board && <Modal title={`Review ${Math.ceil(selected.ply / 2)}${selected.color === 'w' ? '.' : '…'} ${selected.san}`} onClose={() => setSelected(null)}>
      <p><strong>{selected.grade}.</strong> {selected.explanation}</p>
      <p>You played {selected.san}. Suggested: {selected.best ?? 'No alternative'}.</p>
      <ChessBoard game={board} flipped={selected.color === 'b'} label="Mistake review board" />
      <div className="review-controls"><button onClick={() => { setPlayed(false); setVariation(0) }}>Before move</button><button onClick={() => setPlayed(true)}>Your move</button><button disabled={!selected.line.length || (!played && variation >= selected.line.length)} onClick={() => { setPlayed(false); setVariation(played ? 1 : variation + 1) }}>Next suggested move</button></div>
      <p>{played ? `Played: ${selected.san}` : `Suggested line: ${selected.line.join(' ')}`}</p>
    </Modal>}
  </section>
}
