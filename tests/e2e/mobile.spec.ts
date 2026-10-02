import { devices } from '@playwright/test'
import { expect, test, type Page } from './fixtures'

// A touch phone in portrait. The fixtures' fake MIDI still applies.
test.use({ ...devices['Pixel 7'] })

async function pageWidthFits(page: Page) {
  const viewport = page.viewportSize()!
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth)
  expect(scrollWidth).toBeLessThanOrEqual(viewport.width)
}

test.describe('phone layout', () => {
  test('fits the screen width and starts with the settings drawer closed', async ({ midiPage: page }) => {
    await pageWidthFits(page)
    await expect(page.getByTestId('settings-drawer')).toHaveCount(0)
    await expect(page.getByTestId('toggle-settings')).toHaveAttribute('aria-expanded', 'false')
    await expect(page.getByTestId('play')).toBeVisible()
    await expect(page.getByTestId('enable-midi')).toBeVisible()
    await expect(page.getByTestId('add-channel')).toBeVisible()
    await expect(page.getByTestId('channel-name').first()).toBeVisible()
    await expect(page.getByTestId('channel-remove').first()).toBeVisible()

    // The drawer stacks into one column without widening the page.
    await page.getByTestId('toggle-settings').tap()
    await expect(page.getByTestId('sections-table')).toBeVisible()
    await expect(page.getByTestId('midi-channel')).toBeVisible()
    await expect(page.getByTestId('export-song')).toBeVisible()
    await pageWidthFits(page)
    // The choice is remembered across reloads, as on desktop.
    await page.reload()
    await expect(page.getByTestId('settings-drawer')).toBeVisible()

    // The module view, switched on from the drawer's editor settings, stacks above the grid at
    // full width without widening the page either.
    await page.getByTestId('toggle-module-view').tap()
    await expect(page.getByTestId('module-view')).toBeVisible()
    await expect(page.getByTestId('module-output-64')).toBeVisible()
    await pageWidthFits(page)
    const view = (await page.getByTestId('module-view').boundingBox())!
    const grid = (await page.getByTestId('grid-panel').boundingBox())!
    expect(view.y + view.height).toBeLessThanOrEqual(grid.y)
  })

  test('draws a gate with a tap and scrolls the grid with a swipe', async ({ midiPage: page }) => {
    const cell = page.getByTestId('cell-0-0-0')
    await cell.tap()
    await expect(cell).toHaveAttribute('aria-checked', 'true')
    await cell.tap()
    await expect(cell).toHaveAttribute('aria-checked', 'false')

    // Swipe left across the cells: the grid pans and nothing is drawn.
    const grid = page.getByTestId('grid')
    const start = (await page.getByTestId('cell-1-0-2').boundingBox())!
    const x = start.x + start.width / 2
    const y = start.y + start.height / 2
    const client = await page.context().newCDPSession(page)
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] })
    for (let i = 1; i <= 6; i++) {
      await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x - i * 25, y }] })
    }
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await expect.poll(() => grid.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0)
    expect(await page.locator('.cell.on').count()).toBe(0)
  })
})
