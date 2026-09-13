import { Chess, type Move } from 'chess.js'

export const controls = { Blitz: [300, 3], Rapid: [600, 5], Classical: [1800, 0] } as const
export type Mode = 'computer' | 'local'
export const colorName = (color: string) => color === 'w' ? 'White' : 'Black'
export function resultOf(game: Chess): string | null {
  if (game.isCheckmate()) return `${colorName(game.turn() === 'w' ? 'b' : 'w')} wins by checkmate`
  if (game.isStalemate()) return 'Draw by stalemate'
  if (game.isInsufficientMaterial()) return 'Draw by insufficient material'
  if (game.isThreefoldRepetition()) return 'Draw by threefold repetition'
  if (game.isDraw()) return 'Draw by the fifty-move rule'
  return null
}
const values: Record<string, number> = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 }
function evaluate(game: Chess): number {
  if (game.isCheckmate()) return -100000
  if (game.isDraw()) return 0
  return game.board().flat().reduce((sum, piece) => {
    if (!piece) return sum
    const center = 3.5 - Math.abs(3.5 - (piece.square.charCodeAt(0) - 97))
    return sum + (piece.color === game.turn() ? 1 : -1) * (values[piece.type] + center * 5)
  }, 0)
}
function search(game: Chess, depth: number, alpha: number, beta: number): number {
  if (depth === 0 || game.isGameOver()) return evaluate(game)
  let best = -Infinity
  for (const move of game.moves({ verbose: true }).sort((a, b) => (values[b.captured ?? 'k'] - values[a.captured ?? 'k']))) {
    game.move(move)
    const score = -search(game, depth - 1, -beta, -alpha)
    game.undo()
    best = Math.max(best, score)
    alpha = Math.max(alpha, score)
    if (alpha >= beta) break
  }
  return best
}
export function chooseMove(game: Chess): Move | undefined {
  let best = -Infinity
  let choice: Move | undefined
  for (const move of game.moves({ verbose: true })) {
    game.move(move)
    const score = -search(game, 1, -Infinity, Infinity)
    game.undo()
    if (score > best) { best = score; choice = move }
  }
  return choice
}

export type AnalysisResult = { score: number; outcome: string | null; moves: { san: string; score: number }[] }
export function analyzePosition(game: Chess): AnalysisResult {
  const outcome = resultOf(game)
  const sign = game.turn() === 'w' ? 1 : -1
  if (outcome) return { score: evaluate(game) * sign, outcome, moves: [] }
  const moves = game.moves({ verbose: true }).map(move => {
    game.move(move)
    const score = -search(game, 1, -Infinity, Infinity)
    game.undo()
    return { san: move.san, score }
  }).sort((a, b) => b.score - a.score)
  return { score: moves[0].score * sign, outcome: null, moves: moves.slice(0, 3).map(move => ({ ...move, score: move.score * sign })) }
}
