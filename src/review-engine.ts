import { Chess, type Move } from 'chess.js'

export type Evaluation = { score: number; mate: number | null; best: string | null; line: string[] }
export type ReviewedMove = { ply: number; san: string; color: 'w' | 'b'; before: string; after: string; best: string | null; line: string[]; loss: number; grade: string; explanation: string }
export type GameReport = { moves: ReviewedMove[] }
const cache = new Map<string, GameReport>()

export function classifyMove(move: Move, before: Evaluation, after: Evaluation): ReviewedMove {
  const sign = move.color === 'w' ? 1 : -1
  const loss = Math.max(0, sign * (Math.max(-1000, Math.min(1000, before.score)) - Math.max(-1000, Math.min(1000, after.score))))
  const grade = move.san === before.best ? 'Best' : loss >= 200 ? 'Blunder' : loss >= 100 ? 'Mistake' : loss >= 50 ? 'Inaccuracy' : 'Good'
  let explanation = grade === 'Best' ? 'You found the engine’s preferred move.' : loss < 50 ? 'This move keeps roughly the same evaluation.' : `The evaluation dropped by about ${(loss / 100).toFixed(1)} pawns from your side. Compare the suggested move and check both players’ checks, captures and threats.`
  if (before.mate !== null && before.mate * sign > 0 && !(after.mate !== null && after.mate * sign > 0)) explanation = 'You missed a forced checkmate. Replay the suggested continuation to see how to keep the attack going.'
  else if (after.mate !== null && after.mate * sign < 0 && !(before.mate !== null && before.mate * sign < 0)) explanation = 'This move allows a forced checkmate against you. Compare the safer alternative and watch the squares around your king.'
  return { ply: 0, san: move.san, color: move.color, before: move.before, after: move.after, best: before.best, line: before.line, loss, grade, explanation }
}

export async function reviewGame(pgn: string, signal: AbortSignal, progress: (done: number, total: number) => void): Promise<GameReport> {
  const stored = cache.get(pgn)
  if (stored) return stored
  const game = new Chess(); game.loadPgn(pgn)
  const moves = game.history({ verbose: true })
  if (!moves.length) return { moves: [] }
  if (signal.aborted) throw new Error('Review cancelled')
  const worker = new Worker(`${import.meta.env.BASE_URL}engine/stockfish-18-lite-single.js`)
  let receive: (line: string) => void = () => {}
  let rejectPending: (error: Error) => void = () => {}
  const abort = () => { worker.terminate(); rejectPending(new Error('Review cancelled')) }
  const fail = () => rejectPending(new Error('Stockfish could not complete this review. Please retry.'))
  signal.addEventListener('abort', abort, { once: true })
  worker.onerror = fail; worker.onmessageerror = fail
  worker.onmessage = event => { if (typeof event.data === 'string') receive(event.data.trim()) }
  const waitFor = <T,>(start: () => void, handle: (line: string, done: (value: T) => void) => void): Promise<T> => new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => rejectPending(new Error('The engine timed out. Please retry the review.')), 20000)
    const finish = () => { clearTimeout(timeout); receive = () => {}; rejectPending = () => {} }
    rejectPending = error => { finish(); reject(error) }
    receive = line => handle(line, value => { finish(); resolve(value) })
    start()
  })
  try {
    await waitFor<void>(() => worker.postMessage('uci'), (line, done) => { if (line === 'uciok') done() })
    worker.postMessage('setoption name Hash value 32')
    worker.postMessage('setoption name UCI_LimitStrength value false')
    await waitFor<void>(() => worker.postMessage('isready'), (line, done) => { if (line === 'readyok') done() })
    const board = new Chess(moves[0].before)
    const evaluations: Evaluation[] = []
    const uci: string[] = []
    for (let index = 0; index <= moves.length; index++) {
      if (signal.aborted) throw new Error('Review cancelled')
      const sign = board.turn() === 'w' ? 1 : -1
      if (board.isCheckmate()) evaluations.push({ score: -sign * 100000, mate: -sign, best: null, line: [] })
      else if (board.isDraw()) evaluations.push({ score: 0, mate: null, best: null, line: [] })
      else {
        let score: number | undefined, mate: number | null = null, pv: string[] = []
        const evaluation = await waitFor<Evaluation>(() => {
          worker.postMessage(`position fen ${moves[0].before}${uci.length ? ` moves ${uci.join(' ')}` : ''}`)
          worker.postMessage('go movetime 250')
        }, (line, done) => {
          const match = line.match(/\bscore (cp|mate) (-?\d+)/)
          if (match && !line.includes('lowerbound') && !line.includes('upperbound')) {
            const value = Number(match[2])
            mate = match[1] === 'mate' ? value * sign : null
            score = mate !== null ? (value >= 0 ? sign : -sign) * 100000 : value * sign
            pv = line.split(' pv ')[1]?.trim().split(/\s+/) ?? []
          }
          if (line.startsWith('bestmove ')) {
            if (score === undefined) { fail(); return }
            const best = line.split(/\s+/)[1]
            const variation = new Chess(board.fen()), san: string[] = []
            for (const move of (pv[0] === best ? pv : [best]).slice(0, 8)) {
              try { san.push(variation.move({ from: move.slice(0, 2), to: move.slice(2, 4), promotion: move[4] }).san) } catch { break }
            }
            done({ score, mate, best: san[0] ?? null, line: san })
          }
        })
        evaluations.push(evaluation)
      }
      progress(index + 1, moves.length + 1)
      if (index < moves.length) {
        const move = moves[index]
        board.move(move); uci.push(move.from + move.to + (move.promotion ?? ''))
      }
    }
    const report = { moves: moves.map((move, index) => ({ ...classifyMove(move, evaluations[index], evaluations[index + 1]), ply: index + 1 })) }
    if (cache.size >= 10) cache.delete(cache.keys().next().value!)
    cache.set(pgn, report)
    return report
  } finally { signal.removeEventListener('abort', abort); worker.terminate() }
}
