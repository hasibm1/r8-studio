# R-8 Studio

A desktop MIDI sequencer for the original Roland R-8 Human Rhythm Composer. The R-8 stays the sound engine; the computer does the sequencing.

Mac → USB → MIDI interface (e.g. Roland UM-ONE) → MIDI OUT → R-8 MIDI IN.

## Run it

Needs Node 22 or newer.

```
npm install
npm run dev
```

| Command | What it does |
|---|---|
| `npm run dev` | The desktop app, with hot reload |
| `npm run dev:browser` | The UI alone in a browser tab at localhost:5199 (projects kept in the browser) |
| `npm test` | Unit tests for timing, note dispatch and pattern data |
| `npm run typecheck` | TypeScript check |
| `npm run build` | Production build into `out/` |

Projects are saved as `.r8s` files (JSON) in `~/Music/R-8 Studio/`.

## What is here

- **Sequencer**: 16-step grid, up to 4 bars, 8 lanes to start (add more), per-step velocity, micro-timing, chance and ratchet, mute and solo, copy/paste/duplicate/clear bar, undo and redo, tap tempo, follow-playhead.
- **Instrument map**: each lane's channel, note and default velocity, with a ping to confirm by ear that the R-8 plays it.
- **MIDI**: output choice, reconnect on replug, outgoing monitor, optional MIDI clock, timing offset and look-ahead, single-note test.
- **Projects**: autosave, history with restore, named versions, JSON import and export, 16 pattern slots.
- **First connection**: a five-step guide for the first hardware test.

Not built yet: the Kit designer, SysEx, swing, pattern chaining (see `docs/BRIEF.md`, Part A phases 2 and 3). Pitch, decay, nuance and pan per step are stored in the project and clearly labelled as not sent.

## Documents

- `docs/BRIEF.md` — the product brief and UI specification; `docs/design/` holds its screenshots, icons, tokens and prototypes.
- `docs/ARCHITECTURE.md` — how the code is laid out, and how it is kept ready for a plugin (VST) version.
- `docs/HARDWARE-TESTING.md` — how to test against a real R-8, and what has and has not been verified.
