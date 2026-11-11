# R-8 Studio — Claude Code Implementation Brief

Version 2 · 9 November 2026 · the original development brief, cleaned up, plus the finished UI design.

**How to use this brief.** Part A is the product and engineering plan: follow its phases and rules. Part B is the UI specification: build every screen to it. The `design/` folder next to this file holds the screenshots, icons, tokens and prototype source that Part B refers to. Keep `design/` beside `BRIEF.md` (for example, both in the starter project's root or in `docs/`).

Two tie-breakers:

1. Where Part A's original "Visual direction" and Part B disagree, Part B wins.
2. Where the design and the hardware disagree, the hardware wins. Never fake an R-8 capability to match a mock-up.

## Contents

**Part A — Product and engineering**
A1 What we're building first · A2 R-8 MIDI behaviour that shapes the build · A3 Mac setup · A4 Starter project and first hardware test · A5 Development brief · A6 Technical references · A7 Next milestone

**Part B — UI design specification**
B1 Principles · B2 Files in this handover · B3 Design tokens · B4 App shell and layout · B5 Components · B6 Icons · B7 Screens · B8 Interaction details · B9 Status vocabulary · B10 Accessibility · B11 Copy style · B12 Data the UI needs · B13 What to build when · B14 Open questions and placeholders

---

# Part A — Product and engineering

## A1. What we're building first

The first working version is built around this setup:

- Hardware: original Roland R-8 Human Rhythm Composer
- Computer: Mac
- Connection: USB-to-5-pin MIDI interface (Roland UM-ONE)
- MIDI direction: Mac MIDI OUT → R-8 MIDI IN
- Application: standalone desktop application
- Interface: modern, dark, minimal (now specified in Part B)
- First goal: program patterns on the computer and hear the R-8 play them

Architecture: Electron + React + TypeScript, with the MIDI engine kept outside the React UI. This keeps timing, pattern editing and hardware integration reliable.

The first version is an external MIDI sequencer. It does not pretend to edit the R-8's internal memory; that is a separate development phase.

V1 feature scope:

| Feature | Priority |
|---|---|
| MIDI device detection | Essential |
| Instrument lanes | Essential |
| 16-step grid | Essential |
| Multiple bars | Essential |
| MIDI note triggering | Essential |
| Velocity editing | Essential |
| BPM and transport | Essential |
| Pattern save/load | Essential |
| Swing and microtiming | Next |
| Piano roll | Next |
| R-8 SysEx integration | Later |

## A2. R-8 MIDI behaviour that shapes the build

From Roland's documentation, as checked for the first brief:

The R-8 can be used as an external MIDI sound module. An external sequencer sends notes and the R-8 plays its assigned instruments. Three constraints follow:

1. Instrument MIDI channels and note numbers are configurable on the R-8, so they must be editable in the app.
2. External MIDI triggering does not apply the R-8's internal per-hit performance parameters. Sound parameters can still be edited on the machine.
3. The R-8 supports MIDI clock sync as a slave, so the computer can control its tempo and transport.

So V1 focuses on excellent MIDI triggering and sequencing. It does not pretend that external MIDI gives full access to the R-8's internal performance editor. Pitch, decay, nuance and microtiming are preserved in the project format for future SysEx and internal-pattern work.

Official specifications: 68 internal voices, 26 copy instruments, and 26 external instruments with a Sound ROM card; at most 32 voices at once.

Added during the design work (8 November 2026), from Roland's R-8 specifications page and two 1989 magazine reviews. Items marked *verify* are unconfirmed until tested on the hardware.

- **Pad banks don't affect MIDI.** The R-8's five pad banks (A–E, 16 pads each) only change what its own pads play. A MIDI note reaches its instrument by note number whichever bank is selected. This is why the Kit designer (B7.6) works per lane, not per pad bank.
- **One receive channel for instruments.** All instruments receive on one instrument receive channel (1–16). Each instrument has one note number, used for both receive and transmit. Lanes therefore normally share one channel. *Verify.*
- **Instrument settings live on the R-8.** Per instrument:
  - pitch ±4 octaves in 10-cent steps
  - decay 0–127
  - nuance 0–15
  - pan in 7 positions on the stereo out, or a multi out 1–8
  - assign mono, poly or exclusive group 1–8
  - sense curve (velocity response) 1–8

  These change every hit of that instrument, including hits triggered over MIDI.
- **Copy instruments.** Up to 26 copies of internal instruments, each with its own settings, note number and name. They are how a lane gets a second version of a sound that MIDI can trigger, for example a quiet ghost snare.
- **System Exclusive.** The owner's manual covers:
  - bulk dumps of patterns, songs and setup
  - transmitting sound parameters
  - address-mapped transfer and a parameter address map

  Nothing SysEx is built until this is read and tested. *Verify.*
- **Performance sections.** A 1989 review says the R-8's four Performance sections let MIDI controllers change decay, nuance or pan. That could later make the sequencer's "kept for R-8" step values audible. *Verify before designing around it.*

Owner's manual pages (ManualsLib table of contents; the pages are scans, so text can't be extracted):

| Topic | Page |
|---|---|
| Instrument table | p. 6 |
| Sound parameters | p. 59–64 |
| Copy instruments | p. 28, 66–67 |
| MIDI receive channel | p. 186 |
| Note numbers | p. 187 |
| Control change | p. 192 |
| Performance section | p. 193 |
| Bulk dump, transmitting sound parameters | p. 198–200 |
| Preprogrammed sound parameters and note numbers | p. 217 |
| Roland exclusive messages | p. 221 |
| Parameter address map | p. 229 |

## A3. Mac setup

Hardware wiring: Mac → USB → UM-ONE → MIDI OUT (5-pin) → R-8 MIDI IN. Connect the interface's MIDI OUT to the R-8's MIDI IN, not OUT to OUT.

Software prerequisites:

```
xcode-select --install
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
brew install node
node -v
npm -v
```

Use Node 22 LTS as the baseline.

## A4. Starter project and first hardware test

ChatGPT prepared a starter project, **R-8 Studio Starter v0.1.0** (Electron · React · TypeScript, 13 files, folder `r8-studio-starter`). It is a separate download and is not part of this handover. It includes:

- Electron desktop application shell
- dark sequencer interface
- six editable instrument lanes
- 16-step programming grid
- MIDI output detection and selection
- configurable MIDI channels and note numbers
- BPM control and playback scheduler
- JSON project export
- initial README and setup instructions

Already working: the MIDI output connection workflow, and scheduling MIDI Note On messages to a selected output.

Still to do: per-step velocity, multi-bar sequencing, MIDI clock generation, project import, and SysEx.

The starter has not been run against a physical R-8. Treat the first hardware connection as a validation step, not a confirmed integration.

Run it:

```
cd r8-studio-starter
npm install
npm run dev
```

If macOS doesn't see the interface, open Audio MIDI Setup → Window → Show MIDI Studio and check whether it appears.

First hardware test. Before pressing Play:

1. Connect MIDI OUT on the interface to MIDI IN on the R-8.
2. On the R-8, enable the Channel Message Switch.
3. Set the R-8's instrument receive channels and note assignments to match the app.
4. Leave the R-8's sync mode on INTERNAL.
5. Select the MIDI interface in R-8 Studio.
6. Activate one kick step and press Play. The R-8 should play the kick.

MIDI clock isn't needed for this test, because the app schedules the notes itself. Clock only matters when the R-8's own sequencer should follow the computer's tempo.

## A5. Development brief

You are building R-8 Studio, a standalone desktop MIDI sequencer and instrument editor for the original Roland R-8 Human Rhythm Composer.

### Product vision

A modern visual programming environment for the Roland R-8. The R-8 remains the sound engine; the computer becomes the sequencing and editing interface. It should feel like a dedicated musical instrument, not a generic DAW or MIDI utility. Elektron-style workflows are the main inspiration, in a restrained dark visual language.

### Hardware

- Computer: macOS
- Hardware: original Roland R-8
- Connection: USB MIDI interface, 5-pin DIN
- MIDI direction: computer MIDI OUT → R-8 MIDI IN
- MIDI protocol: standard MIDI 1.0
- Future integration: Roland R-8 System Exclusive

