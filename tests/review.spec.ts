import { test, expect } from '@playwright/test'
import { Chess } from 'chess.js'
import { classifyMove, type Evaluation } from '../src/review-engine'

test('move grades use the mover’s perspective for both colors', () => {
  const game = new Chess()
  const white = game.move('e4'), black = game.move('e5')
  const evaluation = (score: number): Evaluation => ({ score, mate: null, best: null, line: [] })
  expect(classifyMove(white, evaluation(50), evaluation(-200)).grade).toBe('Blunder')
  expect(classifyMove(black, evaluation(-50), evaluation(200)).grade).toBe('Blunder')
  expect(classifyMove(black, evaluation(100), evaluation(-100)).grade).toBe('Good')
  expect(classifyMove(white, evaluation(100000), evaluation(100000)).grade).toBe('Good')
})

test('finished games automatically find mistakes and teach a better continuation', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: /Play a friend/ }).click()
  await expect(page.getByRole('region', { name: 'Post-game review' })).toHaveCount(0)
  for (const [from, to] of [['f2','f3'], ['e7','e5'], ['g2','g4'], ['d8','h4']]) {
    await page.getByRole('button', { name: new RegExp(`^${from} `) }).click()
    await page.getByRole('button', { name: new RegExp(`^${to} `) }).click()
  }
  await expect(page.getByRole('status')).toContainText('Black wins by checkmate')
  const review = page.getByRole('region', { name: 'Post-game review' })
  await expect(review).toContainText('Review ready', { timeout: 20000 })
  const saved = await page.evaluate(() => localStorage.getItem('mochess:history'))
  await review.getByRole('button', { name: /2\. g4 · Blunder/ }).first().click()
  await expect(page.getByRole('dialog')).toContainText('allows a forced checkmate')
  await expect(page.getByRole('group', { name: 'Mistake review board' })).toBeVisible()
  await page.getByRole('button', { name: 'Next suggested move', exact: true }).click()
  await page.getByRole('button', { name: 'Your move', exact: true }).click()
  await expect(page.getByRole('dialog').locator('.play-square').nth(38).locator('img')).toHaveAttribute('src', '/pawn-w.svg')
  await page.keyboard.press('Escape')
  expect(await page.evaluate(() => localStorage.getItem('mochess:history'))).toBe(saved)
  await review.getByRole('button', { name: 'Open full analysis' }).click()
  await expect(page.getByRole('group', { name: 'Analysis chessboard' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Post-game review' })).toContainText('Review ready')
  await page.screenshot({ path: 'test-results/post-game-review.png', fullPage: true })
})
