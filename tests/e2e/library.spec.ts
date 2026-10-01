import { expect, storedSong, test } from './fixtures'

test.describe('song browser', () => {
  test('lists saved songs in a sliding drawer and loads the one picked', async ({ midiPage: page }) => {
    const browser = page.getByTestId('song-browser')
    const panel = page.getByTestId('song-browser-panel')
    const tab = page.getByTestId('song-browser-tab')

    // Closed by default: the tab sits at the edge, the drawer is off-screen.
    await expect(browser).toHaveAttribute('data-open', 'false')
    await expect(tab).toContainText('Songs')
    await expect(tab).toHaveAttribute('aria-expanded', 'false')
    await expect(panel).not.toBeInViewport()

    // Song A with a gate drawn; song B via New.
    await page.getByTestId('song-name').fill('Song A')
    await page.getByTestId('cell-0-0-2').click()
    await expect(page.getByTestId('autosave-status')).toHaveAttribute('data-save-state', 'saved')
    await page.getByTestId('new-song').click()
    await expect(page.getByTestId('song-name')).toHaveValue('Untitled')
    await expect(page.getByTestId('io-message')).toContainText('"Song A" is kept in the Song browser')
    await page.getByTestId('song-name').fill('Song B')
    await expect(page.getByTestId('autosave-status')).toHaveAttribute('data-save-state', 'saved')

    await tab.click()
    await expect(browser).toHaveAttribute('data-open', 'true')
    await expect(tab).toHaveAttribute('aria-expanded', 'true')
    await expect(panel).toBeInViewport()
    await expect(page.getByTestId('song-browser-close')).toBeFocused()
    const entries = page.getByTestId('song-entry')
    await expect(entries).toHaveCount(2)
    await expect(entries.nth(0)).toContainText('Song B')
    await expect(entries.nth(0).getByTestId('song-pick')).toHaveAttribute('aria-current', 'true')
    await expect(entries.nth(1)).toContainText('Song A')
    await expect(entries.nth(1)).toContainText('8 channels · 1 section · edited')

    // Picking Song A loads it and closes the drawer.
    await entries.nth(1).getByTestId('song-pick').click()
    await expect(browser).toHaveAttribute('data-open', 'false')
    await expect(page.getByTestId('song-name')).toHaveValue('Song A')
    await expect(page.getByTestId('cell-0-0-2')).toHaveAttribute('aria-checked', 'true')
    await expect.poll(async () => (await storedSong(page)).name).toBe('Song A')

    // The choice survives a reload, and the drawer marks it as open.
    await page.reload()
    await expect(page.getByTestId('song-name')).toHaveValue('Song A')
    await tab.click()
    await expect(page.getByTestId('song-entry')).toHaveCount(2)
    await expect(page.locator('[data-testid="song-entry"].current')).toContainText('Song A')

    // Escape closes the drawer and returns focus to the tab.
    await page.keyboard.press('Escape')
    await expect(browser).toHaveAttribute('data-open', 'false')
    await expect(tab).toBeFocused()
  })

  test('deletes a song from the browser after confirmation', async ({ midiPage: page }) => {
    await page.getByTestId('song-name').fill('Keep')
    await expect(page.getByTestId('autosave-status')).toHaveAttribute('data-save-state', 'saved')
    await page.getByTestId('new-song').click()
    await page.getByTestId('song-name').fill('Drop')
    await expect(page.getByTestId('autosave-status')).toHaveAttribute('data-save-state', 'saved')

    await page.getByTestId('song-browser-tab').click()
    const entries = page.getByTestId('song-entry')
    await expect(entries).toHaveCount(2)

    page.once('dialog', (d) => d.dismiss())
    await entries.nth(0).getByTestId('song-delete').click()
    await expect(entries).toHaveCount(2)

    page.once('dialog', (d) => {
      expect(d.message()).toContain('Delete "Drop" from this browser?')
      void d.accept()
    })
    await entries.nth(0).getByTestId('song-delete').click()
    await expect(entries).toHaveCount(1)
    await expect(entries.nth(0)).toContainText('Keep')
    await expect(page.getByTestId('song-name')).toHaveValue('Keep')
    await expect.poll(async () => (await storedSong(page)).name).toBe('Keep')
  })

  test('migrates a song autosaved before the library existed', async ({ page }) => {
    await page.goto('/')
    await page.evaluate(() => {
      localStorage.clear()
      localStorage.setItem(
        'conways-sequencer:song',
        JSON.stringify({ name: 'Old autosave', channels: [{ output: 0 }], sections: [{ tempo: 100 }] }),
      )
    })
    await page.reload()
    await expect(page.getByTestId('song-name')).toHaveValue('Old autosave')
    await page.getByTestId('song-browser-tab').click()
    await expect(page.getByTestId('song-entry')).toHaveCount(1)
    await expect(page.getByTestId('song-entry')).toContainText('Old autosave')
    expect(await page.evaluate(() => localStorage.getItem('conways-sequencer:song'))).toBeNull()
  })
})
