import { test, expect } from '@playwright/test'

test('same-device takeback rewinds the position and saved game', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: /Play a friend/ }).click()
  const undo = page.getByRole('button', { name: 'Take back', exact: true })
  await expect(undo).toBeDisabled()
  for (const [from,to] of [['e2','e4'],['e7','e5']]) {
    await page.getByRole('button', { name: new RegExp(`^${from} `) }).click()
    await page.getByRole('button', { name: new RegExp(`^${to} `) }).click()
  }
  await undo.click()
  await expect(page.getByRole('button', { name: 'e7 Black pawn', exact: true })).toBeVisible()
  await expect(page.locator('.move-panel h3')).toContainText('1 moves')
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: 'Resume game', exact: true }).click()
  await expect(page.getByRole('button', { name: 'e7 Black pawn', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Take back', exact: true }).click()
  await expect(page.getByRole('button', { name: 'e2 White pawn', exact: true })).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('mochess:game'))).toBeNull()
})

test('computer takeback cancels thinking and undoes a completed reply', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: 'Play computer', exact: true }).click()
  const play = async () => {
    await page.getByRole('button', { name: 'e2 White pawn', exact: true }).click()
    await page.getByRole('button', { name: /e4 empty/ }).click()
  }
  await play()
  await page.getByRole('button', { name: 'Take back', exact: true }).click()
  await page.waitForTimeout(3000)
  await expect(page.locator('.move-panel h3')).toContainText('0 moves')
  await play()
  await expect(page.getByRole('status')).toContainText('White to move', { timeout: 15000 })
  await expect(page.locator('.move-panel h3')).toContainText('2 moves')
  await page.getByRole('button', { name: 'Take back', exact: true }).click()
  await expect(page.locator('.move-panel h3')).toContainText('0 moves')
  await expect(page.getByRole('button', { name: 'e2 White pawn', exact: true })).toBeVisible()
  await expect(page.locator('.play-board img')).toHaveCount(32)
})
