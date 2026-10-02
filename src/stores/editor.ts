import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { clampBarRange, type BarClip, type BarRange } from '../core/bars'
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
 *
 * Whole bars are edited through the loop points: the bars between them are the selected
 * bars, and they can be copied, cut and deleted (the song gets shorter) on a clipboard of
 * their own, which also outlives a switch of song. Pasting them puts them in front of the
 * bar the cursor is in (the song gets longer), and they become the loop points.
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
  const barClipboard = ref<BarClip | null>(null)

  /** The selection trimmed to the song as it is now, or null when nothing of it is left. */
  const liveSelection = computed(() =>
    selection.value ? clampRange(selection.value, songStore.song.channels.length, songStore.stepTotal) : null,
  )
  const hasSelection = computed(() => liveSelection.value !== null)
  const hasClipboard = computed(() => clipboard.value !== null)

  /** The selected bars: the loop points, trimmed to the song, or null when there are none. */
  const selectedBars = computed<BarRange | null>(() => {
    const range = songStore.song.settings.loopRange
    return range ? clampBarRange(range, songStore.barTotal) : null
  })
  const hasSelectedBars = computed(() => selectedBars.value !== null)
  const hasBarClipboard = computed(() => barClipboard.value !== null)
  /** The bar the cursor is in, on the whole-song bar axis: where pasted bars go. */
  const cursorBar = computed(() => {
    const at = transport.position
    const timing = at ? songStore.timeline[at.sectionIndex] : undefined
    if (!at || !timing) return 0
    return timing.startBar + Math.floor(at.stepInSection / timing.stepsPerBar)
  })

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

  function copyBars(): boolean {
    const range = selectedBars.value
    if (!range) return false
    const clip = songStore.copyBars(range)
    if (!clip) return false
    barClipboard.value = clip
    return true
  }

  /** Take the selected bars out of the song; the loop points go with them. */
  function deleteBars(): boolean {
    const range = selectedBars.value
    if (!range) return false
    return songStore.deleteBars(range) !== null
  }

  function cutBars(): boolean {
    return copyBars() && deleteBars()
  }

  /** Put the bar clipboard down in front of the cursor's bar (see above). Returns the range it occupies. */
  function pasteBars(): BarRange | null {
    const clip = barClipboard.value
    if (!clip) return null
    return songStore.insertBars(clip, cursorBar.value)
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
    barClipboard,
    selectedBars,
    hasSelectedBars,
    hasBarClipboard,
    cursorBar,
    selectCell,
    extendTo,
    clearSelection,
    copy,
    cut,
    deleteSelection,
    paste,
    copyBars,
    cutBars,
    deleteBars,
    pasteBars,
  }
})
