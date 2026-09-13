import { test, expect } from '@playwright/test'

test('demo stake pairing and winner balance are visible to both players', async ({ browser }) => {
  const contexts = await Promise.all([browser.newContext(), browser.newContext()])
  const pages = await Promise.all(contexts.map(context => context.newPage()))
  try {
    for (const [i, page] of pages.entries()) {
      await page.goto('http://127.0.0.1:5173')
      await page.getByRole('button', { name: 'Online', exact: true }).click()
      await page.getByRole('button', { name: 'Create an account', exact: true }).click()
      const name = `Stake${i}-${Date.now()}`
      await page.getByLabel('Player name').fill(name)
      await page.getByLabel('Email', { exact: true }).fill(`${name}@example.com`)
      await page.getByLabel('Password', { exact: true }).fill('Browser stake password 123')
      await page.getByRole('button', { name: 'Create account', exact: true }).click()
      await expect(page.getByText('Available: $100.00 demo', { exact: true })).toBeVisible()
    }
    const [white, black] = pages
    await white.getByRole('button', { name: 'Stake $10.00 demo & find opponent', exact: true }).click()
    await expect(white.getByText('Demo stake: $10.00 demo each', { exact: true })).toBeVisible()
    await black.getByRole('button', { name: 'Stake $10.00 demo & find opponent', exact: true }).click()
    await expect(white.getByRole('heading', { name: 'Your turn', exact: true })).toBeVisible()
    await white.getByRole('button', { name: 'Resign', exact: true }).click()
    await white.getByRole('button', { name: 'Confirm resignation', exact: true }).click()
    await expect(black.getByRole('heading', { name: 'Black wins by resignation' })).toBeVisible()
    await expect(black.getByRole('region', { name: 'Post-game review' })).toContainText('No moves were played')
    await expect(black.getByText('Black received the prize. Commission recorded.', { exact: true })).toBeVisible()
    await black.getByRole('button', { name: 'Back to online lobby' }).click()
    await expect(black.getByText('Available: $109.00 demo', { exact: true })).toBeVisible()
  } finally { await Promise.all(contexts.map(context => context.close())) }
})
