import { Chess } from 'chess.js'
import { analyzePosition } from './game'

self.onmessage = (event: MessageEvent<string>) => {
  try {
    const game = new Chess()
    game.loadPgn(event.data)
    self.postMessage({ result: analyzePosition(game) })
  } catch {
    self.postMessage({ error: 'This position could not be analyzed. Load another game and try again.' })
  }
}
