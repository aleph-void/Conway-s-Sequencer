import { expect, test, type Page } from './fixtures'

/**
 * Resolves once the service worker both finished installing (the build is precached) and
 * controls this page, so a reload is answered from the cache rather than the network.
 */
async function serviceWorkerControlsPage(page: Page) {
  // The predicate must stay synchronous: waitForFunction treats a returned promise as truthy.
  await page.waitForFunction(() => navigator.serviceWorker.controller?.state === 'activated')
}

test.describe('progressive web app', () => {
  test('serves a manifest and registers a service worker', async ({ midiPage: page }) => {
    const manifestHref = await page.locator('link[rel="manifest"]').getAttribute('href')
    expect(manifestHref).toBeTruthy()
    const manifest = await page.request.get(new URL(manifestHref!, page.url()).toString())
    expect(manifest.ok()).toBe(true)
    const json = await manifest.json()
    expect(json.name).toBe("Conway's Sequencer")
    expect(json.display).toBe('standalone')
    expect(json.icons.some((icon: { purpose?: string }) => icon.purpose === 'maskable')).toBe(true)

    await serviceWorkerControlsPage(page)
  })

  test('keeps working offline once the service worker has cached the app', async ({ midiPage: page, context }) => {
    await serviceWorkerControlsPage(page)
    // Draw a gate so there is autosaved state to come back to.
    await page.getByTestId('cell-0-0-0').click()
    await expect(page.getByTestId('cell-0-0-0')).toHaveAttribute('aria-checked', 'true')

    await context.setOffline(true)
    await page.reload()
    await expect(page.getByRole('heading', { level: 1 })).toHaveText("Conway's Sequencer")
    await expect(page.getByTestId('channel-count')).toContainText('8 / 64 channels')
    await expect(page.getByTestId('cell-0-0-0')).toHaveAttribute('aria-checked', 'true')
    await expect(page.getByTestId('offline-badge')).toBeVisible()

    await context.setOffline(false)
    await expect(page.getByTestId('offline-badge')).toHaveCount(0)
  })
})
