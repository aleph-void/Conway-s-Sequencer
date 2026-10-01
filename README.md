# Conway's Sequencer

A client-side binary gate sequencer for the
[Nervous Squirrel Conway's Game](https://www.nervoussquirrel.com/conways_game.html)
eurorack module, by [Aleph Void, LLC](https://alephvoid.com).

Draw on/off steps on a piano-roll style grid, one row per module output, and the
app sends MIDI notes over [Web MIDI](https://developer.mozilla.org/en-US/docs/Web/API/Web_MIDI_API)
so each row becomes a gate on the module. Nothing leaves your browser: there is no
backend, and songs autosave to local storage.

## Features

- **MIDI output picker.** Lists the outputs the browser can see, remembers your
  choice, and follows hot-plugging.
- **Up to 62 channels** on the module's 64 outputs. Each channel maps to an
  output number (1–62), which becomes MIDI note `baseNote + output - 1`
  (output 1 = C2 / note 36 by default, as the module expects).
- **x16 clock.** MIDI note 99 is pulsed 16 times per beat (note-on then note-off,
  50 % duty cycle) for as long as the song is playing, following each section's
  tempo and time signature, so one module output can clock other gear.
- **Play gate.** MIDI note 100 is held on for as long as the song is playing and
  released when it stops, so the module's last output can act as a run/stop gate.
- **Sections** with their own tempo, time signature, bar count and step
  resolution. Leave a section's tempo blank and it inherits the previous
  section's tempo. Reorder sections by dragging the ⋮⋮ grip (or focus it and
  press ↑/↓), and duplicate one, notes included, with ⧉.
- **Draw gates** by clicking or click-dragging across the grid; Enter/Space
  toggles the focused cell for keyboard users.
- **Gates follow the grid.** A gate goes high for the whole of every step it is
  drawn on, and consecutive on-steps hold it high as one long gate until the
  next empty step. The grid draws such a run as one continuous bar.
- **Sample-accurate-ish timing**: a look-ahead scheduler hands messages to the
  MIDI port with explicit timestamps, so JavaScript timer jitter never reaches
  the module. Edits while playing are picked up live.
- **Autosave.** Every edit made in the GUI is written to the browser's local
  storage a moment later and restored on the next visit; the Song panel shows
  when the last save happened and warns if storage is full or disabled.
- **Song browser.** The "Songs" tab on the left edge slides out a drawer listing
  every song saved in this browser, most recently edited first. Pick one to
  load it and work on it (the choice is remembered across reloads), start a new
  song, or delete one. "New" and "Import JSON" add a song to the browser rather
  than replacing the one you have open.
- **Loop, panic (Esc), Space to play/stop**, and JSON export/import.
- **Editor-first layout.** The grid fills the viewport below a one-line
  toolbar (MIDI output + transport); sections, module settings and song files
  live in a collapsible settings drawer whose state is remembered. A Full
  screen button puts the whole GUI in the browser's full-screen mode.

## Browser support

Web MIDI is available in Chromium-based browsers (Chrome, Edge, Opera, Brave).
Firefox needs a site permission add-on; Safari does not support it.

## Development

```sh
npm install
npm run dev          # local dev server
npm run check        # typecheck + lint + unit tests
npm run test:e2e     # Playwright end-to-end tests (needs `npx playwright install chromium` once)
npm run build        # production build to dist/
```

Unit and component tests live next to the code as `*.spec.ts` and run with
Vitest in jsdom. End-to-end tests live in `tests/e2e` and run against the built
app in headless Chromium with a fake Web MIDI implementation that records every
message sent.

## Deployment

`.github/workflows/ci.yml` runs lint, typecheck, unit tests with coverage
thresholds, the production build and the e2e suite on every push and pull
request. On a push to `main` it then builds with `BASE_PATH=/<repo>/` and
deploys `dist/` to GitHub Pages. Enable Pages for the repository with
**Source: GitHub Actions** once, and every merge to `main` ships.

## Automation

The other files under `.github/` are free GitHub features that keep the
repository healthy without any paid plan (the repository is public):

- **Dependabot** (`dependabot.yml`) opens weekly, grouped pull requests for npm
  packages and for the actions used in the workflows. Security updates arrive as
  soon as an advisory is published.
- **Dependabot auto-merge** (`workflows/dependabot-auto-merge.yml`) enables
  GitHub auto-merge on Dependabot's minor and patch bumps, so they land once CI
  is green; majors wait for a human. It needs **Allow auto-merge** enabled in
  the repository settings and a ruleset on `main` that requires the CI job
  (without a required check, auto-merge would merge immediately).
- **CodeQL** (`workflows/codeql.yml`) scans the TypeScript on every pull
  request, every push to `main` and weekly, and reports to the Security tab. If
  CodeQL *default setup* is enabled in the repository's code-security settings,
  disable it or delete this workflow; the two cannot run side by side.
- **Dependency review** (`workflows/dependency-review.yml`) fails a pull request
  that adds a dependency with a known high-severity vulnerability or a strong
  copyleft licence. It requires **Dependency graph** to be enabled under the
  repository's Advanced Security settings.
- **OpenSSF Scorecard** (`workflows/scorecard.yml`) scores supply-chain
  practices on every push to `main` and weekly, and publishes the result so a
  badge can be shown.
- **Workflow lint** (`workflows/workflow-lint.yml`) runs
  [actionlint](https://github.com/rhysd/actionlint) and
  [zizmor](https://github.com/zizmorcore/zizmor) whenever anything under
  `.github/` changes, catching workflow syntax errors and security
  anti-patterns. Every action is pinned to a commit SHA with the version in a
  trailing comment; Dependabot updates both together.

## Song file format

Songs are plain JSON (`*.conway-seq.json`). Unknown fields are ignored on
import and out-of-range values are clamped; see `src/core/serialization.ts`.

```jsonc
{
  "version": 1,
  "name": "Untitled",
  "settings": { "midiChannel": 1, "baseNote": 36, "velocity": 100, "loop": true },
  "channels": [{ "id": "ch_1", "name": "Kick", "output": 0, "muted": false, "solo": false }],
  "sections": [
    {
      "id": "sec_1",
      "name": "A",
      "tempo": 120,                    // null = inherit from the previous section
      "timeSignature": { "beats": 4, "unit": 4 },
      "bars": 4,
      "subdivision": 4,                // steps per beat
      "steps": { "ch_1": [0, 4, 8, 12] } // "on" step indices per channel
    }
  ]
}
```

## License

MIT
