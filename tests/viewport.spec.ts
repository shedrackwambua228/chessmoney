import { test, expect, type Page } from '@playwright/test'

async function fits(page: Page) {
  await expect.poll(() => page.locator('.play-board:visible').last().evaluate(board => {
    const viewport = { width: window.innerWidth, height: window.innerHeight }
    return [...board.querySelectorAll('.play-square,.rank-label,.file-label')].every(square => {
      const r = square.getBoundingClientRect()
      return r.width > 0 && r.height > 0 && r.left >= 0 && r.top >= 0 && r.right <= viewport.width + 1 && r.bottom <= viewport.height + 1
    })
  })).toBe(true)
  expect(await page.evaluate(() => window.scrollY)).toBe(0)
}

test('all board squares and coordinates fit desktop, portrait and landscape viewports', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /Play a friend/ }).click()
  for (const viewport of [{ width: 1366, height: 768 }, { width: 1280, height: 600 }, { width: 390, height: 844 }, { width: 320, height: 568 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport)
    await fits(page)
    const box = await page.locator('.play-board').boundingBox()
    expect(Math.abs(box!.width - box!.height)).toBeLessThan(1)
    if (viewport.width === 1366) {
      expect(box!.width).toBeGreaterThan(650)
      expect(box!.width).toBeCloseTo(676, 0)
      const players = page.locator('.play-main>.play-player')
      await expect(players.first()).toContainText('Black player')
      await expect(players.last()).toContainText('White player')
      const upper = await players.first().boundingBox(), lower = await players.last().boundingBox()
      expect(upper!.y + upper!.height).toBeLessThanOrEqual(box!.y)
      expect(lower!.y).toBeGreaterThanOrEqual(box!.y + box!.height)
      await page.screenshot({ path: 'test-results/board-desktop.png' })
    }
    if (viewport.width > 740) {
      const sidebar = await page.locator('.play-details').boundingBox()
      expect(sidebar!.x).toBeGreaterThanOrEqual(box!.x + box!.width)
      for (const name of ['Take back', 'New game', 'Resign']) {
        const button = await page.getByRole('button', { name, exact: true }).boundingBox()
        expect(button!.y).toBeGreaterThanOrEqual(0)
        expect(button!.y + button!.height).toBeLessThanOrEqual(viewport.height)
      }
    }
    await page.getByRole('button', { name: /Flip board/ }).click()
    // On phones the controls stack below the board, so return to the board after clicking.
    if (viewport.width <= 740) await page.evaluate(() => window.scrollTo(0, 0))
    await fits(page)
  }
  await page.screenshot({ path: 'test-results/board-landscape.png' })
  await page.getByRole('button', { name: 'Back to lobby' }).click()
  for (const section of ['Analysis', 'Puzzles']) {
    await page.getByRole('button', { name: section, exact: true }).click()
    await fits(page)
    await page.setViewportSize({ width: 320, height: 568 })
    await fits(page)
    await page.setViewportSize({ width: 844, height: 390 })
  }
})

test('online stake board fits without scrolling past stake details', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Online', exact: true }).click()
  await page.getByRole('button', { name: 'Create an account', exact: true }).click()
  const name = `Viewport-${Date.now()}`
  await page.getByLabel('Player name').fill(name)
  await page.getByLabel('Email', { exact: true }).fill(`${name}@example.com`)
  await page.getByLabel('Password', { exact: true }).fill('Viewport test password!')
  await page.getByRole('button', { name: 'Create account', exact: true }).click()
  await page.getByRole('button', { name: 'Stake $10.00 demo & find opponent', exact: true }).click()
  for (const viewport of [{ width: 1366, height: 768 }, { width: 320, height: 568 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport)
    await fits(page)
  }
})
