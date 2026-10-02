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

  test('deletes a song from the browser after confirming in a modal', async ({ midiPage: page }) => {
    await page.getByTestId('song-name').fill('Keep')
    await expect(page.getByTestId('autosave-status')).toHaveAttribute('data-save-state', 'saved')
    await page.getByTestId('new-song').click()
    await page.getByTestId('song-name').fill('Drop')
    await expect(page.getByTestId('autosave-status')).toHaveAttribute('data-save-state', 'saved')

    await page.getByTestId('song-browser-tab').click()
    const entries = page.getByTestId('song-entry')
    await expect(entries).toHaveCount(2)
    const dialog = page.getByRole('dialog')

    // Asking opens a modal naming the song, with focus on Cancel.
    await entries.nth(0).getByTestId('song-delete').click()
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText('Delete “Drop”?')
    await expect(dialog).toContainText('It is the open song')
    await expect(page.getByTestId('confirm-cancel')).toBeFocused()

    // Cancel keeps the song and returns focus to the button that asked.
    await page.getByTestId('confirm-cancel').click()
    await expect(dialog).toHaveCount(0)
    await expect(entries).toHaveCount(2)
    await expect(entries.nth(0).getByTestId('song-delete')).toBeFocused()

    // Escape closes the box but leaves the drawer open; the drawer is inert behind the box.
    await page.keyboard.press('Enter')
    await expect(dialog).toBeVisible()
    await expect(page.locator('aside.drawer')).toHaveJSProperty('inert', true)
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(page.getByTestId('song-browser')).toHaveAttribute('data-open', 'true')
    await expect(entries).toHaveCount(2)

    // Confirming deletes it and opens the remaining song.
    await entries.nth(0).getByTestId('song-delete').click()
    await page.getByTestId('confirm-accept').click()
    await expect(dialog).toHaveCount(0)
    await expect(entries).toHaveCount(1)
    await expect(entries.nth(0)).toContainText('Keep')
    await expect(page.getByTestId('song-name')).toHaveValue('Keep')
    await expect.poll(async () => (await storedSong(page)).name).toBe('Keep')
  })

  test('duplicates a song, notes included, and opens the copy', async ({ midiPage: page }) => {
    await page.getByTestId('song-name').fill('Original')
    await page.getByTestId('cell-0-0-2').click()
    await expect(page.getByTestId('autosave-status')).toHaveAttribute('data-save-state', 'saved')

    await page.getByTestId('song-browser-tab').click()
    const entries = page.getByTestId('song-entry')
    await expect(entries).toHaveCount(1)
    await entries.nth(0).getByTestId('song-duplicate').click()
    await expect(page.getByTestId('song-browser')).toHaveAttribute('data-open', 'false')
    await expect(page.getByTestId('song-name')).toHaveValue('Original copy')
    await expect(page.getByTestId('cell-0-0-2')).toHaveAttribute('aria-checked', 'true')
    await expect.poll(async () => (await storedSong(page)).name).toBe('Original copy')

    // The copy is its own song: editing it leaves the original as it was.
    await page.getByTestId('cell-0-0-5').click()
    await expect(page.getByTestId('autosave-status')).toHaveAttribute('data-save-state', 'saved')
    await page.getByTestId('song-browser-tab').click()
    await expect(entries).toHaveCount(2)
    await expect(entries.nth(0)).toContainText('Original copy')
    await expect(entries.nth(0).getByTestId('song-pick')).toHaveAttribute('aria-current', 'true')
    await expect(entries.nth(1)).toContainText('Original')
    await entries.nth(1).getByTestId('song-pick').click()
    await expect(page.getByTestId('song-name')).toHaveValue('Original')
    await expect(page.getByTestId('cell-0-0-2')).toHaveAttribute('aria-checked', 'true')
    await expect(page.getByTestId('cell-0-0-5')).toHaveAttribute('aria-checked', 'false')
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