### Technology

- Electron
- React
- TypeScript
- Vite / electron-vite
- CSS (tokens in `design/tokens.css`) or Tailwind configured from the same tokens
- Web MIDI API for initial MIDI communication
- SQLite or local project storage in a later phase

Keep MIDI communication and sequencing logic separate from React components.

Use a secure Electron architecture:

- Context isolation enabled.
- Node integration disabled.
- No unnecessary renderer access to Node APIs.
- Explicit MIDI permissions.
- SysEx disabled until its implementation is validated.

### Phase 1 — Working external MIDI sequencer

Build on the existing starter project. Do not discard its structure without a clear technical reason.

1. **MIDI connection:**
   - detect available MIDI outputs
   - refresh the device list
   - select a MIDI output
   - display connection status
   - handle device disconnection
   - reconnect without restarting the application
   - show useful error messages
2. **Instrument management:** an editable instrument list. Each instrument needs:
   - name
   - MIDI channel (1–16)
   - MIDI note number (0–127)
   - default velocity (1–127)
   - mute
   - solo
   - enabled state

   Do not assume factory note assignments; the user configures these to match their R-8.
3. **Sequencer:**
   - 16-step grid with 16th-note resolution
   - multiple bars
   - independent instrument lanes
   - step activation and deactivation
   - per-step velocity
   - track mute and solo
   - copy/paste patterns
   - clear pattern
   - duplicate bar
   - pattern naming
4. **Playback engine:** a dedicated sequencing engine with:
   - accurate BPM control
   - look-ahead event scheduling
   - timestamped MIDI messages
   - stable playback independent of React rendering
   - start, stop and restart
   - pattern looping
   - no duplicate MIDI events
   - no stuck notes
   - tempo changes during playback

   Use MIDI Note On to trigger the R-8's instruments. Do not assume that generic MIDI Note Off or CC messages control the R-8's internal per-hit performance parameters.
5. **MIDI clock:** a separate, optional feature:
   - 24 pulses per quarter note: Clock (0xF8)
   - Start (0xFA), Continue (0xFB), Stop (0xFC)
   - Song Position Pointer only if validated

   MIDI clock is not required to trigger external notes; the R-8 can stay on INTERNAL sync when it is purely a sound module. When the R-8's internal sequencer runs as a slave, implement and test external sync separately.
6. **Project management:** a versioned project format. It stores:
   - project name, tempo and time signature
   - instrument assignments
   - patterns and number of bars
   - step events and per-step velocity
   - future performance parameters

   Implement save, load, export JSON, import JSON, autosave, and project validation.

### Phase 2 — R-8-specific editing

Design the data model now to support these features, but do not fake hardware support.

- pitch, decay, nuance and pan per hit
- microtiming
- feel patches
- the Kit designer: each lane's R-8 sound and its settings, stored locally, with a by-hand checklist (B7.6)
- R-8 pattern management
- bulk dump and restore
- SysEx communication

Research the original R-8 MIDI implementation and SysEx documentation before implementing any of these. Keep all R-8-specific communication in an isolated hardware-integration module.

### Phase 3 — Advanced sequencing

Piano roll · pattern chaining · arrangement view · probability · ratchets · swing · humanisation · polyrhythmic pattern editing · multiple pattern banks · performance mode.

### Visual direction

Now fully specified in Part B. The original intent still holds:

- dark, modern and restrained: charcoal backgrounds, warm neutral accents, clear typographic hierarchy
- tight grid alignment and strong visual feedback
- minimal borders, no unnecessary gradients or skeuomorphic hardware illustrations

The sequencer is the primary screen, and a rhythm can be programmed without opening multiple panels. The one deliberate change is colour: the design uses a single orange accent instead of muted per-instrument colours, because orange carries a specific meaning (B1).

### Development rules

1. Build incrementally.
2. Test each MIDI feature independently.
3. Never invent R-8 hardware capabilities.
4. Clearly distinguish local project parameters from parameters actually transmitted to hardware.
5. Keep the sequencing engine independent from the UI.
6. Use TypeScript types throughout.
7. Add unit tests for timing, note dispatch and pattern data.
8. Document hardware-specific configuration.
9. Never silently discard user patterns.
10. Prioritise musical reliability over visual complexity.
11. Show a control only once it does what its label says (added with the design; see B13).

### Immediate task

Start by auditing the existing starter code. Then:

1. Fix any existing bugs.
2. Confirm Electron launches successfully.
3. Confirm Web MIDI device enumeration works.
4. Add the design tokens (`design/tokens.css`) and build the app shell from B4: header modules, navigation and footer. The other screens can be stubs at first.
5. Build the Sequencer screen (B7.1) with the Phase 1 controls: grid, bars, mute and solo, adding/selecting/removing hits, copy/paste/duplicate/clear bar, and undo/redo.
6. Implement per-step velocity in the engine and the UI.
7. Implement multi-bar patterns.
8. Improve MIDI scheduling and transport handling, including follow-playhead and tap tempo.
9. Implement project save, load, import, export and autosave, with the Projects screen (B7.4).
10. Add a MIDI test mode that triggers one selected instrument: the ping on the Instrument map (B7.2) and the test on the MIDI screen (B7.3).
11. Write a hardware testing guide for the original R-8, and build the First connection screen (B7.5) from it.
12. Run the available tests and report what has and has not been verified.

Do not proceed to SysEx yet. The Kit designer is Phase 2.

The immediate success criterion is simple: a user can connect an original Roland R-8, program a multi-bar drum pattern, adjust individual hit velocities, save the project and play it reliably through the hardware.

Prioritise a working musical instrument over a large collection of unfinished features.

## A6. Technical references

