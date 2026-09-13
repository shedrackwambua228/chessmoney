import { useEffect, useState } from 'react'
import puzzles from './puzzles.json'
import { Chess, type Square } from 'chess.js'
import ChessBoard from './ChessBoard'
import YouTubeVideos from './YouTubeVideos'
import { read, write } from './storage'

const progressKey = 'puzzles-hard-v1'
const hintUsesKey = 'puzzle-hint-uses-v1'
const freeHints = 2

function completedPuzzleIds() {
  const value = read<unknown>(progressKey, [])
  return Array.isArray(value) ? [...new Set(value.filter((id): id is string => typeof id === 'string' && puzzles.some(puzzle => puzzle.id === id)))] : []
}

function firstUnsolvedPuzzle(completed: string[]) {
  const index = puzzles.findIndex(puzzle => !completed.includes(puzzle.id))
  return index === -1 ? 0 : index
}

function usedHintCount() {
  const value = read<unknown>(hintUsesKey, 0)
  return typeof value === 'number' && Number.isInteger(value) ? Math.min(Math.max(value, 0), freeHints) : 0
}

export function PuzzleRoom() {
  const [completed, setCompleted] = useState<string[]>(completedPuzzleIds)
  const [hintsUsed, setHintsUsed] = useState(usedHintCount)
  const [index, setIndex] = useState(() => firstUnsolvedPuzzle(completedPuzzleIds()))
  const puzzle = puzzles[index]
  const side = new Chess(puzzle.fen).turn()
  const total = Math.ceil(puzzle.line.length / 2)
  const intro = (i: number) => `${new Chess(puzzles[i].fen).turn() === 'w' ? 'White' : 'Black'} to move. Find mate in ${Math.ceil(puzzles[i].line.length / 2)}. Calculate the full combination.`
  const [game, setGame] = useState(() => new Chess(puzzles[firstUnsolvedPuzzle(completedPuzzleIds())].fen))
  const [step, setStep] = useState(0)
  const [selected, setSelected] = useState<Square | null>(null)
  const [message, setMessage] = useState(() => intro(firstUnsolvedPuzzle(completedPuzzleIds())))
  const solved = step === puzzle.line.length
  const replying = step % 2 === 1 && !solved
  const hint = `Hint: ${puzzle.hints[Math.floor(step / 2)] ?? puzzle.hints[puzzle.hints.length - 1]}`
  const suggestedMove = () => {
    const move = puzzle.line[step]
    if (!move) return ''
    const position = new Chess(); position.loadPgn(game.pgn())
    return position.move({ from: move.slice(0, 2), to: move.slice(2, 4), promotion: move[4] }).san
  }
  const showHint = () => {
    if (hintsUsed >= freeHints) { setMessage('You have used 2 of 2 free hints. Purchase more hints with coins in the mochess shop to continue.'); return }
    const used = hintsUsed + 1
    setHintsUsed(used); write(hintUsesKey, used)
    setMessage(`Here is your hint: you should make the move ${suggestedMove()}. You have used ${used} of ${freeHints} free hints. Purchase more hints with coins in the mochess shop to continue.`)
  }
  const change = (requested: number) => {
    if (requested === index) { setGame(new Chess(puzzles[index].fen)); setStep(0); setSelected(null); setMessage(intro(index)); return }
    const next = puzzles.findIndex(candidate => candidate.id !== puzzle.id && !completed.includes(candidate.id))
    if (next === -1) { setMessage(solved ? 'You have completed every unique puzzle in this set. Restart a puzzle to solve it again.' : 'This is the last unsolved puzzle in this set.'); return }
    setIndex(next); setGame(new Chess(puzzles[next].fen)); setStep(0); setSelected(null); setMessage(intro(next))
  }
  useEffect(() => {
    if (!replying) return
    const timer = window.setTimeout(() => {
      const reply = puzzle.line[step]
      const next = new Chess(); next.loadPgn(game.pgn())
      const move = next.move({ from: reply.slice(0, 2), to: reply.slice(2, 4), promotion: reply[4] })
      setGame(next); setStep(step + 1)
      setMessage(`Opponent played ${move.san}. Your move ${Math.floor((step + 1) / 2) + 1} of ${total}: keep the attack going.`)
    }, 500)
    return () => clearTimeout(timer)
  }, [replying, step, puzzle, game, total])
  const click = (square: Square) => {
    if (solved || replying) return
    if (game.get(square)?.color === side) { setSelected(square === selected ? null : square); return }
    if (!selected) return
    const candidate = new Chess(); candidate.loadPgn(game.pgn())
    let move
    try { move = candidate.move({ from: selected, to: square, promotion: 'q' }) } catch { setMessage(`That move is not legal. Try a highlighted square. ${hint}`); return }
    setSelected(null)
    if (move.from + move.to + (move.promotion ?? '') !== puzzle.line[step]) {
      setMessage(`That move misses the forcing line. The position is unchanged; try another move. ${hint}`); return
    }
    setGame(candidate); setStep(step + 1)
    if (step + 1 === puzzle.line.length && candidate.isCheckmate()) {
      setMessage('Checkmate! You solved the entire combination.')
      const next = [...new Set([...completed, puzzle.id])]; setCompleted(next); write(progressKey, next)
    } else setMessage('Correct. Your opponent is replying…')
  }
  return <><section className="practice-layout"><div><ChessBoard game={game} selected={selected} onSquare={click} flipped={side === 'b'} label="Puzzle chessboard" /></div><div className="surface puzzle-copy"><span className="section-kicker">HARD PUZZLE {index + 1} OF {puzzles.length}</span><h2>{puzzle.title}</h2><p role="status">{message}</p><p className="small-note">Mate in {total} · {solved ? total : Math.ceil(step / 2)} of {total} moves found</p><div className="progress-track"><span style={{ width: `${completed.length / puzzles.length * 100}%` }} /></div><p className="muted">{completed.length} of {puzzles.length} hard puzzles solved on this device</p><button className="secondary-action" disabled={replying || solved || hintsUsed >= freeHints} onClick={showHint}>Show hint ({freeHints - hintsUsed} free)</button><button className="secondary-action" onClick={() => change(index)}>Restart puzzle</button><button className="primary-action" onClick={() => change((index + 1) % puzzles.length)}>{solved ? 'Next puzzle' : 'Try another puzzle'}</button><p className="small-note">Find every move of the combination. The opponent replies automatically. After a wrong move, a hint appears to help you try again. Your position stays unchanged.</p></div></section><YouTubeVideos /></>
}
const lessons = [
  { title: 'Start with the essentials', tag: 'THE RULES', text: 'White moves first, then players alternate. Your goal is checkmate: attack the king so it has no legal escape. You may never make a move that leaves your own king in check.', points: ['Rooks move along ranks and files. Bishops move diagonally. Queens do both.', 'Knights move in an L shape: two squares in one direction and one to the side. They can jump over pieces.', 'Kings move one square in any direction. Pawns advance one square and capture diagonally; from their starting square they can advance two if both squares are clear.'] },
  { title: 'Make a strong opening', tag: 'FIRST MOVES', text: 'Build a position where your pieces can work together. A simple plan is more useful than memorizing a long sequence.', points: ['Contest the center with a pawn move such as e4 or d4.', 'Develop knights and bishops toward useful squares. Avoid moving the same piece repeatedly without a reason.', 'Castle when safe to protect your king and connect your rooks. Look for your opponent’s threats before every move.'] },
  { title: 'Spot the next threat', tag: 'TACTICS', text: 'Before you move, look for checks, captures, and threats for both sides. A short habit can prevent many lost pieces.', points: ['A fork attacks two targets at once. Knights are especially good at creating forks.', 'A pin restricts a piece because moving it would expose something more valuable behind it.', 'An undefended piece is a target. Count attackers and defenders before you capture.'] },
  { title: 'Know the special moves', tag: 'BEYOND THE BASICS', text: 'Three rules often surprise new players. The practice board handles each one automatically.', points: ['Castling moves the king two squares toward a rook. Neither may have moved, the path must be clear, and the king cannot start in check or cross an attacked square.', 'En passant lets a pawn capture a neighboring pawn immediately after that pawn advances two squares, as if it advanced only one.', 'When a pawn reaches the last rank, choose a queen, rook, bishop, or knight. Stalemate is a draw: a player has no legal move but is not in check.'] },
]
export function Lessons({ onPractice }: { onPractice: () => void }) {
  return <div className="lessons-grid">{lessons.map((lesson, i) => <article className="surface lesson" key={lesson.title}><span className="section-kicker">0{i + 1} / {lesson.tag}</span><h2>{lesson.title}</h2><p>{lesson.text}</p><ul>{lesson.points.map(point => <li key={point}>{point}</li>)}</ul></article>)}<div className="lesson-cta"><div><h2>Put it into practice.</h2><p>A little knowledge. A lot of possibilities.</p></div><button className="primary-action" onClick={onPractice}>Practice against the computer →</button></div></div>
}
