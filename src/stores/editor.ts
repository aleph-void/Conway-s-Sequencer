import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { clampRange, rangeFromCorners, type Block, type Cell, type CellRange } from '../core/clipboard'
import { useSongStore } from './song'
import { useTransportStore } from './transport'

/**
 * Editing state that is not part of the song: the block of cells selected in the grid and
 * the clipboard it is copied to. Neither is saved; the clipboard outlives a switch to
 * another song, so a block can be carried from one song to the next, while the selection
 * is dropped (its channels and steps mean nothing in the other song).
 *
 * A paste lands where the cursor is: its first step on the transport's current step (the
 * start of the song, or of the loop points, when stopped), and its first channel on the
 * selection's first channel when there is a selection, else on the channel it was copied
 * from. The pasted cells become the selection, so where it landed is visible.
 */
export const useEditorStore = defineStore('editor', () => {
  const songStore = useSongStore()
  const transport = useTransportStore()

  const selection = ref<CellRange | null>(null)
  /** The cell a selection was started from; a keyboard extension stretches from it. */
  const anchor = ref<Cell | null>(null)
  const clipboard = ref<Block | null>(null)
  /** Channel the clipboard's first row was copied from: where it goes back without a selection. */
  const clipboardChannel = ref(0)

  /** The selection trimmed to the song as it is now, or null when nothing of it is left. */
  const liveSelection = computed(() =>
    selection.value ? clampRange(selection.value, songStore.song.channels.length, songStore.stepTotal) : null,
  )
  const hasSelection = computed(() => liveSelection.value !== null)
  const hasClipboard = computed(() => clipboard.value !== null)

  /** Start a selection at one cell. */
  function selectCell(cell: Cell) {
    anchor.value = { ...cell }
    selection.value = rangeFromCorners(cell, cell)
  }

  /** Stretch the selection from its anchor to `cell` (start one there when there is none). */
  function extendTo(cell: Cell) {
    if (!anchor.value) return selectCell(cell)
    selection.value = rangeFromCorners(anchor.value, cell)
  }

  function clearSelection() {
    selection.value = null
    anchor.value = null
  }

  function copy(): boolean {
    const range = liveSelection.value
    if (!range) return false
    clipboard.value = songStore.copyBlock(range)
    clipboardChannel.value = range.channelStart
    return true
  }

  /** Clear the selected cells; the selection stays so the gap can be pasted over. */
  function deleteSelection(): boolean {
    const range = liveSelection.value
    if (!range) return false
    songStore.clearBlock(range)
    return true
  }

  function cut(): boolean {
    return copy() && deleteSelection()
  }

  /** Put the clipboard down at the cursor (see above). Returns the range it covered. */
  function paste(): CellRange | null {
    const block = clipboard.value
    if (!block) return null
    const step = transport.position?.globalStep ?? 0
    const channel = liveSelection.value?.channelStart ?? clipboardChannel.value
    const written = songStore.pasteBlock(block, channel, step)
    if (written) {
      selection.value = written
      anchor.value = { channel: written.channelStart, step: written.stepStart }
    }
    return written
  }

  // A selection belongs to the song it was made in.
  watch(() => songStore.currentId, clearSelection)

  return {
    selection,
    liveSelection,
    anchor,
    clipboard,
    hasSelection,
    hasClipboard,
    selectCell,
    extendTo,
    clearSelection,
    copy,
    cut,
    deleteSelection,
    paste,
  }
})
