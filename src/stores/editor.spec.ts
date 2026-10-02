import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { useEditorStore } from './editor'
import { useSongStore } from './song'
import { useTransportStore } from './transport'

describe('useEditorStore', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    vi.spyOn(performance, 'now').mockImplementation(() => Date.now())
    localStorage.clear()
    setActivePinia(createPinia())
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  /** Draw a gate on channel `c` (by position) at step `step` of the first section. */
  function draw(c: number, step: number) {
    const song = useSongStore()
    song.setStep(song.song.sections[0]!.id, song.song.channels[c]!.id, step, true)
  }

  function steps(c: number, section = 0): number[] {
    const song = useSongStore()
    return song.song.sections[section]!.steps[song.song.channels[c]!.id] ?? []
  }

  it('starts with nothing selected and an empty clipboard', () => {
    const editor = useEditorStore()
    expect(editor.selection).toBeNull()
    expect(editor.hasSelection).toBe(false)
    expect(editor.hasClipboard).toBe(false)
    expect(editor.copy()).toBe(false)
    expect(editor.cut()).toBe(false)
    expect(editor.deleteSelection()).toBe(false)
    expect(editor.paste()).toBeNull()
  })

  it('selects a cell and stretches the selection from its anchor', () => {
    const editor = useEditorStore()
    editor.selectCell({ channel: 2, step: 5 })
    expect(editor.selection).toEqual({ channelStart: 2, channelEnd: 3, stepStart: 5, stepEnd: 6 })
    editor.extendTo({ channel: 0, step: 9 })
    expect(editor.selection).toEqual({ channelStart: 0, channelEnd: 3, stepStart: 5, stepEnd: 10 })
    expect(editor.anchor).toEqual({ channel: 2, step: 5 })
    // Stretching again measures from the same anchor, not from the last corner.
    editor.extendTo({ channel: 3, step: 4 })
    expect(editor.selection).toEqual({ channelStart: 2, channelEnd: 4, stepStart: 4, stepEnd: 6 })
    editor.clearSelection()
    expect(editor.selection).toBeNull()
    expect(editor.anchor).toBeNull()
    // Without an anchor, stretching starts a selection.
    editor.extendTo({ channel: 1, step: 1 })
    expect(editor.selection).toEqual({ channelStart: 1, channelEnd: 2, stepStart: 1, stepEnd: 2 })
  })

  it('trims the live selection to the song as it shrinks', () => {
    const song = useSongStore()
    const editor = useEditorStore()
    editor.selectCell({ channel: 6, step: 60 })
    editor.extendTo({ channel: 7, step: 63 })
    expect(editor.liveSelection).toEqual(editor.selection)
    song.removeChannel(song.song.channels[7]!.id)
    expect(editor.liveSelection).toEqual({ channelStart: 6, channelEnd: 7, stepStart: 60, stepEnd: 64 })
    song.updateSection(song.song.sections[0]!.id, { bars: 5 })
    expect(editor.liveSelection).toEqual({ channelStart: 6, channelEnd: 7, stepStart: 60, stepEnd: 64 })
    song.updateSection(song.song.sections[0]!.id, { bars: 3 })
    expect(editor.liveSelection).toBeNull()
    expect(editor.hasSelection).toBe(false)
    expect(editor.copy()).toBe(false)
  })

  it('copies the selected block and pastes it at the cursor on the same channels', () => {
    const song = useSongStore()
    const transport = useTransportStore()
    const editor = useEditorStore()
    draw(1, 0)
    draw(1, 2)
    draw(2, 1)
    draw(2, 8) // outside the block
    editor.selectCell({ channel: 1, step: 0 })
    editor.extendTo({ channel: 2, step: 3 })
    expect(editor.copy()).toBe(true)
    expect(editor.clipboard).toEqual({ channels: 2, steps: 4, rows: [[0, 2], [1]] })

    // The cursor sits at the start when stopped: pasting there writes the same cells back.
    const before = song.revision
    expect(editor.paste()).toEqual({ channelStart: 1, channelEnd: 3, stepStart: 0, stepEnd: 4 })
    expect(song.revision).toBe(before + 1)
    expect(steps(1)).toEqual([0, 2])
    expect(steps(2)).toEqual([1, 8])

    transport.seekToStep(16)
    expect(editor.paste()).toEqual({ channelStart: 1, channelEnd: 3, stepStart: 16, stepEnd: 20 })
    expect(song.revision).toBe(before + 2)
    expect(steps(1)).toEqual([0, 2, 16, 18])
    expect(steps(2)).toEqual([1, 8, 17])
    // The pasted cells are now the selection, anchored at their corner.
    expect(editor.selection).toEqual({ channelStart: 1, channelEnd: 3, stepStart: 16, stepEnd: 20 })
    expect(editor.anchor).toEqual({ channel: 1, step: 16 })
  })

  it('pastes on the selected channels, over what the cells held, and clips at the end', () => {
    const song = useSongStore()
    const transport = useTransportStore()
    const editor = useEditorStore()
    draw(0, 0)
    editor.selectCell({ channel: 0, step: 0 })
    editor.extendTo({ channel: 1, step: 1 })
    editor.copy()
    expect(editor.clipboard).toEqual({ channels: 2, steps: 2, rows: [[0], []] })

    // A selection elsewhere picks the channels; the cursor picks the step. The block's off
    // cells clear what was there, and its second row falls past the last channel.
    draw(7, 33)
    editor.selectCell({ channel: 7, step: 2 })
    transport.seekToStep(32)
    expect(editor.paste()).toEqual({ channelStart: 7, channelEnd: 8, stepStart: 32, stepEnd: 34 })
    expect(steps(7)).toEqual([32])
    expect(steps(0)).toEqual([0])

    // What falls past the end of the song is dropped.
    song.updateSection(song.song.sections[0]!.id, { bars: 1 })
    editor.selectCell({ channel: 7, step: 0 })
    transport.seekToStep(15)
    expect(editor.paste()).toEqual({ channelStart: 7, channelEnd: 8, stepStart: 15, stepEnd: 16 })
    expect(steps(7)).toEqual([15])
    editor.clearSelection()
    editor.selectCell({ channel: 7, step: 0 })
    song.removeChannel(song.song.channels[7]!.id)
    transport.seekToStep(4)
    // The selection is gone with its channel, so the block goes back to the channel it came from.
    expect(editor.paste()).toEqual({ channelStart: 0, channelEnd: 2, stepStart: 4, stepEnd: 6 })
    expect(steps(0)).toEqual([0, 4])
    expect(steps(1)).toEqual([])
  })

  it('deletes and cuts the selected block, keeping the selection', () => {
    const song = useSongStore()
    const editor = useEditorStore()
    draw(0, 3)
    draw(0, 4)
    draw(0, 5)
    draw(1, 4)
    editor.selectCell({ channel: 0, step: 4 })
    editor.extendTo({ channel: 1, step: 4 })
    const before = song.revision
    expect(editor.deleteSelection()).toBe(true)
    expect(song.revision).toBe(before + 1)
    expect(steps(0)).toEqual([3, 5])
    expect(steps(1)).toEqual([])
    expect(editor.selection).toEqual({ channelStart: 0, channelEnd: 2, stepStart: 4, stepEnd: 5 })

    draw(1, 4)
    expect(editor.cut()).toBe(true)
    expect(editor.clipboard).toEqual({ channels: 2, steps: 1, rows: [[], [0]] })
    expect(steps(1)).toEqual([])
    expect(editor.hasSelection).toBe(true)
  })

  it('drops the selection, but not the clipboard, when another song is opened', async () => {
    const song = useSongStore()
    const editor = useEditorStore()
    draw(0, 0)
    editor.selectCell({ channel: 0, step: 0 })
    editor.copy()
    song.newSong()
    await nextTick()
    expect(editor.selection).toBeNull()
    expect(editor.hasClipboard).toBe(true)
    expect(editor.paste()).toEqual({ channelStart: 0, channelEnd: 1, stepStart: 0, stepEnd: 1 })
    expect(steps(0)).toEqual([0])
  })
})
