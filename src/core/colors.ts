/**
 * Track colours for the sequencer grid.
 *
 * Every channel row gets its own hue so a glance tells one track's gates from the next.
 * Hues are OKLCH angles (perceptually uniform, so every track reads at about the same
 * brightness on the dark theme); the CSS turns a hue into the actual colours. The list is
 * ordered so that neighbouring rows always sit far apart on the wheel, and it starts on the
 * brand violet so the first track looks the way it always has.
 */
export const TRACK_HUES: readonly number[] = [
  295, // violet
  145, // green
  25, // red-orange
  235, // blue
  85, // yellow
  325, // magenta
  175, // teal
  55, // orange
  265, // indigo
  115, // lime
  355, // pink
  205, // cyan
]

/** OKLCH hue for the track at `index` (0-based row position); wraps past the palette. */
export function trackHue(index: number): number {
  const n = TRACK_HUES.length
  return TRACK_HUES[((Math.trunc(index) % n) + n) % n]!
}
