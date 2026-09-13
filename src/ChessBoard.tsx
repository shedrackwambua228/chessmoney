import { useLayoutEffect, useRef, useState } from 'react'
import type { Chess, Square } from 'chess.js'

export const pieceNames: Record<string, string> = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' }
export function PieceImage({ type, color }: { type: string; color: 'w' | 'b' }) {
  return <img className="piece-image" src={`${import.meta.env.BASE_URL}${pieceNames[type]}-${color}.svg`} alt="" aria-hidden="true" draggable={false} />
}
export default function ChessBoard({ game, selected = null, onSquare, flipped = false, hints = true, label = 'Chessboard' }: { game: Chess; selected?: Square | null; onSquare?: (square: Square) => void; flipped?: boolean; hints?: boolean; label?: string }) {
  const [focus, setFocus] = useState<Square>('e2')
  const boardRef = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const board = boardRef.current!
    const fit = () => {
      const viewport = window.visualViewport?.height ?? window.innerHeight
      const top = board.getBoundingClientRect().top + (board.closest('dialog') ? 0 : window.scrollY)
      const player = board.nextElementSibling
      const footer = player?.classList.contains('play-player') && player.getBoundingClientRect().left < board.getBoundingClientRect().right
        ? player.getBoundingClientRect().height + 8 : 0
      board.style.setProperty('--board-available', `${Math.max(80, Math.floor(viewport - top - footer - 16))}px`)
    }
    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(document.body)
    observer.observe(board.parentElement!)
    window.addEventListener('resize', fit)
    window.visualViewport?.addEventListener('resize', fit)
    return () => { observer.disconnect(); window.removeEventListener('resize', fit); window.visualViewport?.removeEventListener('resize', fit) }
  }, [])
  const legal = selected ? game.moves({ square: selected, verbose: true }) : []
  const history = game.history({ verbose: true })
  const last = history[history.length - 1]
  const squares = Array.from({ length: 64 }, (_, i) => `${'abcdefgh'[i % 8]}${8 - Math.floor(i / 8)}` as Square)
  if (flipped) squares.reverse()
  return <div ref={boardRef} className="play-board" role="group" aria-label={label}>{squares.map((square, i) => {
    const piece = game.get(square)
    const destination = legal.some(move => move.to === square)
    const content = <>{i % 8 === 0 && <small className="rank-label">{square[1]}</small>}{i >= 56 && <small className="file-label">{square[0]}</small>}{piece && <PieceImage type={piece.type} color={piece.color} />}{destination && hints && <span className={piece ? 'capture-ring' : 'move-dot'} />}</>
    const className = `play-square ${(square.charCodeAt(0) + Number(square[1])) % 2 ? 'pale' : 'brown'} ${selected === square ? 'chosen' : ''} ${last && (last.from === square || last.to === square) ? 'last-move' : ''} ${piece?.type === 'k' && piece.color === game.turn() && game.isCheck() ? 'in-check' : ''}`
    return onSquare ? <button key={square} className={className} aria-label={`${square}${piece ? ` ${piece.color === 'w' ? 'White' : 'Black'} ${pieceNames[piece.type]}` : ' empty'}${destination && hints ? ', legal move' : ''}`} aria-pressed={selected === square} tabIndex={focus === square ? 0 : -1} onFocus={() => setFocus(square)} onClick={() => onSquare(square)} onKeyDown={event => {
      const delta = { ArrowRight: 1, ArrowLeft: -1, ArrowUp: -8, ArrowDown: 8 }[event.key]
      if (delta === undefined) return
      event.preventDefault()
      const target = i + delta
      if (target < 0 || target > 63 || (Math.abs(delta) === 1 && Math.floor(i / 8) !== Math.floor(target / 8))) return
      setFocus(squares[target]); (event.currentTarget.parentElement?.children[target] as HTMLElement).focus()
    }}>{content}</button> : <div key={square} className={className}>{content}</div>
  })}</div>
}
