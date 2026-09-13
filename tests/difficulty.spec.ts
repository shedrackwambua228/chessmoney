import { test, expect } from '@playwright/test'

for (const level of ['easy', 'medium', 'hard']) {
  test(`${level} computer replies and keeps its level when resumed`, async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Play computer', exact: true }).click()
    const selector = page.getByLabel('Computer level')
    await selector.selectOption(level)
    await expect(page.locator('.play-player').first()).toContainText(level[0].toUpperCase() + level.slice(1))
    await page.getByRole('button', { name: 'e2 White pawn', exact: true }).click()
    await page.getByRole('button', { name: /^e4 empty/ }).click()
    await expect(selector).toBeDisabled()
    await expect(page.locator('.move-panel h3')).toContainText('2 moves', { timeout: 15000 })
    await page.reload()
    await page.getByRole('button', { name: 'Resume game', exact: true }).click()
    await expect(page.getByLabel('Computer level')).toHaveValue(level)
    await expect(page.locator('.move-panel h3')).toContainText('2 moves')
  })
}