- [Original Roland R-8 Owner's Manual](https://www.manualslib.com/manual/691656/Roland-R-8.html): instrument assignments, MIDI configuration, external sound-module operation and bulk transfer (page numbers in A2)
- [Official Roland R-8 specifications](https://support.roland.com/hc/en-us/articles/201940509-R-8-Technical-Specifications): voice architecture, pattern limits and performance parameters
- [Using the Performance Section with an external MIDI device — Roland](https://support.roland.com/hc/en-us/articles/201939139-R-5-R-8-R-8MKII-Using-the-Performance-Section-with-an-External-MIDI-Device)
- [Roland R8 review, February 1989 (muzines)](https://www.muzines.co.uk/articles/roland-r8/2188) and [March 1989 (muzines)](https://www.muzines.co.uk/articles/roland-r8/1373): pad banks, copy instruments, MIDI mapping
- [Web MIDI API documentation](https://developer.mozilla.org/en-US/docs/Web/API/Web_MIDI_API): MIDI access and timestamped messages
- [Electron documentation](https://www.electronjs.org/docs/latest/): desktop application architecture
- [Web MIDI in Electron](https://webmidijs.org/docs/going-further/electron/): MIDI permissions

## A7. Next milestone

Make the next milestone very focused: get the first kick, snare and hi-hat triggering correctly from the computer. Once that works, spend time making the sequencer genuinely enjoyable to use.

Later, explore the R-8's Human Feel system. Its combination of nuance, timing and performance characteristics is a big part of what makes the machine interesting, and the interface should not flatten it into ordinary quantised drum programming. Feel patches are Phase 2. No screen is designed for them yet.

---

# Part B — UI design specification

## B1. Principles

- **It feels like an instrument.** Rounded modules, round buttons, knobs and olive LCD readouts give it a light Teenage Engineering touch without turning it into a costume. The colours come from the R-8: charcoal greys, one orange, the olive LCD.
- **Each colour has one job.**
  - Orange marks what the app is playing or sending right now: the playhead, "played now" values, and send actions.
  - Cream marks selection.
  - Green marks things confirmed on the R-8.
  - Salmon red marks conflicts and destructive actions.
- **It is honest about the hardware.** Every value says where it lives:
  - "played now": the app applies it when sending.
  - "kept for R-8 · not heard yet": stored in the project, not sent.
  - Kit settings: "set on R-8" only after the user says so.

  The app never claims to know what the R-8 is doing. Anything it can't observe is confirmed by the user.
- **The sequencer comes first.** You can program a rhythm without opening panels, and everything about every step is visible at once.
- **Icons where they read at least as clearly as words.** Words stay wherever the meaning matters: parameter names, what reaches the R-8, and onboarding.

## B2. Files in this handover

| Path | What it is |
|---|---|
| `BRIEF.md` | This document |
| `design/screens/01-sequencer.png` | Sequencer: Snare lane open, step 1.08 selected |
| `design/screens/01-sequencer-playing.png` | Playing, with follow-playhead on (bar 2 in view) |
| `design/screens/01-sequencer-empty-step.png` | An empty step selected: step editor in its disabled state |
| `design/screens/01-sequencer-1180.png` | Sequencer at 1180 px wide |
| `design/screens/02-instrument-map.png` | Instrument map, waiting for a ping answer, with a note clash |
| `design/screens/03-midi-and-clock.png` | MIDI and clock |
| `design/screens/04-patterns-and-projects.png` | Patterns and projects |
| `design/screens/05-first-connection.png` | First connection, step 3 of 5 |
| `design/screens/06-kit-designer.png` | Kit designer: Open HH selected, three lanes to update |
| `design/screens/06b-kit-sound-list.png` | Kit designer with the sound list open |
| `design/screens/06c-kit-copy-instruments.png` | Sound list, copy-instruments tab (Rim lane) |
| `design/screens/06-kit-designer-1180.png` | Kit designer at 1180 px wide |
| `design/icons/*.svg` | The 23 icons (B6) |
| `design/tokens.css` | Every colour, size, radius, spacing, shadow and motion value as CSS custom properties |
| `design/source/*.dc.html` | The interactive prototypes, one per screen (Main = Sequencer) |

Screenshots are at 2× (2880 × 1800 for a 1440 × 900 window).

**About the prototype source.** Each `.dc.html` file has two parts:

- an `<x-dc>` template: HTML with `{{holes}}`, `<sc-for>` loops and `<sc-if>` conditions;
- a `class Component extends DCLogic`, whose `renderVals()` fills the holes.

All styles are inline. Read these files for exact styles and interaction maths, but don't port the format. The sample data at the top of each script (lanes, patterns, sounds) is illustrative. Hasib's live design canvas holds the same seven boards.

## B3. Design tokens

Everything is in `design/tokens.css`; use the tokens, not raw values. Dark theme only.

**Surfaces**

| Token | Value | Use |
|---|---|---|
| `--surface-app` | `#131312` | Window background and the 8 px gutter between modules |
| `--surface-well` | `#1D1D1C` | Inset areas: inputs, segmented tracks, the nav track, tiles, checklist rows |
| `--surface-module` | `#272725` | Every module |
| `--surface-band` | `#2F2E2C` | Open-lane band, "waiting" table row, the sound-list popover |
| `--surface-card` | `#333230` | Pattern cards, meter tracks |
| `--surface-raised` | `#363533` | Buttons, number badges |
| `--surface-selected` | `#3D3C39` | Selected tab, segment, tile, nav item |
| `--surface-hover` / `--well-hover` | `#41403C` / `#232321` | Hover (new; the prototypes have no hover styles) |

**Text and lines**

| Token | Value | Use |
|---|---|---|
| `--text` | `#EDE8E0` | Primary text and icons |
| `--text-muted` | `#ADA9A2` | Labels, secondary text |
| `--text-faint` | `#8A8782` | Counts and decorative text only; it is 4.2:1 on modules, so nothing essential uses it |
| `--text-silent` | `#9A968F` | Names of muted lanes |
| `--line-faint` / `--line` / `--line-strong` | `#2A2A28` / `#31302E` / `#3D3C39` | Rows inside wells, dividers inside modules, separators between button groups |

**Meaning colours**

| Token | Value | Use |
|---|---|---|
| `--accent` | `#F0682A` | Playhead, "played now", primary actions, brand dot |
| `--accent-ink` | `#1A0E05` | Text and icons on the accent |
| `--accent-text` | `#F6A27A` | Accent-tinted text on dark (live and "changed" chips) |
| `--accent-chip` | `color-mix(in oklch, accent 22%, well)` | Live and "changed" chip background |
| `--accent-ring` | `color-mix(in srgb, accent 65%, transparent)` | Playhead ring |
| `--select` | `#EDE8E0` | 2 px selection ring, cream badges |
| `--stored` | `#CFCAC0` | R-8-side values: stored arcs and chip text, "on another lane" dot, used copy slot |
| `--outline` | `#6A6862` | Outlined chips, hollow rings, the checklist tick ring |
| `--ok` / `--ok-text` / `--ok-chip` / `--ok-ink` | `#9FD26A` / `#C6E3AE` / `#222B1A` / `#141A0D` | Confirmed on the R-8, connected |
| `--warn` | `#F2A93B` | Amber LED when the interface is missing (specified, not drawn) |
| `--danger` / `--danger-text` / `--danger-chip` / `--danger-row` | `#E8735E` / `#FFC4A3` / `#3A2620` / `#33241F` | Note clashes, invalid fields, destructive actions |
| `--solo` / `--solo-ink` | `#F2C94C` / `#231A02` | Solo button on |
| `--lcd-bg` / `--lcd-ink` / `--lcd-caption` | `#BFC79A` / `#1F2614` / `#4A5233` | LCD readouts |

The accent is a prop in the prototypes (`#F0682A`, with alternatives `#E8452C`, `#F2A93B`, `#D9826A`). Ship `#F0682A`.

**Type**

| Role | Font | Size / weight |
|---|---|---|
| Screen title (`h1`), bpm, step id | Inter (title) / JetBrains Mono (numbers) | 24 / 600 (title), 24 / 700 (mono) |
| Lane and sound names, LCD names, pos/sig | Inter / JetBrains Mono | 16 / 600 (Inter), 16 / 700 (mono) |
| Body, buttons, inputs | Inter | 13 / 400 (buttons 400; primary 600) |
| Labels, captions, values in chips, MIDI messages | JetBrains Mono | 11 / 400 (700 for selected values) |
| Brand "R-8 STUDIO" | JetBrains Mono | 13 / 700, letter-spacing 0.12em |

Only these four sizes exist: 11, 13, 16 and 24.

**Radii:** module 18 · open-lane band 14 · tile, row and well 12 · pad, LCD and input 10 · drawer cell 6 · pills 999 · round buttons, knobs, badges and LEDs 50%.

**Spacing:**

- 8 px window padding and gap between modules
- module padding 12 / 16 / 14 (top / sides / bottom); the compact row-2 modules on the Sequencer use 10 / 14
- inside modules: 16 between groups, 10–12 within a group, 6–8 between controls
- pads: 4 between pads, 12 between groups of four steps
- 2–3 inside segmented tracks

**Sizes:** round buttons 40 (transport, preview, primary icon actions) and 32 (others) · mute/solo 28 · lane badge 24 · pill buttons 32 high (40 for the primary action in First connection and Ping result) · pads 40 × 40 minimum · knobs 64.

**Elevation:**

- 40 px round buttons and pads: inset `0 -2px 0` shadow (`--raise`)
- LCDs: `inset 0 2px 4px` (`--lcd-inset`)
- knob cap: `--knob-cap-shadow`
- popover: `--popover-shadow` over a `--scrim`
- green LEDs glow (`--led-glow-ok`); the playhead LED glows in the accent

**Contrast (computed, WCAG):**

| Pair | Ratio |
|---|---|
| text on module | 12.3 : 1 |
| text-muted on module / on well | 6.4 / 7.2 : 1 |
| text-muted on selected | 4.7 : 1 |
| accent on module | 4.8 : 1 |
| accent-ink on accent | 6.1 : 1 |
| accent-text on well | 8.3 : 1 |
| stored on well | 10.3 : 1 |
| LCD ink / caption on LCD | 8.8 / 4.7 : 1 |
| danger-text on raised | 8.0 : 1 |
| ok-ink on ok | 10.1 : 1 |
| solo-ink on solo | 10.8 : 1 |
| text-faint on module | **4.2 : 1 (decorative only)** |

## B4. App shell and layout

**Window.**

- Designed at 1440 × 900 (content area) and checked at 1180 wide.
- Never scroll horizontally. The header row and footer stay pinned. When the window is shorter than a screen needs, the middle area scrolls vertically.
- Pads never shrink below 40 px; spare height goes to the pads.
- Suggested minimum window: 1180 × 760.

Measured height each screen needs without scrolling:

| Screen | at 1440 wide | at 1180 wide |
|---|---|---|
| Sequencer | 880 | 900 |
| Patterns & projects | 860 | 880 |
| Kit designer | 780 | 860 |
| MIDI & clock | 760 | 820 |
| Instrument map | 740 | 780 |
| First connection | 720 | 720 |

**Header row** (every screen except First connection). Left to right, wrapping when narrow:

1. **Brand and navigation** (flex `1 1 440px`, padding 8 8 8 18):
   - an orange dot and "R-8 STUDIO"
   - nav pills in a well: Sequencer · Kit · Instruments · MIDI · Projects
   - current item: `--surface-selected`, text colour, weight 600, `aria-current="page"`; the others muted, weight 500
   - at about 1180 wide the brand name sits above the nav
2. **Transport:**
   - Stop: 40 round, raised.
   - Play: 40 round. When stopped it is raised with an accent icon. When playing it is filled with the accent, with an accent-ink icon and a 3 px `--accent-ring`.
3. **Tempo and position:**
   - − (32 round), an LCD with the bpm (24 mono 700) and a "bpm" caption, + (32 round), and a Tap pill
   - a separator
   - a second LCD with "pos" (bar.step while playing; `N.--` when stopped, where N is the bar in view) and "sig" (4/4)
4. **Interface status** (links to MIDI):
   - an LED and "UM-ONE" (600)
   - a second line saying what is actually going out: `out · clock off` or `out · clock on`
   - when the interface is missing: amber LED and "UM-ONE · not found" (specified, not drawn)

**Footer** (every screen except First connection):

- LED and "autosaved"
- the last-out icon and the last message sent, e.g. `NOTE ON · CH10 · 38 · V110`, or `—`
- on the right, the screen's hint or a temporary message (B8)

**Modules.**

- `--surface-module`, radius 18.
- Each starts with a label line: lowercase mono 11, `--text-muted`, e.g. "pattern", "edit · bar 1".
- Modules sit on `--surface-app` with 8 px gaps. There are no borders; contrast between surfaces does the work.

## B5. Components

States that apply to every interactive component:

| State | Treatment |
|---|---|
| Hover | raised → `--surface-hover`; wells (tiles, sound pills, rows) → `--well-hover`; pads get a 1 px inset ring `rgba(237,232,224,.22)`; links → `--accent-hover`; 100 ms ease-out |
| Pressed | move down 1 px and drop the `--raise` shadow |
| Selected | 2 px `--select` ring. Pads add a 1 px gap in the band colour inside the ring |
| Focus-visible | 2 px dashed `--select` outline, 2 px offset, so it differs from the solid selection ring and the orange playhead |
| Disabled | 40% opacity, no hover, default cursor, real `disabled` attribute |

Hover, pressed and focus were not drawn in the prototypes; they are specified here.

| Component | Spec | Notes |
|---|---|---|
| Round icon button | 32 or 40 round, `--surface-raised`. Icons are 14 px in 32 buttons and 16 px in 40 buttons. 40 px buttons add `--raise` | Every icon-only button has `aria-label` plus a tooltip (B6). Destructive icons use `--danger-text` |
| Pill button | 32 high, padding 0 14, 13 px sentence case | Primary: accent fill, `--accent-ink`, weight 600 ("Save version"; "Next: hear the kick" is 40 high). Confirm: `--ok` fill, `--ok-ink` ("Yes, it played") |
| Segmented control / tabs | Well track, 3 px padding, pill radius. Segments transparent with muted text; the selected one `--surface-selected`, text colour, 600–700 | Used for nav, pattern bank tabs, kit rows, sound-source tabs (mono 11) |
| Switch | Off: track `--surface-raised`, knob `--text-faint`, left. On: track `--select`, knob `--surface-module`, right | Sizes 30×16 (follow playhead), 44×26 (MIDI clock), 32×18 (instrument on/off). The instrument switch uses a quieter on-state (`--knob-cap-stored` track, cream knob) so eight rows stay calm |
| LCD readout | `--lcd-bg`, mono, radius 10, `--lcd-inset`. Values 24 or 16 / 700; captions 11 `--lcd-caption` | Read-only, except the Kit sound display, which is a button (B7.6) |
| Step pad | See B7.1, "Pad anatomy" | Minimum 40 × 40, radius 10 |
| Knob | 64 round. A conic arc sweeps 270° from 225° in `--pad-empty`. Values fill from the start, or from 12 o'clock for bipolar values. Cap inset 7 px, rotates −135° to +135°, with a 3 × 13 px tick | Live cap `--knob-cap-live` with a dark tick; stored or kit cap `--knob-cap-stored` with a cream tick. Arc colour: no hit → track only; value at default → `--knob-arc-default`; changed → accent (live) or `--stored` (stored or kit) |
| Chip | Mono 11, pill radius | Live or changed: `--accent-chip` with `--accent-text`. Stored: 1 px `--outline` with `--stored` text. Clash: `--danger-chip` with `--danger-text`. OK: `--ok-chip` with `--ok-text` |
| Status dot | 6 px (8 px inside chips) | Green = confirmed on the R-8. Accent = changed, waiting or playing. Hollow 1.5 px muted ring = not tested or not on the R-8 yet. A diamond (rotated square, 1 px radius) in `--danger` = note clash |
| Lane badge | 24 round, mono 11 / 700, two digits (01–08) | Raised normally; cream with `--text-on-cream` when its lane is selected |
| Mute / Solo | 28 round, letters M and S, mono 11 / 700 | Off: raised with muted text. Mute on: `--text-muted` fill with dark text. Solo on: `--solo` fill with `--solo-ink` |
| Text input | Well, radius 10, height 34, padding 0 10–12; mono for numbers | Invalid: 1.5 px inset `--danger` ring and `aria-invalid` |
| Kit lane tile | Button on a well, radius 12 | Selected: `--surface-selected` with a 2 px cream ring (B7.6) |
| Sound pill | 24 high, padding 0 10, on a well | Selected: `--surface-selected`, 2 px cream ring, 600. A 5 px `--stored` dot means another lane uses this sound |
| Popover | `--surface-band`, radius 18, `--popover-shadow`, over a `--scrim` | Used for the Kit sound list (B7.6) |
| Checklist row | Well, radius 12. 32 round tick button (transparent, 1.5 px `--outline` inset ring, check in `--text-faint`), then title (600) and sub (mono 11 muted), then chips | Kit checklist (B7.6) |
| Footer message (toast) | Replaces the footer hint for 2.6 s, in `--text`, `aria-live="polite"` | B8 |

## B6. Icons

All 23 are in `design/icons/`:

- Stroke icons use a 14 × 14 viewBox with a 1.5 stroke; the 12 × 12 ones use 1.3. Both have round caps and joins.
- Filled icons: play, stop, pause, and the dot in ping.
- Colour is `currentColor`.
- Draw them at 14 px in 32 buttons, 16 px in 40 buttons, and 12 px in the footer.

One icon means one thing everywhere. Ping, in particular, always means "send one note now". Every icon-only control has a tooltip and an `aria-label`; the table gives the wording.

| Icon | Used for | Tooltip / label |
|---|---|---|
| `play`, `stop` | Transport | "Play", "Stop" |
| `undo`, `redo` | Sequencer edit module | "Undo", "Redo" |
| `copy` | Copy the bar in view | "Copy bar 1" |
| `paste` | Paste into the bar in view; disabled until something is copied | "Paste into bar 1" |
| `duplicate` | Duplicate the bar into the next one; Kit "Copy instrument" | "Duplicate bar 1 into bar 2" |
| `clear` | Clear the bar (danger colour); clear the MIDI monitor (muted) | "Clear bar 1", "Clear monitor" |
| `ping` | Send one note: step Preview, Kit Preview, Instrument-map ping, "All in order", MIDI test | "Preview: send this hit to the R-8 once", "Ping Kick", "Send one note" |
| `reset` | Reset a step (keeps velocity); restore an autosave | "Reset parameters, keep velocity", "Restore …" |
| `remove` | Remove the selected hit | "Remove this hit" |
| `last-out` | Footer: last message sent | "Last message sent" |
| `import`, `export` | Instrument map, project JSON, kit | "Import instrument map", "Export project (JSON)", "Import kit" … |
| `rescan` | Rescan MIDI ports | "Rescan MIDI ports" |
| `pause` | Pause the MIDI monitor (toggle) | "Pause monitor" |
| `repeat` | Repeat the test note on every quarter note (toggle) | "Repeat on every quarter note" |
| `lock` | Locked features (SysEx) | "Locked" |
| `check` | Checklist tick, "Done on R-8" | "Mark Snare as set on the R-8" |
| `close` | Close the sound list | "Close (Esc)" |
| `chevron-left`, `chevron-right` | Step through sounds | "Previous sound", "Next sound" |
| `chevron-down` | Sound display (rotates 180° when open); the open-lane marker in the track list (drawn at 10 px) | "Change sound" |

## B7. Screens

### B7.1 Sequencer (01)

`01-sequencer*.png` · source `Main.dc.html` · Phase 1

**Purpose.** Program a pattern and see everything about every step without opening panels.

**Row 2** (wraps when narrow):

- **Pattern** (flex `1 1 240px`): label "pattern", an LCD chip with the id ("A01"), and a name input (16 / 600) that fills the rest.
- **Bars** (flex `2 1 400px`):
  - label "bars" and a "follow playhead" switch
  - one 40 px tab per bar, containing:
    - an LED: accent when the playhead is in that bar; cream on the bar in view
    - "bar N"
    - a 16-dot preview: a dot lights where any lane has a hit; cream on the bar in view, `--text-faint` elsewhere, `#34332F` when empty
  - the bar in view is `--surface-selected` with a 2 px cream ring
  - a 40 px "+" well adds a bar
- **Edit** (fixed width):
  - label "edit · bar N", always naming the bar the actions affect
  - buttons: undo · redo | copy · paste · duplicate | clear

**Row 3:**

- **Grid area** (flex `999 1 700px`; inner minimum 640 px; columns 204 px tracks and the steps).
  - **Tracks module:** label "tracks". Each row has a lane button (badge, name, and a chevron on the open lane) then M and S. Rows share the spare height (`flex: 1 1 40px`, minimum 40).
  - **Steps module:** a header row with an LED and a number per step:
    - playhead: accent LED with glow
    - beat steps 1, 5, 9, 13: `#6A6862` LED and text colour
    - other steps: `--pad-empty` LED and muted text
    - the selected step's number: bold

    Below the header are 16 pads per lane, in four groups of four.
  - **The open lane** (one at a time) sits on a band: `--surface-band`, radius 14, 6 px padding, extending 6 px past the column. Its drawer opens below its pads. The tracks side lists parameter names; the steps side shows every step's value, aligned under its pad.
- **Step editor** (flex `1 1 300px`), described below.

**Pad anatomy:**

| Layer | Look |
|---|---|
| Empty | `--pad-empty`, radius 10, inset shadow `0 -2px 0 rgba(0,0,0,.25)` |
| Hit | Body `--pad-hit`. An accent fill rises from the bottom; height = velocity / 127, minimum 14% |
| Ratchet > 1 | The fill splits into n columns with 2 px gaps |
| Chance < 100 | The fill becomes diagonal stripes at 135°: 4 px accent, 3 px `--pad-stripe` |
| Edited | Any parameter other than velocity is off its default: 5 px cream dot, top right |
| Playhead | Fill `--pad-head`, plus a 2 px `--accent-ring`; the step's LED lights |
| Selected | 1 px gap, then a 2 px cream ring |
| Silent lane | Lane muted, or another lane soloed: body `--pad-silent`, fill `--text-faint`, lane name `--text-silent` |

**Drawer** (open lane only):

- A well with radius 12, titled "every step · snare · bar 1", and a legend: "• default", "[+8%] edited".
- **"played now"** (accent dot):
  - velocity row, 28 px: the number and a 3 px meter
  - micro, chance and ratchet rows, 18 px each
  - edited values show as live chips; defaults show as a 4 px dot
- A divider.
- **"kept for R-8"** (hollow dot): pitch, decay, nuance and pan. Edited values show as outlined (stored) chips.
- The selected step's column has a `#34332F` background, bold values, and inverted (cream) chips. Clicking any cell selects that step.

**Step editor:**

- **Header:** the label "step", and on the right the lane's status from the Instrument map: "heard on R-8" with a green LED, or "not tested on R-8" with a hollow dot.
- **Step id** in bar.step form (24 mono 700), with the lane name (16 / 600) and a line such as "ch 10 · note 38 · default vel 110".
- **"played now"** (accent dot): a 2 × 2 grid of velocity, micro, chance and ratchet.
- **"kept for R-8 · not heard yet"** (hollow dot): a 2 × 2 grid of pitch, decay, nuance and pan.
- **Actions** (40 round): Preview (ping) · Reset · then, spaced apart, Remove (danger).
- **Empty step selected:** the line reads "no hit here · click the pad to add one" in `--text`; knobs show the track only, values read "—", and the actions are disabled.

**Parameters:**

| Parameter | Range | Display | Default | What happens to it |
|---|---|---|---|---|
| velocity | 1–127 | `110` | lane default velocity | Sent as the Note On velocity |
| micro | −50…+50 % of a step | `+8%`, `−3%`, `0` | 0 | The app shifts the send time |
| chance | 0–100 % | `75%` | 100 | The app decides whether to send |
| ratchet | 1–4 | `×2` | 1 | The app sends n evenly spaced notes within the step |
| pitch, decay, nuance | −50…+50 (placeholder) | `+4`, `−12` | 0 | Stored only, never sent |
| pan | −50…+50 (placeholder) | `L20`, `C`, `R20` | 0 | Stored only, never sent |

**Interactions:**

- **Pads.** Click an empty pad to add a hit at the lane's default velocity and select it. Click a hit to select it. Click the selected hit to remove it. The footer legend teaches this with tiny pad pictures.
- **Lane name.** Opens that lane's drawer; only one is open at a time.
- **Bar tabs.** Show that bar. While playing with follow on, the view follows the playhead. Clicking a tab while playing turns follow off.
- **Edit actions** act on the bar in view:
  - Copy puts the bar on the clipboard.
  - Paste replaces the bar from the clipboard; it is disabled when the clipboard is empty.
  - Duplicate copies bar N into bar N+1 (wrapping to 1), shows N+1, and turns follow off.
  - Clear empties every lane in the bar and shows the message "bar 1 cleared · undo brings it back".
- **Undo/redo.** The last 50 edits. A knob drag is one undo step.
- **Mute/solo.** As in B5. Any solo silences every lane that isn't soloed.
- **Tempo.** ± changes it by 1 bpm (40–250). Tap averages taps within 2.5 s (two taps minimum) to 0.1 bpm. Tempo changes apply during playback.
- **Stop** returns playback to the start of the pattern; the position readout shows `N.--`.
- **Preview** sends the selected hit once, and the footer shows the message sent.
- **Reset** returns micro, chance, ratchet, pitch, decay, nuance and pan to their defaults, and keeps velocity.

**Edge cases:**

- **More than 8 lanes:** rows keep their 40 px minimum; the grid area scrolls vertically while the step editor stays put.
- **Long lane names:** one line with an ellipsis, 24 characters maximum.
- **Long pattern names:** the input scrolls.
- **More than 4 bars:** the design is drawn for up to 4 bars. If more are allowed, tabs keep a 120 px minimum and the tab row scrolls sideways.
- **No interface:** nothing is sent, but the transport still runs, so editing isn't blocked. The header LED turns amber and the footer reads "not sending · no interface".

### B7.2 Instrument map (02)

`02-instrument-map.png` · source `Instruments.dc.html` · Phase 1

**Purpose.** Match each lane to the R-8 (which note, on which channel, at what default velocity) and confirm each one by ear.

**Map module** (flex `999 1 760px`):

- Label "instrument map · 8 lanes". When two lanes share a note, a clash chip appears: "High Tom and Open HH both send note 46".
- Title "Match each lane to your R-8", with "Each lane sends one note on one channel. Nothing is assumed from factory settings."
- Actions: Import and Export (icons), and "All in order" (ping icon plus text), which pings every lane one after another.
- **Table columns:**

  | Column | Content |
  |---|---|
  | on | Switch (quiet variant) |
  | lane | Badge and name input |
  | ping | 34 px round button |
  | channel | Input |
  | note | Input |
  | default vel | Input |
  | status | Dot and text |

  Grid template: `44px minmax(180px,1.6fr) 40px 84px 84px 104px minmax(170px,1.3fr)`. Rows have 7 / 8 px padding, radius 12, and `--line` separators.
- A "+ Add lane" row at the bottom (48 high, well, muted).

**Right column** (flex `1 1 300px`):

- **Ping result:**
  - "ping · waiting for you"
  - "04 Open HH" with "ch 10 · note 46 · v 90"
  - "One note sent. Did the R-8 play the open hi-hat?"
  - buttons: "Yes, it played" (green) and "Wrong or silent"
- **"if nothing plays":** four checks, then a link to the first-connection guide.
- **"what this map controls":** "Only the note, channel and velocity each lane sends. Which R-8 sound a lane plays, and how it's tuned, is set in Kit."

**Row statuses:**

| Status | Look | Set by |
|---|---|---|
| heard on R-8 | Green LED | "Yes, it played" |
| waiting for your answer | Accent dot, row on `--surface-band`, ping button filled accent | Pinging |
| same note as Open HH | Danger diamond, `--danger-row`, note-input ring | Automatic |
| not tested | Hollow dot | Default |

**Interactions:**

- **Ping** sends one Note On (the lane's channel, note and default velocity), marks the row as waiting, and asks in the Ping result module.
- **"Yes, it played"** → heard on R-8.
- **"Wrong or silent"** → not tested, and the "if nothing plays" module gets a cream ring.
- **Editing a heard lane's channel, note or velocity** resets it to not tested, because the app can no longer know it works.

**Validation:**

- Channel 1–16, note 0–127, velocity 1–127. Invalid values get a danger ring and a message under the table.
- If lanes use different channels, show a quiet note: "The R-8 hears instruments on one channel" (see A2, *verify*). This note is not drawn.

**Edge cases:**

- Turning a lane off greys its row; the lane isn't sent, and its pads show as silent in the Sequencer.
- Removing a lane that has hits asks first: "Remove Rim and its 12 hits? You can undo this."

### B7.3 MIDI & clock (03)

`03-midi-and-clock.png` · source `Midi.dc.html` · Phase 1

**Left column** (flex `6 1 520px`):

- **Output:**
  - label "output" and a rescan icon button
  - output cards as radio choices: "UM-ONE · usb midi interface · port 1 · connected" (selected, 2 px cream ring) and "IAC Driver Bus 1 · macos virtual port"
  - note: "If the interface is unplugged, sending pauses and the status light turns amber. It reconnects on its own."
- **Monitor:**
  - label "monitor · outgoing · newest first", with pause (toggle) and clear icon buttons
  - a table on a well: pos · type · ch · note · vel; note rows carry an accent dot
  - outgoing messages only, because there is no MIDI IN cable

**Right column** (flex `5 1 420px`):

- **MIDI clock:**
  - a switch labelled "off" ("Send MIDI clock")
  - "Not needed to play notes. Turn it on only when the R-8's own sequencer should follow this tempo, with the R-8 set to MIDI sync."
  - three rows, each "off": Clock pulses (F8 · 24 ppqn), Start · Continue · Stop (FA FB FC), and Song Position Pointer with a "not yet tested on R-8" chip
- **Timing:**
  - Output offset, −50…+50 ms (slider labels "earlier · 0 · later")
  - Scheduler look-ahead, 25–250 ms ("edits heard sooner" … "steadier timing")
- **Test one instrument:**
  - a lane select ("01 Kick · ch 10 · note 36")
  - Send one note (40 round, accent, ping)
  - Repeat on every quarter note (40 round toggle, repeat icon)
- **System exclusive:** "Off. Pattern and bulk transfer come later." and a lock.

**States to build:**

| State | What the screen shows |
|---|---|
| No outputs found | "No MIDI outputs found. Plug in the interface or check Audio MIDI Setup." Rescan stays available |
| MIDI access refused | Explain how to allow it |
| Interface unplugged | Its card shows "not found" with an amber LED, and the header updates |
| Monitor paused | The pause icon turns into play, and the list freezes with the label "paused" |

### B7.4 Patterns & projects (04)

`04-patterns-and-projects.png` · source `Projects.dc.html` · Phase 1, with bank tabs from Phase 3

- **Project module (full width):**
  - label "project"
  - title (the project name) with "120.0 bpm · 4/4 · 8 lanes · 6 patterns"
  - actions: import and export JSON (icons) | "Save as…" | "Save version" (primary)
- **Patterns** (flex `999 1 700px`):
  - "patterns · 6 of 16", bank tabs A B C D, and the hint "click to open · drag to reorder · ⌥-drag to duplicate"
  - a 4 × 4 grid of slots. A filled card (`--surface-card`, radius 12) shows the id, "4 bars", the name, and a three-row mini preview of kick, snare and hat (accent, `#EDE3C8` and `--text-muted` dots; empty `#45443F`). The current pattern has a cream ring.
  - empty slots are wells with the id and a "+"
- **Right column:**
  - **Saved:** "All changes autosaved" with the file path (`~/Music/R-8 Studio/Late Sessions.r8s`)
  - **Autosave history:** six rows (what changed · when · restore icon), with "restoring keeps the current version in history"
  - **Recent projects:** "Late Sessions — open now", "R-8 note map test — yesterday"

**Behaviour:**

- Autosave after every edit.
- "Save version" makes a named snapshot.
- Restoring an autosave first saves the current state as a new history entry, so nothing is discarded.
- Import validates the version and the shape. On failure it says what's wrong and changes nothing.
- Until multiple banks exist (Phase 3), show bank A only and hide the tabs.
- Drag-to-reorder and ⌥-drag to duplicate are in the hint, but are not specified further.

### B7.5 First connection (05)

`05-first-connection.png` · source `Setup.dc.html` · Phase 1 (immediate task 11)

**Layout:**

- A centred column, 760 px maximum, with "Skip setup" at the top.
- On the left, a step list ("5 steps"): Wire it up · Choose the output · Prepare the R-8 · Hear the kick · Map the other instruments.
  - Done steps show ✓ on green.
  - The current step is raised, with a cream dot.
  - Future steps have a hollow `#66645E` ring.
- Step 3 is drawn: "step 3 of 5", title "Get the R-8 ready to listen", and "Three checks on the R-8 itself. R-8 Studio can't read them back, so tick each one once you've checked it."
  - **Signal path:** Mac (R-8 Studio) → usb → UM-ONE (MIDI OUT) → 5-pin → Roland R-8 (MIDI IN), with "interface found".
  - **Three ticks:**
    - Channel Message Switch is on — "Without it the R-8 ignores incoming notes."
    - Sync mode is INTERNAL — "R-8 Studio times every note itself…"
    - Kick's channel and note match — with channel and note inputs
  - **Buttons:** Back, and "Next: hear the kick" (primary, 40 high).

Steps 1, 2, 4 and 5 aren't drawn; follow step 3's pattern. Step 4 reuses the Instrument map's ping question ("Did the R-8 play the kick?"). Step 5 hands over to the Instrument map.

### B7.6 Kit designer (06, 06b, 06c)

`06-kit-designer*.png`, `06b-kit-sound-list.png`, `06c-kit-copy-instruments.png` · source `Kit.dc.html` · Phase 2

**Purpose.** Choose which R-8 sound each lane plays and how it's set (pitch, decay, nuance, pan, output, assign, sense curve). Settings are stored in the project and carried to the R-8 by hand with a checklist until SysEx transfer is validated. The screen works per lane, not per pad bank (A2).

**Left column** (flex `999 1 700px`):

- **Kit module:**
  - label "kit · 8 lanes · the R-8 hears every sound on ch 10"
  - a status chip: "3 lanes to update on the R-8" (accent chip) or "R-8 matches this kit" (ok chip)
  - title "Choose and shape each lane's sound", with "Saved in this project. The R-8 only changes when you set it there."
  - import and export icons
  - eight lane tiles in a 4 × 2 grid. Each tile shows:
    - badge and lane name (muted)
    - sound name (16 / 600)
    - "int 20 · note 46" (mono 11), in `--danger-text` with a diamond when the note is shared
    - the status line
- **Checklist module ("set these on the R-8 by hand · 3 to do"):**
  - legend: a "72" accent chip = "changed since you last set it"
  - one row per lane that isn't set:
    - tick button
    - title "Snare → Snare 4"
    - sub: "decay changed", "pitch and decay changed", "make copy 01 of Rim 1: RIM TIGHT", or "not on R-8 yet"
    - chips in R-8 terms: `note 38` · `pitch +0.6 st` · `decay 72` · `nuance 9` · `pan C` (or `out 3`) · `poly` / `mono` / `exc 1` · `curve 4`
    - changed values are accent chips; the rest are outlined; a lane never set has every chip in accent
  - empty state: "Nothing to set. The R-8 matches this kit, going by what you've ticked."
  - footer, with lock icons: "Sending the whole kit over SysEx comes later." and "Reading sounds back needs a cable from the R-8's MIDI OUT."

**Right column — sound module** (flex `1 1 400px`):

- **Lane header:**
  - "lane" and the status
  - "04 Open HH"
  - "sends note 46 on ch 10 · every hit plays this sound"
  - when the note is shared, a clash line with a "Fix in Instruments" link
- **Sound:**
  - ◀ and ▶ (32 round), with the **sound display** between them: a 48 px LCD button showing the name in capitals (16 / 700), "INT 20/68" or "COPY 01/01", and a chevron
  - below it, "Copy instrument · 25 free" (pill with the duplicate icon)
- **Knobs** (R-8-side style: dark caps, `--stored` arcs):

  | Knob | Range | Display |
  |---|---|---|
  | pitch | −48.0 to +48.0 st in 0.1 st steps (stored as −480…480 tens of cents) | `+0.4 st` |
  | decay | 0–127 | `96` |
  | nuance | 0–15 | `8` |

  A 5 px accent dot before the label means "different from what you last set on the R-8".
- **Rows** (label column 84 px, segmented control, an optional note underneath):

  | Row | Options | Note underneath |
  |---|---|---|
  | pan | L3 L2 L1 C R1 R2 R3 | When the output isn't stereo, the row is disabled at 40% with "pan only applies to the stereo out" |
  | output | stereo · 1–8 | — |
  | assign | mono · poly · exc | "a new hit cuts off the last one" / "hits ring over each other" |
  | exc group | 1–8, only when assign is exc | "cuts off Closed HH, both ways" / "no other lane in group N" |
  | sense curve | 1–8 | — |

  A changed row gets the same accent dot.
- **Actions:**
  - Preview (ping, 40 round), labelled "plays what the R-8 has now"
  - "Done on R-8" (check icon), shown only when the lane isn't set

**Sound list (06b, 06c).** Clicking the sound display opens a popover; nothing about it shows until then.

- **Placement:** 8 px below the display, right-aligned to the module's right edge, 640 px wide (at most viewport − 32). Maximum height is viewport − 300, with the list scrolling inside.
- **Scrim:** dims everything else. The sound display stays above it, with a cream ring and the chevron turned up.
- **Header:**
  - "choose a sound for 04 open hh"
  - source tabs: "internal · 68", "copy · N", and "card" (disabled; tooltip "Needs a sound card in the R-8")
  - a close button
- **Internal tab:** eight groups, each with its label and count in a 76 px column and pills that wrap:

  | Group | Sounds |
  |---|---|
  | kick | 5 |
  | snare | 10 |
  | rim · clap | 3 |
  | hi-hat | 5 |
  | cymbal | 7 |
  | tom | 6 |
  | perc | 24 |
  | other | 8 |

  All 68 fit without scrolling at 900 px high.
- **Copy tab:**
  - "copies N/26" with one pill per copy instrument, then a dashed "+ copy of <current sound>" pill
  - an info box: a 26-cell slot meter ("copy slots on the R-8 · 1 of 26 used") and "A copy instrument is the same R-8 sound with its own pitch, decay, nuance, pan and note. Use one when a lane needs a second version of a sound, like a quiet ghost snare."
- **Footer:** "• on another lane" legend, and "you hear a new sound once it is set on the R-8".

**Interactions:**

- **Tile:** selects the lane. The list's tab resets to that lane's source.
- **Sound display:** toggles the list.
- **Picking a sound** assigns it, closes the list, and shows "Snare 4 is on 02 Snare · set it on the R-8 to hear it".
- **Closing the list:** Esc, × or clicking the scrim. Focus returns to the sound display.
- **◀ ▶** step through the current source without opening the list.
- **Copy instrument** makes copy N of the current sound's internal original, named after it with a letter (`Open HH 1 b`). It assigns the copy to the lane, switches the list to the copy tab, and shows a message. It is disabled at 26.
- **Knobs and rows** edit the lane (status → changed here). Double-clicking a knob returns it to the value last set on the R-8.
- **Tick or "Done on R-8"** saves a snapshot as "set on R-8"; the row leaves the checklist.
- **Preview** sends the lane's note. You hear the R-8's current sound, not the unsaved plan, and the label says so.

**Status** is derived, never guessed:

| Status | Condition |
|---|---|
| not on R-8 yet | No snapshot |
| changed here | Differs from the snapshot |
| set on R-8 | Matches the snapshot |

**Placeholders:**

- The 68 sound names are stand-ins until the instrument table (manual p. 6) is copied in.
- The pitch, decay and nuance shown for each lane are sample values.

## B8. Interaction details (all screens)

**Proposed keyboard map** (not in the prototypes):

| Key | Action | Where |
|---|---|---|
| Space | Play / Stop | Everywhere except text fields |
| ⌘Z / ⇧⌘Z | Undo / Redo the last project edit | Everywhere |
| ⌘C / ⌘V / ⌘D | Copy / paste / duplicate the bar in view | Sequencer, focus not in a text field |
| Arrow keys | Move the selected step (left/right) and lane (up/down) | Sequencer grid |
| Enter | Add the hit at the selected step, or remove it if it's already there | Sequencer grid |
| ⌫ | Remove the selected hit | Sequencer |
| Esc | Close the sound list | Kit |

**Knobs:**

- Drag up to increase, with pointer capture while dragging.
- Full range over 160 px of drag; Kit pitch uses 480 px and Kit nuance 120 px.
- Arrow keys ±1, Shift + arrow ±10, Home/End for minimum and maximum.
- Double-click goes to the default (step editor) or back to the value last set on the R-8 (Kit).

**Messages:**

- Short confirmations appear in the footer for 2.6 s, then the hint returns.
- Messages say what happened and what to do next: "bar 1 cleared · undo brings it back", "copy 02 made from Snare 4 · it needs setting up on the R-8 too".
- Errors stay until the cause is fixed: interface missing, import failed, autosave failed.

**Undo** covers project edits on every screen: steps, bars, lanes, kit settings and pattern names. It does not cover transport, tempo or view state.

**Motion (new; not in the prototypes):**

| Element | Motion |
|---|---|
| Hover backgrounds | 100 ms ease-out |
| Popover and scrim | Fade, popover slides 4 px down, 140 ms (`--ease-out`); closing takes 100 ms |
| Footer message | Fades in over 120 ms, out over 200 ms |
| Playhead, LEDs, pads, knobs | No animation; timing must look exact |

Respect `prefers-reduced-motion` by turning transitions off.

## B9. Status vocabulary

Anything about the R-8's own state is either confirmed by the user or labelled as not sent. It is never inferred.

| On screen | Meaning | Set by |
|---|---|---|
| played now | The app applies this value when it sends | — |
| kept for R-8 · not heard yet | Stored in the project; not sent | — |
| heard on R-8 | The user heard the ping | "Yes, it played" (Instrument map) |
| not tested (on R-8) | Not confirmed, or changed since | Default; editing the lane's MIDI fields resets it |
| waiting for your answer | A ping was sent; the app is waiting for the user | Ping |
| set on R-8 | The user ticked that the kit settings are entered on the R-8 | Checklist tick, "Done on R-8" |
| changed here | Kit settings differ from what was last set on the R-8 | Automatic |
| not on R-8 yet | This lane's kit sound has never been set on the R-8 | Default |
| out · clock off / on | What the app is sending right now | Live |
| autosaved | The project is saved to disk | Automatic |

## B10. Accessibility

- **Contrast:** see B3. Everything essential passes WCAG AA. `--text-faint` is decorative only.
- **Focus order:** header (nav → transport → tempo → interface link) → row 2 → main area (left to right, top to bottom) → right column → footer.
- **Roles and ARIA** carried over from the prototypes:
  - `aria-current="page"` on the current nav item
  - `aria-pressed` on toggles (bar tabs, mute, solo, follow, pause, repeat, sound pills, segments)
  - `aria-expanded` on lane buttons and the sound display
  - `aria-haspopup="dialog"` and `role="dialog"` for the sound list
  - `role="status"` on status chips
  - `aria-invalid` on bad inputs
  - visually hidden labels on the pattern-name, Kit-channel and Kit-note inputs
- **In production:**
  - Make the pad grid a `role="grid"` with roving tabindex.
  - Make knobs `role="slider"` with `aria-valuemin`, `aria-valuemax`, `aria-valuenow` and `aria-valuetext` (e.g. "micro, plus 8 percent").
  - Make segmented rows radio groups.
  - Give every pad a label such as "Snare, step 8, velocity 60". The prototypes do this.
- **Screen readers:** the playhead is not announced. Footer messages and status changes are announced politely.
- **Targets:** at least 24 px. Pads 40, buttons 32–40, sound pills 24.

## B11. Copy style

- Labels: lowercase mono 11 ("pattern", "every step · snare · bar 1").
- Buttons: sentence case ("Save version", "Done on R-8", "Yes, it played").
- " · " separates facts on one line.
- "R-8" never breaks across lines; use a non-breaking hyphen or `white-space: nowrap`.
- Say plainly what happens on the hardware: "plays what the R-8 has now", "you hear a new sound once it is set on the R-8".
- Numbers:
  - lane numbers are two digits (01–08)
  - step ids are bar.step (1.08)
  - MIDI messages are capitals with dots (`NOTE ON · CH10 · 38 · V110`)
  - LCD names are capitals
- No exclamation marks and no apologies. Errors say what happened and what to do.

## B12. Data the UI needs

This sketch is aligned with the design. Fit it to the starter's existing types rather than replacing them.

```ts
type LaneId = string;

interface Lane {
  id: LaneId;
  name: string;               // max 24 chars; one line with an ellipsis in the UI
  channel: number;            // 1–16
  note: number;               // 0–127
  defaultVelocity: number;    // 1–127
  enabled: boolean;
  mute: boolean;
  solo: boolean;
  heard: 'heard' | 'not-tested';   // user-confirmed via ping; reset when channel/note/velocity change
  kit: KitSound;              // Phase 2; stored only
}

interface KitSettings {
  source: 'internal' | 'copy' | 'card';
  index: number;              // internal 1–68, copy 1–26, card 1–26
  pitch: number;              // −480…480, tens of cents (±4 octaves)
  decay: number;              // 0–127
  nuance: number;             // 0–15
  pan: number;                // −3…3 (L3…R3); stereo out only
  output: number;             // 0 = stereo out, 1–8 = multi out
  assign: 'mono' | 'poly' | 'exc';
  excGroup: number;           // 1–8, used when assign = 'exc'
  senseCurve: number;         // 1–8
}
interface KitSound extends KitSettings {
  setOnR8: KitSettings | null;    // snapshot the user ticked; null = never set
}

interface CopyInstrument { slot: number; name: string; baseInternal: number } // slot 1–26, base 1–68

interface Hit {
  velocity: number;           // 1–127   sent
  micro: number;              // −50…50 (% of a step)   applied by the app when built
  chance: number;             // 0–100                  applied by the app when built
  ratchet: number;            // 1–4                    applied by the app when built
  stored: { pitch: number; decay: number; nuance: number; pan: number }; // −50…50 placeholders; never sent
}

interface Pattern {
  id: string;                 // 'A01'
  name: string;
  bars: number;               // 1–4 as drawn
  steps: Record<LaneId, (Hit | null)[][]>; // [bar][step 0–15]
}

interface Project {
  formatVersion: number;
  name: string;
  tempo: number;              // 40–250, 0.1 steps
  timeSignature: '4/4';
  lanes: Lane[];
  copies: CopyInstrument[];
  patterns: Pattern[];
  history: { id: string; what: string; at: string }[]; // autosave history (B7.4)
}
```

## B13. What to build when

**The honest-control rule:** show a control only once it does what its label says. A "played now" knob the engine ignores is a lie.

| Design element | Phase | Notes |
|---|---|---|
| App shell, tokens, header, footer | 1 | Immediate task 4 |
| Sequencer: grid, bars, follow, mute/solo, select/add/remove, velocity, edit actions, undo | 1 | |
| Step editor "kept for R-8" knobs and drawer rows | 1 | Honestly labelled and stored only; the first brief already preserves these in the project format |
| Step editor micro | 2 | "Microtiming", Phase 2 list. Appears when the engine applies it |
| Step editor chance, ratchet | 3 | "Probability", "Ratchets". Each appears when the engine applies it |
| Instrument map, ping, "All in order" | 1 | MIDI test mode |
| MIDI & clock: outputs, monitor, timing, test, clock switch | 1 | Song Position Pointer only once validated |
| Patterns & projects: save/load/import/export/autosave, versions, history | 1 | Bank tabs hidden until Phase 3 |
| First connection | 1 | Immediate task 11 |
| Kit designer: local kit, sound list, copy instruments, checklist | 2 | No SysEx needed |
| Kit: send to the R-8 / read back over SysEx | 2, after validation | Shown locked until then |

If Hasib wants all eight step parameters from day one, build micro, chance and ratchet into the Phase 1 engine. They are app-side timing features, so they can truly be "played now".

## B14. Open questions and placeholders

1. **Sound names and order.** The Kit's 68 names are stand-ins. Copy the real ones from the instrument table, manual p. 6.
2. **Factory note numbers** (manual p. 217). With them, the sound list could play each sound as you click it.
3. **"Kept for R-8" ranges.** The −50…+50 for step pitch, decay, nuance and pan is a placeholder. Map it to the R-8's real per-hit ranges once known.
4. **SysEx.** Read the parameter address map (p. 229) and exclusive messages (p. 221) before unlocking "send kit to R-8".
5. **Performance sections.** Test whether controllers really change decay, nuance or pan (p. 193).
6. **Copy instrument names.** Check the R-8's name length limit (p. 67) and cap the name field to it.
7. **Instrument receive channel.** Confirm it is one channel for all instruments, then add the Instrument map warning (B7.2).
8. **First connection steps 1, 2, 4, 5** aren't drawn (B7.5).
9. **Not drawn:** hover, pressed, focus, motion, the amber "no interface" state and the error states. All are specified here.
10. **Sample data is deliberate.** High Tom and Open HH share note 46 in the sample data, to show the clash state.
11. **Pad banks and feel patches** have no screens yet (A2, A7).
