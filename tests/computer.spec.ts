import { test, expect } from '@playwright/test'

test('Stockfish finds checkmate in a resumed game', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('mochess:game', JSON.stringify({ id: 'engine-mate', pgn: '1. f3 e5 2. g4', mode: 'computer', timeControl: 'Blitz', w: 300000, b: 300000, updatedAt: Date.now() })))
  await page.goto('/')
  await page.getByRole('button', { name: 'Resume game', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Black wins by checkmate', { timeout: 15000 })
  await expect(page.getByRole('button', { name: 'h4 Black queen', exact: true })).toBeVisible()
})

test('reset cancels a pending engine move', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Play computer', exact: true }).click()
  await page.getByRole('button', { name: 'e2 White pawn', exact: true }).click()
  await page.getByRole('button', { name: /e4 empty/ }).click()
  await expect(page.getByRole('status')).toContainText('Computer is thinking')
  await page.getByRole('button', { name: 'New game', exact: true }).click()
  await page.getByRole('button', { name: 'Confirm', exact: true }).click()
  await page.waitForTimeout(3500)
  await expect(page.locator('.move-panel h3')).toContainText('0 moves')
  await expect(page.getByRole('button', { name: 'e2 White pawn', exact: true })).toBeVisible()
})
