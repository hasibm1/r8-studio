import { describe, expect, it } from 'vitest'
import { addBar, addLane, addPattern, clearBar, copyBar, duplicateBar, hitAt, addHit, pasteBar, removeLane, resetHit, setLaneField, update } from '../src/core/edits'
import { countHits, currentPattern, newProject, noteClashes } from '../src/core/project'
import { parseProject, serialiseProject, validateProject } from '../src/core/validate'
import { formatMessage, noteOff, noteOn } from '../src/core/midi'
import { formatParam, isEdited } from '../src/core/params'
import { tapTempo } from '../src/core/tempo'
import { hit, projectWith } from './helpers'

describe('edits', () => {
  it('never mutates the project it was given', () => {
    const a = newProject()
    const frozen = JSON.stringify(a)
    const b = update(a, (d) => addHit(d, d.lanes[0].id, 0, 3))
    expect(JSON.stringify(a)).toBe(frozen)
    expect(hitAt(b, b.lanes[0].id, 0, 3)?.velocity).toBe(110)
  })

  it('copies, pastes, duplicates and clears a bar', () => {
    let p = projectWith({ 0: 'x..x', 1: '.x..' })
    hit(p, 0, 0, 3).micro = 9
    const clip = copyBar(p, 0)
    p = update(p, (d) => { expect(duplicateBar(d, 0)).toBe(1) })
    expect(currentPattern(p).bars).toBe(2)
    expect(hitAt(p, p.lanes[0].id, 1, 3)?.micro).toBe(9)
    p = update(p, (d) => clearBar(d, 0))
    expect(countHits(p, p.lanes[0].id)).toBe(2)
    p = update(p, (d) => pasteBar(d, 0, clip))
    expect(countHits(p, p.lanes[0].id)).toBe(4)
    // pasted hits are copies, not shared with the clipboard
    clip[p.lanes[0].id][0]!.velocity = 1
    expect(hitAt(p, p.lanes[0].id, 0, 0)?.velocity).toBe(110)
  })

  it('stops at four bars and wraps duplicate back to bar 1', () => {
    let p = newProject()
    p = update(p, (d) => { addBar(d); addBar(d); addBar(d); expect(addBar(d)).toBe(false) })
    expect(currentPattern(p).bars).toBe(4)
    p = update(p, (d) => { addHit(d, d.lanes[0].id, 3, 0); expect(duplicateBar(d, 3)).toBe(0) })
    expect(hitAt(p, p.lanes[0].id, 0, 0)).not.toBeNull()
  })

  it('reset keeps velocity and clears everything else', () => {
    const p = projectWith({ 0: 'x' })
    Object.assign(hit(p, 0, 0, 0), { velocity: 77, micro: 5, chance: 40, ratchet: 3, stored: { pitch: 1, decay: 2, nuance: 3, pan: 4 } })
    expect(isEdited(hit(p, 0, 0, 0))).toBe(true)
    resetHit(p, p.lanes[0].id, 0, 0)
    expect(hit(p, 0, 0, 0)).toEqual({ velocity: 77, micro: 0, chance: 100, ratchet: 1, stored: { pitch: 0, decay: 0, nuance: 0, pan: 0 } })
  })

  it('marks a lane untested when what it sends changes', () => {
    const p = newProject()
    const id = p.lanes[0].id
    p.lanes[0].heard = 'heard'
    setLaneField(p, id, 'name', 'Bass Drum')
    setLaneField(p, id, 'mute', true)
    expect(p.lanes[0].heard).toBe('heard')
    setLaneField(p, id, 'note', 35)
    expect(p.lanes[0].heard).toBe('not-tested')
  })

  it('adds and removes lanes across every pattern', () => {
    let p = newProject()
    p = update(p, (d) => { addPattern(d, 1) })
    p = update(p, (d) => { addLane(d) })
    const lane = p.lanes[8]
    expect(p.patterns.every((pat) => pat.steps[lane.id].length === pat.bars)).toBe(true)
    expect(noteClashes(p.lanes).size).toBe(0)
    p = update(p, (d) => removeLane(d, lane.id))
    expect(p.patterns.every((pat) => !(lane.id in pat.steps))).toBe(true)
  })

  it('finds lanes that send the same note', () => {
    const p = newProject()
    p.lanes[7].note = p.lanes[3].note
    const clashes = noteClashes(p.lanes)
    expect(clashes.get(p.lanes[7].id)?.name).toBe('Open HH')
    expect(clashes.get(p.lanes[3].id)?.name).toBe('High Tom')
    p.lanes[7].enabled = false
    expect(noteClashes(p.lanes).size).toBe(0)
  })
})

