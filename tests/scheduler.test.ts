import { describe, expect, it } from 'vitest'
import { Scheduler, msPerStep } from '../src/engine/scheduler'
import type { EngineState } from '../src/engine/scheduler'
import { currentPattern } from '../src/core/project'
import { hit, projectWith } from './helpers'

function rig(p = projectWith({ 0: 'x...x...x...x...' }), extra: Partial<EngineState> = {}) {
  let now = 1000
  const sent: { bytes: number[]; at: number }[] = []
  const settings = { lookaheadMs: 100, offsetMs: 0, clock: false, ...extra }
  const sch = new Scheduler({
    now: () => now,
    send: (bytes, at) => sent.push({ bytes, at }),
    state: () => ({ lanes: p.lanes, pattern: currentPattern(p), tempo: p.tempo, ...settings }),
    seed: () => 1
  })
  const advance = (ms: number, tickEvery = 25) => {
    for (let t = 0; t < ms; t += tickEvery) { now += tickEvery; sch.tick() }
  }
  const ons = () => sent.filter((m) => (m.bytes[0] & 0xf0) === 0x90)
  const offs = () => sent.filter((m) => (m.bytes[0] & 0xf0) === 0x80)
  return { sch, sent, advance, ons, offs, settings, p, time: () => now, jump: (ms: number) => { now += ms } }
}

describe('Scheduler', () => {
  it('sends each note once, on the grid, however often it ticks', () => {
    const r = rig()
    r.sch.start()
    r.advance(4000, 7)
    const times = r.ons().map((m) => m.at)
    const step = msPerStep(120)
    const expected = Array.from({ length: times.length }, (_, i) => 1020 + i * 4 * step)
    times.forEach((t, i) => expect(t).toBeCloseTo(expected[i], 6))
    expect(times.length).toBeGreaterThanOrEqual(8)
    expect(new Set(times.map((t) => t.toFixed(3))).size).toBe(times.length)
  })

  it('timestamps notes ahead of time rather than sending late', () => {
    const r = rig()
    r.sch.start()
    r.advance(1000)
    for (const m of r.ons()) expect(m.at).toBeGreaterThanOrEqual(1020)
    // A late tick (UI stall) must not drop or bunch notes.
    r.jump(90)
    r.sch.tick()
    r.advance(1000)
    const gaps = r.ons().map((m, i, a) => (i ? m.at - a[i - 1].at : 500))
    gaps.forEach((g) => expect(g).toBeCloseTo(500, 6))
  })

  it('pairs every Note On with a Note Off shortly after', () => {
    const p = projectWith({ 0: 'x...x...', 1: '....x...' })
    hit(p, 1, 0, 4).ratchet = 4
    const r = rig(p)
    r.sch.start()
    r.advance(2000)
    r.sch.stop()
    expect(r.offs().length).toBeGreaterThanOrEqual(r.ons().length)
    for (const on of r.ons()) {
      const off = r.offs().find((o) => o.bytes[1] === on.bytes[1] && o.at > on.at && o.at <= on.at + 30)
      expect(off).toBeDefined()
    }
  })

  it('releases anything still pending when stopped, and then goes quiet', () => {
    const r = rig()
    r.sch.start()
    r.advance(25)
    const before = r.sent.length
    r.sch.stop()
    const after = r.sent.slice(before)
    expect(after.length).toBeGreaterThan(0)
    expect(after.every((m) => (m.bytes[0] & 0xf0) === 0x80 && m.at === r.time())).toBe(true)
    const n = r.sent.length
    r.advance(1000)
    expect(r.sent.length).toBe(n)
    expect(r.sch.position()).toBe(-1)
  })

  it('changes tempo during playback without repeating or skipping a note', () => {
    const r = rig()
    r.sch.start()
    r.advance(1000)
    r.p.tempo = 60
    r.advance(4000)
    const times = r.ons().map((m) => m.at)
    const gaps = times.slice(1).map((t, i) => t - times[i])
    expect(gaps[0]).toBeCloseTo(500, 6)
    expect(gaps[gaps.length - 1]).toBeCloseTo(1000, 6)
    gaps.forEach((g) => { expect(g).toBeGreaterThan(499); expect(g).toBeLessThan(1001) })
  })

  it('restarts from the top', () => {
    const r = rig(projectWith({ 0: 'x...............' }))
    r.sch.start()
    r.advance(700)
    r.sch.start()
    r.advance(200)
    expect(r.ons().length).toBe(2)
    expect(r.ons()[1].at).toBeCloseTo(r.time() - 200 + 20, 6)
  })

  it('applies the output offset to every message', () => {
    const r = rig(undefined, { offsetMs: 12 })
    r.sch.start()
    r.advance(600)
    expect(r.ons()[0].at).toBeCloseTo(1032, 6)
    expect(r.ons()[1].at).toBeCloseTo(1532, 6)
  })

  it('sends Start, 24 clock pulses per quarter note, then Stop', () => {
    const r = rig(projectWith({}), { clock: true })
    r.sch.start()
    expect(r.sent[0].bytes).toEqual([0xfa])
    r.advance(2000)
    const pulses = r.sent.filter((m) => m.bytes[0] === 0xf8)
    const gap = 500 / 24
    pulses.slice(1).forEach((m, i) => expect(m.at - pulses[i].at).toBeCloseTo(gap, 6))
    expect(pulses[0].at).toBeCloseTo(1020, 6)
    const within = pulses.filter((m) => m.at < 1020 + 2000 - 1e-6).length
    expect(within).toBe(96)
    r.sch.stop()
    expect(r.sent[r.sent.length - 1].bytes).toEqual([0xfc])
  })

  it('sends no clock messages when clock is off', () => {
    const r = rig()
    r.sch.start()
    r.advance(1000)
    r.sch.stop()
    expect(r.sent.some((m) => m.bytes[0] >= 0xf8)).toBe(false)
  })

  it('reports position in steps', () => {
    const r = rig()
    expect(r.sch.position()).toBe(-1)
    r.sch.start()
    r.advance(500); r.jump(20)
    expect(r.sch.position()).toBeCloseTo(4, 6)
  })
})
