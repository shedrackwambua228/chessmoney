import { test, expect } from '@playwright/test'

test('completed games save automatically and reopen directly for analysis after reload', async ({ page }) => {
  let downloads = 0
  page.on('download', () => downloads++)
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: /Play a friend/ }).click()
  await page.getByRole('button', { name: 'e2 White pawn', exact: true }).click()
  await page.getByRole('button', { name: /e4 empty/ }).click()
  await page.getByRole('button', { name: 'Resign', exact: true }).click()
  await page.getByRole('button', { name: 'Confirm', exact: true }).click()
  await expect(page.getByText('Saved automatically in My games. Open it there anytime for analysis.', { exact: true })).toBeVisible()
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: 'My games', exact: true }).click()
  await expect(page.locator('.game-row')).toHaveCount(1)
  await page.getByRole('button', { name: /Analyze game from/ }).click()
  await expect(page.getByLabel('Import PGN or FEN')).toHaveValue(/1\. e4/)
  await expect(page.getByLabel('Saved game', { exact: true })).not.toHaveValue('')
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: 'Analysis', exact: true }).click()
  await expect(page.getByLabel('Import PGN or FEN')).toHaveValue(/1\. e4/)
  expect(downloads).toBe(0)
})

test('saved-game picker changes the loaded game and remembers the selection', async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('mochess:history')) localStorage.setItem('mochess:history', JSON.stringify([
      { id: 'archive-e4', pgn: '1. e4 e5', mode: 'local', timeControl: 'Blitz', w: 300000, b: 300000, updatedAt: 1800000000000, result: 'White wins by resignation' },
      { id: 'archive-d4', pgn: '1. d4 d5', mode: 'local', timeControl: 'Blitz', w: 300000, b: 300000, updatedAt: 1799999000000, result: 'Black wins by resignation' },
    ]))
  })
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: 'Analysis', exact: true }).click()
  await expect(page.getByLabel('Import PGN or FEN')).toHaveValue('1. e4 e5')
  await page.getByLabel('Saved game', { exact: true }).selectOption('archive-d4')
  await expect(page.getByLabel('Import PGN or FEN')).toHaveValue('1. d4 d5')
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: 'Analysis', exact: true }).click()
  await expect(page.getByLabel('Saved game', { exact: true })).toHaveValue('archive-d4')
  await expect(page.getByLabel('Import PGN or FEN')).toHaveValue('1. d4 d5')
})
