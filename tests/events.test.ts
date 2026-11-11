import { describe, expect, it } from 'vitest'
import { chanceRoll, collectEvents, isSilent } from '../src/core/events'
import { currentPattern } from '../src/core/project'
import { hit, projectWith } from './helpers'

const run = (p: ReturnType<typeof projectWith>, from: number, to: number, seed = 1) =>
  collectEvents(p.lanes, currentPattern(p), from, to, seed)

describe('collectEvents', () => {
  it('returns the hits in range with lane note, channel and velocity', () => {
    const p = projectWith({ 0: 'x...x...x...x...' })
    hit(p, 0, 0, 4).velocity = 60
    const ev = run(p, 0, 16)
    expect(ev.map((e) => e.at)).toEqual([0, 4, 8, 12])
    expect(ev[0]).toMatchObject({ channel: 10, note: 36, velocity: 110, bar: 0, step: 0 })
    expect(ev[1].velocity).toBe(60)
  })

  it('loops the pattern and walks through bars', () => {
    const p = projectWith({ 0: 'x...............' + '....x...........' }, 2)
    const ev = run(p, 0, 64)
    expect(ev.map((e) => e.at)).toEqual([0, 20, 32, 52])
    expect(ev.map((e) => e.bar)).toEqual([0, 1, 0, 1])
  })

  it('splits any range without duplicates or gaps', () => {
    const p = projectWith({ 0: 'x.x.x.x.x.x.x.x.', 1: '....x..x....x..x', 2: 'xxxxxxxxxxxxxxxx' })
    hit(p, 1, 0, 7).micro = 8
    hit(p, 1, 0, 15).micro = -50
    hit(p, 2, 0, 3).ratchet = 3
    hit(p, 0, 0, 0).micro = -30
    const whole = run(p, 0, 48)
    const cuts = [0, 0.37, 1.5, 1.50001, 7.08, 15.5, 16, 21.3333, 33.9, 48]
    const pieces = cuts.slice(1).flatMap((to, i) => run(p, cuts[i], to))
    const key = (e: { at: number; laneId: string }) => `${e.laneId}@${e.at.toFixed(6)}`
    expect(pieces.map(key).sort()).toEqual(whole.map(key).sort())
  })

  it('shifts a hit by micro, as a percentage of a step', () => {
    const p = projectWith({ 0: '....x...........' })
    hit(p, 0, 0, 4).micro = 25
    expect(run(p, 0, 16)[0].at).toBeCloseTo(4.25)
    hit(p, 0, 0, 4).micro = -50
    expect(run(p, 0, 16)[0].at).toBeCloseTo(3.5)
  })

  it('plays an early first step at the end of the previous pass, and at 0 on the first', () => {
    const p = projectWith({ 0: 'x...............' })
    hit(p, 0, 0, 0).micro = -40
    expect(run(p, 0, 32).map((e) => e.at)).toEqual([0, 15.6, 31.6])
  })

  it('sends n evenly spaced notes for a ratchet', () => {
    const p = projectWith({ 0: '....x...........' })
    hit(p, 0, 0, 4).ratchet = 4
    const ev = run(p, 0, 16)
    expect(ev.map((e) => e.at)).toEqual([4, 4.25, 4.5, 4.75])
    expect(ev.every((e) => e.ratchet === 4)).toBe(true)
  })

  it('leaves out muted, switched-off and un-soloed lanes', () => {
    const p = projectWith({ 0: 'x...', 1: 'x...', 2: 'x...' })
    p.lanes[0].mute = true
    expect(run(p, 0, 16).map((e) => e.note)).toEqual([38, 42])
    p.lanes[1].enabled = false
    expect(run(p, 0, 16).map((e) => e.note)).toEqual([42])
    p.lanes[0].mute = false
    p.lanes[0].solo = true
    expect(run(p, 0, 16).map((e) => e.note)).toEqual([36])
    expect(isSilent(p.lanes[2], p.lanes)).toBe(true)
  })

  it('applies chance the same way every time for a given seed', () => {
    const p = projectWith({ 0: 'xxxxxxxxxxxxxxxx' })
    for (let s = 0; s < 16; s++) hit(p, 0, 0, s).chance = 50
    const a = run(p, 0, 1600, 7)
    expect(run(p, 0, 1600, 7)).toEqual(a)
    expect(a.length).toBeGreaterThan(650)
    expect(a.length).toBeLessThan(950)
    expect(run(p, 0, 1600, 8)).not.toEqual(a)
    for (let s = 0; s < 16; s++) hit(p, 0, 0, s).chance = 0
    expect(run(p, 0, 160)).toEqual([])
  })

  it('keeps chance rolls inside 0–100', () => {
    for (let i = 0; i < 500; i++) {
      const r = chanceRoll(i * 31, i, i % 8)
      expect(r).toBeGreaterThanOrEqual(0)
      expect(r).toBeLessThan(100)
    }
  })
})
