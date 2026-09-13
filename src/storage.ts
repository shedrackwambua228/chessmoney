import { Chess } from 'chess.js'
import { controls, type Mode } from './game'
import type { ComputerLevel } from './computer'

export type Preferences = { timeControl: keyof typeof controls; board: 'olive' | 'walnut'; hints: boolean }
export type SavedGame = { id: string; pgn: string; mode: Mode; computerLevel?: ComputerLevel; timeControl: keyof typeof controls; w: number; b: number; updatedAt: number }
export type GameRecord = SavedGame & { result: string }
export function read<T>(key: string, fallback: T): T {
  try { const value = localStorage.getItem(`mochess:${key}`); return value ? JSON.parse(value) : fallback } catch { return fallback }
}
export function write(key: string, value: unknown): boolean {
  try { localStorage.setItem(`mochess:${key}`, JSON.stringify(value)); return true } catch { return false }
}
export function clearSaved() { try { localStorage.removeItem('mochess:game') } catch { /* Storage can be unavailable. */ } }
export function validGame(value: unknown): value is SavedGame {
  if (!value || typeof value !== 'object') return false
  const game = value as SavedGame
  if (typeof game.id !== 'string' || typeof game.pgn !== 'string' || !['computer', 'local'].includes(game.mode) || !Object.prototype.hasOwnProperty.call(controls, game.timeControl) || !Number.isFinite(game.w) || !Number.isFinite(game.b) || game.w < 0 || game.b < 0 || !Number.isFinite(game.updatedAt)) return false
  try { new Chess().loadPgn(game.pgn); return true } catch { return false }
}
export function savedGame(): SavedGame | null {
  const value = read<unknown>('game', null)
  return validGame(value) ? value : null
}
export function gameRecords(): GameRecord[] {
  const values = read<unknown>('history', [])
  return Array.isArray(values) ? values.filter((value): value is GameRecord => validGame(value) && typeof (value as GameRecord).result === 'string').slice(0, 50) : []
}
export function savedAnalysisPgn(): string {
  const value = read<unknown>('analysis-pgn', '')
  if (typeof value === 'string' && value) {
    try { new Chess().loadPgn(value); return value } catch { /* Fall back to the latest saved game. */ }
  }
  return gameRecords()[0]?.pgn ?? ''
}
export function preferences(): Preferences {
  const value = read<Partial<Preferences> | null>('preferences', null)
  return { timeControl: value?.timeControl && Object.prototype.hasOwnProperty.call(controls, value.timeControl) ? value.timeControl : 'Blitz', board: value?.board === 'walnut' ? 'walnut' : 'olive', hints: value?.hints !== false }
}
export function downloadPgn(pgn: string) {
  const url = URL.createObjectURL(new Blob([pgn], { type: 'application/x-chess-pgn' }))
  const link = document.createElement('a')
  link.href = url; link.download = 'mochess-game.pgn'; link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