describe('project files', () => {
  it('round-trips through JSON', () => {
    const p = projectWith({ 0: 'x...x...', 2: 'xxxx' }, 2)
    hit(p, 2, 0, 1).chance = 75
    const r = parseProject(serialiseProject(p))
    expect(r.ok && r.project).toEqual(p)
  })

  it('says what is wrong with a bad file and returns no project', () => {
    const bad = (mut: (o: any) => void): string => {
      const o = JSON.parse(serialiseProject(projectWith({ 0: 'x' })))
      mut(o)
      const r = validateProject(o)
      expect(r.ok).toBe(false)
      return r.ok ? '' : r.error
    }
    expect(parseProject('{nope').ok).toBe(false)
    expect(bad((o) => { o.formatVersion = 99 })).toMatch(/version 99/)
    expect(bad((o) => { delete o.formatVersion })).toMatch(/not an R-8 Studio project/)
    expect(bad((o) => { o.tempo = 900 })).toMatch(/Tempo/)
    expect(bad((o) => { o.lanes[2].channel = 17 })).toMatch(/Lane 3: channel/)
    expect(bad((o) => { o.lanes[1].note = -1 })).toMatch(/note/)
    expect(bad((o) => { o.patterns[0].steps[o.lanes[0].id][0][0].velocity = 0 })).toMatch(/velocity/)
    expect(bad((o) => { o.patterns[0].steps[o.lanes[0].id][0].pop() })).toMatch(/16 steps/)
    expect(bad((o) => { o.currentPatternId = 'A09' })).toMatch(/open pattern/)
    expect(validateProject([]).ok).toBe(false)
  })
})

describe('midi and formatting', () => {
  it('builds note messages on the right channel', () => {
    expect(noteOn(10, 38, 110)).toEqual([0x99, 38, 110])
    expect(noteOff(10, 38)).toEqual([0x89, 38, 0])
    expect(noteOn(1, 200, 0)).toEqual([0x90, 127, 1])
  })

  it('formats messages the way the footer shows them', () => {
    expect(formatMessage([0x99, 38, 110])).toBe('NOTE ON · CH10 · 38 · V110')
    expect(formatMessage([0x89, 38, 0])).toBe('NOTE OFF · CH10 · 38')
    expect(formatMessage([0xfa])).toBe('START')
  })

  it('formats step values', () => {
    expect(formatParam('micro', 8)).toBe('+8%')
    expect(formatParam('micro', -3)).toBe('−3%')
    expect(formatParam('pan', -20)).toBe('L20')
    expect(formatParam('pan', 0)).toBe('C')
    expect(formatParam('ratchet', 2)).toBe('×2')
    expect(formatParam('chance', 75)).toBe('75%')
  })

  it('averages taps to 0.1 bpm and forgets old ones', () => {
    let t = tapTempo([], 0)
    expect(t.bpm).toBeNull()
    t = tapTempo(t.taps, 500)
    expect(t.bpm).toBe(120)
    t = tapTempo(t.taps, 1010)
    expect(t.bpm).toBe(118.8)
    t = tapTempo(t.taps, 9000)
    expect(t.bpm).toBeNull()
  })
})
