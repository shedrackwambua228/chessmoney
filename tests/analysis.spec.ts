import { test, expect } from '@playwright/test'
import { Chess } from 'chess.js'
import { analyzePosition } from '../src/game'

test('analysis finds mate without changing the game', () => {
  const game = new Chess()
  for (const move of ['f3', 'e5', 'g4']) game.move(move)
  const before = game.pgn()
  const result = analyzePosition(game)
  expect(result.moves[0].san).toBe('Qh4#')
  expect(result.score).toBeLessThan(-90000)
  expect(game.pgn()).toBe(before)
})

test('import, navigate, analyze and explore a PGN', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Analysis', exact: true }).click()
  await page.getByLabel('Import PGN or FEN').fill('1. f3 e5 2. g4')
  await page.getByRole('button', { name: 'Load analysis', exact: true }).click()
  await page.getByRole('button', { name: 'Final position' }).click()
  await expect(page.getByRole('status')).toContainText('Black has a forced mate', { timeout: 15000 })
  await page.locator('.analysis-candidates button').first().click()
  await expect(page.getByRole('status')).toContainText('Black wins by checkmate')
  await page.getByRole('button', { name: 'Previous move' }).click()
  await expect(page.getByRole('button', { name: 'd8 Black queen' })).toBeVisible()
  await page.getByLabel('Import PGN or FEN').fill('this is not chess')
  await page.getByRole('button', { name: 'Load analysis', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Invalid PGN or FEN')
  await expect(page.getByRole('button', { name: 'd8 Black queen' })).toBeVisible()
})

test('custom FEN survives navigation and underpromotion on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 850 })
  await page.goto('/')
  await page.getByRole('button', { name: 'Open navigation' }).click()
  await page.getByRole('button', { name: 'Analysis', exact: true }).click()
  await page.getByLabel('Import PGN or FEN').fill('7k/P7/8/8/8/8/8/7K w - - 0 1')
  await page.getByRole('button', { name: 'Load analysis', exact: true }).click()
  await page.getByRole('button', { name: 'a7 White pawn' }).click()
  await page.getByRole('button', { name: /a8 empty/ }).click()
  await page.getByRole('button', { name: 'Promote to knight' }).click()
  await expect(page.getByRole('status')).toContainText('Draw by insufficient material')
  await page.getByRole('button', { name: 'First position' }).click()
  await expect(page.getByRole('button', { name: 'a7 White pawn' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)
})

