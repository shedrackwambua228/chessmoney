export const computerLevels = {
  easy: { label: 'Easy', skill: 0, depth: 2, timeMs: 200 },
  medium: { label: 'Medium', skill: 8, depth: 8, timeMs: 800 },
  hard: { label: 'Hard', skill: 20, depth: 0, timeMs: 2500 },
} as const
export type ComputerLevel = keyof typeof computerLevels

export function computerMove(pgn: string, timeMs: number, onMove: (uci: string) => void, onError: () => void, level: ComputerLevel = 'hard') {
  const settings = computerLevels[level]
  const worker = new Worker(`${import.meta.env.BASE_URL}engine/stockfish-18-lite-single.js`)
  let closed = false
  const dispose = () => { closed = true; clearTimeout(timeout); worker.terminate() }
  const fail = () => { if (!closed) { dispose(); onError() } }
  const timeout = window.setTimeout(fail, timeMs + 20000)
  worker.onerror = fail
  worker.onmessageerror = fail
  worker.onmessage = event => {
    if (closed || typeof event.data !== 'string') return
    const line = event.data.trim()
    if (line === 'uciok') {
      worker.postMessage('setoption name Hash value 32')
      worker.postMessage(`setoption name Skill Level value ${settings.skill}`)
      worker.postMessage('setoption name UCI_LimitStrength value false')
      worker.postMessage('isready')
    } else if (line === 'readyok') {
      worker.postMessage('ucinewgame')
      worker.postMessage(pgn)
      worker.postMessage(`go movetime ${Math.min(timeMs, settings.timeMs)}${settings.depth ? ` depth ${settings.depth}` : ''}`)
    } else if (line.startsWith('bestmove ')) {
      const move = line.split(/\s+/)[1]
      if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(move)) { fail(); return }
      dispose(); onMove(move)
    }
  }
  worker.postMessage('uci')
  return dispose
}
