import { expect, test } from './fixtures'

test.describe('shell', () => {
  test('loads with Aleph Void branding and a default song', async ({ midiPage: page }) => {
    await expect(page).toHaveTitle(/Conway's Sequencer · Aleph Void/)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText("Conway's Sequencer")
    await expect(page.locator('a[href="https://alephvoid.com"]').first()).toBeVisible()
    await expect(page.getByTestId('brand-logo').first()).toBeVisible()
    await expect(page.getByTestId('channel-count')).toContainText('8 / 62 channels')
    await expect(page.getByTestId('sections-table').locator('tbody tr')).toHaveCount(1)
  })

  test('carries Open Graph and Twitter Card metadata for link previews', async ({ midiPage: page }) => {
    const origin = 'https://conways-sequencer.alephvoid.com'
    const meta = (selector: string) => page.locator(`meta[${selector}]`).getAttribute('content')

    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `${origin}/`)
    expect(await meta('property="og:type"')).toBe('website')
    expect(await meta('property="og:url"')).toBe(`${origin}/`)
    expect(await meta('property="og:title"')).toBe("Conway's Sequencer")
    expect(await meta('property="og:description"')).toMatch(/Conway's Game/)
    expect(await meta('property="og:image"')).toBe(`${origin}/og-image.png`)
    expect(await meta('property="og:image:width"')).toBe('1200')
    expect(await meta('property="og:image:height"')).toBe('630')
    expect(await meta('property="og:image:alt"')).toBeTruthy()
    expect(await meta('name="twitter:card"')).toBe('summary_large_image')
    expect(await meta('name="twitter:title"')).toBe("Conway's Sequencer")
    expect(await meta('name="twitter:image"')).toBe(`${origin}/og-image.png`)
    expect(await meta('name="twitter:image:alt"')).toBeTruthy()

    // Scrapers fetch the card from the same path on whatever host serves the build.
    const image = await page.request.get(new URL('/og-image.png', page.url()).toString())
    expect(image.ok()).toBe(true)
    expect(image.headers()['content-type']).toMatch(/^image\/png/)
    expect((await image.body()).length).toBeGreaterThan(10_000)
  })

  test('gives the grid most of the viewport and lets the settings drawer collapse', async ({ midiPage: page }) => {
    const viewport = page.viewportSize()!
    const gridPanel = page.getByTestId('grid-panel')
    const withDrawer = (await gridPanel.boundingBox())!
    await expect(page.getByTestId('settings-drawer')).toBeVisible()

    await page.getByTestId('toggle-settings').click()
    await expect(page.getByTestId('settings-drawer')).toHaveCount(0)
    await expect(page.getByTestId('toggle-settings')).toHaveAttribute('aria-expanded', 'false')
    await expect(page.getByTestId('play')).toBeVisible()
    const collapsed = (await gridPanel.boundingBox())!
    expect(collapsed.height).toBeGreaterThan(withDrawer.height)
    expect(collapsed.height).toBeGreaterThan(viewport.height * 0.6)
    // Nothing scrolls off-screen: the shell is sized to the viewport.
    expect(collapsed.y + collapsed.height).toBeLessThanOrEqual(viewport.height)

    await page.reload()
    await expect(page.getByTestId('settings-drawer')).toHaveCount(0)
    await page.getByTestId('toggle-settings').click()
    await expect(page.getByTestId('sections-table')).toBeVisible()
  })

  test('toggles full screen from the toolbar', async ({ midiPage: page }) => {
    const button = page.getByTestId('toggle-fullscreen')
    await expect(button).toHaveText(/Full screen/)
    await expect(button).toHaveAttribute('aria-pressed', 'false')

    // Headless Chromium has no real window to go full screen, so stub the
    // API the way a browser would drive it: resolve, then fire fullscreenchange.
    await page.evaluate(() => {
      let element: Element | null = null
      Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => element })
      document.documentElement.requestFullscreen = async () => {
        element = document.documentElement
        document.dispatchEvent(new Event('fullscreenchange'))
      }
      document.exitFullscreen = async () => {
        element = null
        document.dispatchEvent(new Event('fullscreenchange'))
      }
    })

    await button.click()
    await expect(button).toHaveText(/Exit full screen/)
    await expect(button).toHaveAttribute('aria-pressed', 'true')
    await button.click()
    await expect(button).toHaveText(/^.*Full screen$/)
    await expect(button).toHaveAttribute('aria-pressed', 'false')
  })

  test('explains when Web MIDI is unavailable', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'requestMIDIAccess', { configurable: true, value: undefined })
    })
    await page.goto('/')
    await expect(page.getByTestId('midi-status')).toContainText('not available')
    await expect(page.getByTestId('enable-midi')).toBeDisabled()
  })
})

test.describe('MIDI output selection', () => {
  test('lists the interfaces and remembers the choice across reloads', async ({ midiPage: page }) => {
    await expect(page.getByTestId('midi-status')).toContainText('Enable MIDI')
    await page.getByTestId('enable-midi').click()
    const select = page.getByTestId('midi-output')
    await expect(select.locator('option')).toHaveCount(3)
    await expect(select.locator('option').nth(1)).toHaveText(/Conway Interface \(Fake Devices\)/)
    await select.selectOption('conway')
    await expect(page.getByTestId('midi-status')).toContainText('Sending to Conway Interface')

    await page.reload()
    await page.getByTestId('enable-midi').click()
    await expect(page.getByTestId('midi-output')).toHaveValue('conway')
    await expect(page.getByTestId('midi-status')).toContainText('Sending to Conway Interface')
  })

  test('reacts to hot-plugging', async ({ midiPage: page }) => {
    await page.getByTestId('enable-midi').click()
    await page.getByTestId('midi-output').selectOption('other')
    await expect(page.getByTestId('midi-status')).toContainText('Some Other Synth')
    await page.evaluate(async () => {
      const access = await navigator.requestMIDIAccess()
      ;(access.outputs as unknown as Map<string, unknown>).delete('other')
      window.__midiStateChange?.()
    })
    await expect(page.getByTestId('midi-output').locator('option')).toHaveCount(2)
    await expect(page.getByTestId('midi-status')).toContainText('Select an output')
  })
})
