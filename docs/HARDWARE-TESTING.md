# Hardware testing guide — original Roland R-8

Nothing in this app has been run against a physical R-8 yet. Treat the first connection as a validation step. The app's First connection screen walks through the same steps.

## Wiring

Mac → USB → MIDI interface → **MIDI OUT** (5-pin) → **R-8 MIDI IN**.

Connect the interface's MIDI OUT to the R-8's MIDI IN, not OUT to OUT. There is no cable back from the R-8, so the app cannot read anything from it.

If macOS does not show the interface: Audio MIDI Setup → Window → Show MIDI Studio.

## On the R-8

1. Turn the Channel Message Switch on. Without it the R-8 ignores incoming notes.
2. Leave sync mode on INTERNAL. The app times every note itself; MIDI clock is not needed to play notes.
3. Set the instrument receive channel and the kick's note number to match the Kick lane in the app (Instruments screen), or change the lane to match the R-8.

## First test

1. In the app, open MIDI and choose the interface. The header light should be green.
2. Open Instruments and press the ping button on Kick. One note is sent.
3. If the R-8 played the kick, answer "Yes, it played". The lane is marked "heard on R-8".
4. Repeat for snare and hi-hat, then program a pattern and press Play.

If nothing plays, check in this order: the cable goes OUT → IN; the Channel Message Switch is on; the lane's channel and note match the R-8; the MIDI screen's monitor shows notes leaving the Mac.

## Things to check and write down

| Check | How | Result |
|---|---|---|
| Notes trigger the right instruments | Ping each lane | not yet tested |
| All instruments receive on one channel | Put two lanes on different channels and ping both | not yet tested |
| Velocity is audible across the range | Step velocities 1, 40, 80, 127 on one lane | not yet tested |
| Note Offs do no harm | Listen for cut-off or doubled hits during normal playback | not yet tested |
| Ratchets ×2–×4 at high tempo | 200 bpm, ratchet ×4 on a hi-hat | not yet tested |
| Timing feels tight | Compare against the R-8's own pattern at the same tempo; adjust output offset on the MIDI screen | not yet tested |
| No stuck or stray notes on Stop | Stop mid-pattern repeatedly | not yet tested |
| Unplug and replug the interface | Header light goes amber, then green; playback resumes sending | not yet tested |
| MIDI clock | R-8 sync mode to MIDI, clock switch on, press Play: the R-8's own sequencer should start and follow tempo | not yet tested |
| Song Position Pointer | Not sent by the app | not built |

## What has been verified without hardware

- Unit tests (`npm test`): event generation, micro-timing, ratchets, chance, mute and solo, scheduling without duplicates or gaps, tempo changes during playback, Note On/Off pairing, stop behaviour, clock pulse rate (24 per quarter note), project validation and round-trip, bar edits.
- The UI in a browser: every screen renders and the editing flows work.

What cannot be verified without the R-8: that it plays the notes, how it responds to velocity, whether it needs anything beyond the Channel Message Switch, and clock sync.
