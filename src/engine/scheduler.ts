// Look-ahead playback scheduler.
//
// It owns no timer, no clock and no MIDI port: the host calls `tick()` often
// (every ~25 ms), and supplies `now()` and `send()`. Each tick asks the core
// which notes fall between the last scheduled position and the look-ahead
// horizon and hands them to `send` with exact timestamps, so playback does
// not depend on when the UI renders.

import { collectEvents } from '../core/events'
import { CLOCK, START, STOP, noteOff, noteOn } from '../core/midi'
import type { Lane, Pattern } from '../core/types'

export interface EngineState {
  lanes: Lane[]
  pattern: Pattern
  tempo: number
  lookaheadMs: number
  /** Shifts every outgoing message; negative = earlier. */
  offsetMs: number
  /** Send MIDI clock. Read when Play is pressed. */
  clock: boolean
}

export interface SendMeta { bar: number; step: number }

export interface SchedulerDeps {
  now(): number // ms, monotonic
  send(bytes: number[], atMs: number, meta?: SendMeta): void
  state(): EngineState
  /** Drop messages the port has queued but not yet sent, if it can. */
  clear?(): void
  seed?(): number
}

export const PULSES_PER_STEP = 6 // 24 ppqn
const START_DELAY_MS = 20
const MAX_GATE_MS = 30

export const msPerStep = (bpm: number): number => 60000 / bpm / 4

export class Scheduler {
  playing = false
  private anchorMs = 0
  private anchorStep = 0
  private bpm = 120
  private until = 0 // step position scheduled so far
  private nextPulse = 0
  private clockActive = false
  private seed = 0
  private pendingOffs: { atMs: number; bytes: number[] }[] = []

  constructor(private deps: SchedulerDeps) {}

  private timeOf(step: number): number {
    return this.anchorMs + (step - this.anchorStep) * msPerStep(this.bpm)
  }

  private stepAt(ms: number): number {
    return this.anchorStep + (ms - this.anchorMs) / msPerStep(this.bpm)
  }

  /** Fractional step position since Play, or −1 when stopped or not yet started. */
  position(nowMs = this.deps.now()): number {
    if (!this.playing) return -1
    const p = this.stepAt(nowMs)
    return p < 0 ? -1 : p
  }

  get sendingClock(): boolean {
    return this.playing && this.clockActive
  }

  start(): void {
    if (this.playing) this.stop()
    const s = this.deps.state()
    this.bpm = s.tempo
    this.anchorMs = this.deps.now() + START_DELAY_MS
    this.anchorStep = 0
    this.until = 0
    this.nextPulse = 0
    this.pendingOffs = []
    this.seed = this.deps.seed ? this.deps.seed() : (Math.random() * 0xffffffff) >>> 0
    this.clockActive = s.clock
    this.playing = true
    if (this.clockActive) this.deps.send(START, this.anchorMs + s.offsetMs)
    this.tick()
  }

  stop(): void {
    if (!this.playing) return
    this.playing = false
    const now = this.deps.now()
    this.deps.clear?.()
    // Anything that might still be sounding gets its Note Off now.
    for (const off of this.pendingOffs) if (off.atMs > now) this.deps.send(off.bytes, now)
    this.pendingOffs = []
    if (this.clockActive) this.deps.send(STOP, now)
    this.clockActive = false
  }

  tick(): void {
    if (!this.playing) return
    const s = this.deps.state()
    const now = this.deps.now()
    if (s.tempo !== this.bpm) {
      // Re-anchor at the edge of what is already scheduled, so nothing
      // already sent moves and nothing is sent twice.
      this.anchorMs = this.timeOf(this.until)
      this.anchorStep = this.until
      this.bpm = s.tempo
    }
    const horizon = this.stepAt(now + Math.max(10, s.lookaheadMs))
    if (horizon <= this.until) return
    const stepMs = msPerStep(this.bpm)
    for (const e of collectEvents(s.lanes, s.pattern, this.until, horizon, this.seed)) {
      const at = Math.max(now, this.timeOf(e.at) + s.offsetMs)
      const gate = Math.min(MAX_GATE_MS, stepMs / e.ratchet / 2)
      const off = noteOff(e.channel, e.note)
      this.deps.send(noteOn(e.channel, e.note, e.velocity), at, { bar: e.bar, step: e.step })
      this.deps.send(off, at + gate)
      this.pendingOffs.push({ atMs: at + gate, bytes: off })
    }
    if (this.clockActive) {
      while (this.nextPulse / PULSES_PER_STEP < horizon) {
        this.deps.send(CLOCK, Math.max(now, this.timeOf(this.nextPulse / PULSES_PER_STEP) + s.offsetMs))
        this.nextPulse += 1
      }
    }
    this.pendingOffs = this.pendingOffs.filter((o) => o.atMs > now)
    this.until = horizon
  }
}
