# Architecture

## Layers

```
src/core/       Pure TypeScript. Project model, edits, validation, MIDI bytes,
                and pattern → note events. No DOM, no Node, no Electron, no clocks.
src/engine/     The look-ahead scheduler. Given now(), send() and the current
                state, it decides what to send and when. Owns no timer or port.
src/renderer/   The React UI.
  host/         The only code that touches the outside world: MIDI output
                (Web MIDI) and project storage (Electron IPC, or localStorage
                when run in a plain browser). Defined by host/types.ts.
  store.ts      App state. actions.ts: everything the UI can do.
  screens/      One file per screen. ui.tsx: shared components.
src/main/       Electron main process: window, MIDI permission, project files.
src/preload/    The bridge that exposes storage calls to the UI, nothing else.
```

Rules that keep this honest:

- `core/` and `engine/` import nothing from the renderer, Electron or Node. The unit tests run them with a fake clock.
- Components never call the scheduler, the MIDI port or storage. They call `actions.ts`.
- All R-8-specific communication (SysEx, later) goes in its own module behind the host layer.

## Timing

`core/events.ts` has one function, `collectEvents(lanes, pattern, from, to, seed)`: every note that falls in the step range `[from, to)`. Ranges that touch never overlap or leave gaps, so each note is produced exactly once. Micro-timing, ratchets and chance are applied here. Chance uses a seeded hash, so a given seed always gives the same result.

`engine/scheduler.ts` is called every 25 ms. Each call converts "now + look-ahead" into a step position, asks `collectEvents` for the notes between the last position and that one, and sends them with exact timestamps. A tempo change re-anchors at the edge of what is already scheduled, so nothing is sent twice or moved.

In the desktop app the 25 ms tick comes from a Web Worker, and the window has background throttling switched off, so playback keeps time when the window is hidden. React rendering is never in the timing path.

Each Note On is followed by a Note Off at most 30 ms later. Stop sends any outstanding Note Offs immediately.

## Security

Context isolation on, Node integration off, sandboxed renderer, a strict content security policy in the built app, navigation and new windows blocked. The only permission granted is MIDI, and only to the app's own page. Electron reports every Web MIDI request under the name `midiSysex`, so that name is allowed; SysEx is kept off inside the app instead: the UI always requests MIDI with `sysex: false`, which makes the port reject SysEx messages, and `host/midi.ts` refuses SysEx bytes before they reach the port. The UI can only read and write project files by name inside `~/Music/R-8 Studio/`.

## Turning it into a plugin (VST3 / AU) later

The app is shaped so a plugin version reuses most of it. What carries over, and what does not:

| Part | In a plugin |
|---|---|
| Project format (`core/types.ts`, JSON) | Becomes the plugin's saved state as it is |
| `collectEvents` | Maps directly onto the audio callback: the host gives a block's start and end position in beats; convert to steps and emit the notes with sample offsets. It needs no clock of its own, which is why it was written this way |
| Scheduler (`engine/`) | Not needed. The DAW is the clock and transport |
| React UI | Runs unchanged inside the plugin's web view (JUCE 8 supports web-view UIs), talking to the plugin through a new implementation of `host/types.ts` |
| `host/midi.ts`, `host/storage.ts` | Replaced: the plugin outputs MIDI to the DAW, which routes it to the interface; state is saved by the DAW |
| Electron main and preload | Not used |

What a plugin needs that does not exist yet:

1. A C++ plugin shell (JUCE is the usual choice) that outputs MIDI.
2. `collectEvents` and the chance hash ported to C++. They are about 60 lines with no dependencies, and the unit tests in `tests/events.test.ts` define the expected behaviour, so the port can be checked against the same cases. Running the TypeScript itself on the audio thread is not safe for real-time use.
3. A plugin implementation of the host interfaces (parameter and state messages between the web view and the C++ side).

Things to keep true so this stays possible: no clocks or timers in `core/`; no Electron or Node APIs outside `src/main`, `src/preload` and `renderer/host`; the project stays plain JSON.

One limit to know now: in most DAWs a plugin cannot open the MIDI interface itself. The DAW routes the plugin's MIDI output to the UM-ONE.
