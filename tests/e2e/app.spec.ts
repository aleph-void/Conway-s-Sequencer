import { expect, test } from './fixtures'

test.describe('shell', () => {
  test('loads with Aleph Void branding and a default song', async ({ midiPage: page }) => {
    await expect(page).toHaveTitle(/Conway's Sequencer · Aleph Void/)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText("Conway's Sequencer")
    await expect(page.locator('a[href="https://alephvoid.com"]').first()).toBeVisible()
    await expect(page.getByTestId('brand-logo').first()).toBeVisible()
    await expect(page.getByTestId('channel-count')).toContainText('8 / 64 channels')
    await expect(page.getByTestId('sections-table').locator('tbody tr')).toHaveCount(1)
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
