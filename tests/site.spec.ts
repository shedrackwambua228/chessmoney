import puzzles from '../src/puzzles.json' with { type: 'json' }
import { test, expect } from '@playwright/test'

test('unfinished games survive reload and finished games can be reviewed', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /Play a friend/ }).click()
  await page.getByRole('button', { name: 'e2 White pawn' }).click()
  await page.getByRole('button', { name: /e4 empty/ }).click()
  await page.reload()
  await page.getByRole('button', { name: 'Resume game' }).click()
  await expect(page.getByRole('button', { name: 'e4 White pawn' })).toBeVisible()
  await expect(page.getByRole('status')).toContainText('Black to move')
  await page.getByRole('button', { name: 'Back to lobby' }).click()
  await page.getByRole('button', { name: 'Play computer', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Start a fresh game?' })).toBeVisible()
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Resume game' }).click()
  await page.getByRole('button', { name: 'Resign', exact: true }).click()
  await page.getByRole('button', { name: 'Confirm', exact: true }).click()
  await page.getByRole('button', { name: 'Back to lobby' }).click()
  await expect(page.getByRole('button', { name: 'Resume game' })).toHaveCount(0)
  await page.getByRole('button', { name: 'My games', exact: true }).click()
  await expect(page.locator('.game-row')).toHaveCount(1)
  await page.getByRole('button', { name: /Review game from/ }).click()
  await expect(page.getByRole('dialog')).toContainText('0 / 1')
  await page.getByRole('button', { name: 'Next move', exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText('1 / 1 · e4')
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download PGN', exact: true }).click()
  expect((await download).suggestedFilename()).toBe('mochess-game.pgn')
})

test('hard puzzles require full combinations and remember completion', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Puzzles', exact: true }).click()
  await page.getByRole('button', { name: 'e6 White queen', exact: true }).click()
  await page.getByRole('button', { name: /e5 empty/ }).click()
  await expect(page.getByRole('status')).toContainText('misses the forcing line')
  await expect(page.getByRole('button', { name: 'e6 White queen', exact: true })).toBeVisible()
  for (const [index, puzzle] of puzzles.entries()) {
    for (let step = 0; step < puzzle.line.length; step += 2) {
      const uci = puzzle.line[step]
      if (step) await expect(page.getByRole('status')).toContainText('Your move')
      await page.getByRole('button', { name: new RegExp(`^${uci.slice(0, 2)} `) }).click()
      await page.getByRole('button', { name: new RegExp(`^${uci.slice(2, 4)} `) }).click()
      if (!step && puzzle.line.length > 1) await expect(page.locator('.puzzle-copy .muted')).toHaveText(`${index} of 4 hard puzzles solved on this device`)
    }
    await expect(page.getByRole('status')).toContainText('Checkmate!')
    await page.getByRole('button', { name: 'Next puzzle', exact: true }).click()
  }
  await page.reload()
  await page.getByRole('button', { name: 'Puzzles', exact: true }).click()
  await expect(page.locator('.puzzle-copy')).toContainText('4 of 4 hard puzzles solved')
})
test('mobile navigation and saved preferences work with keyboard play', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await page.screenshot({ path: 'test-results/home-mobile.png', fullPage: true })
  await page.getByRole('button', { name: 'Open navigation' }).click()
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByRole('button', { name: 'Warm walnut' }).click()
  await page.getByLabel('Show legal moves').uncheck()
  await page.getByLabel('Default time control').selectOption('Rapid')
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-board', 'walnut')
  await page.getByRole('button', { name: /Play a friend/ }).click()
  await expect(page.locator('.play-clock').first()).toHaveText('10:00')
  await page.getByRole('button', { name: 'e2 White pawn' }).focus()
  await page.keyboard.press('Enter')
  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('button', { name: 'e4 White pawn' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

test('desktop layout and unavailable or malformed storage do not crash the site', async ({ page }) => {
  await page.goto('/')
  await page.screenshot({ path: 'test-results/home-desktop.png', fullPage: true })
  await page.evaluate(() => {
    localStorage.setItem('mochess:game', '{broken')
    localStorage.setItem('mochess:history', JSON.stringify([null, { pgn: 'invalid' }]))
    localStorage.setItem('mochess:preferences', 'null')
  })
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Make your next move.' })).toBeVisible()
  await page.getByRole('button', { name: 'My games', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Your first game is waiting.' })).toBeVisible()
  await page.addInitScript(() => { Storage.prototype.setItem = () => { throw new Error('Storage blocked') } })
  await page.reload()
  await expect(page.getByRole('status')).toContainText('Browser storage is unavailable')
  await page.getByRole('button', { name: 'Play computer', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Let’s play.' })).toBeVisible()
})

test('all home sections fit small phones and tablets', async ({ page }) => {
  for (const width of [320, 768]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/')
    for (const section of ['Play', 'Puzzles', 'Learn', 'My games', 'Settings']) {
      if (width < 741) await page.getByRole('button', { name: 'Open navigation' }).click()
      await page.getByRole('navigation').getByRole('button', { name: section, exact: true }).click()
      expect(await page.evaluate(() => document.documentElement.scrollWidth), `${section} at ${width}px`).toBeLessThanOrEqual(width)
    }
  }
})
