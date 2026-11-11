// Project validation for load and import. On failure it says what is wrong
// and returns nothing, so a bad file can never replace the open project.

import { FORMAT_VERSION, MAX_BARS, STEPS_PER_BAR } from './types'
import type { Project } from './types'
import { TEMPO_MAX, TEMPO_MIN, normaliseSteps } from './project'

export type ValidationResult = { ok: true; project: Project } | { ok: false; error: string }

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isInt = (v: unknown, min: number, max: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max
const isNum = (v: unknown, min: number, max: number): v is number => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max

class Invalid extends Error {}
const fail = (msg: string): never => { throw new Invalid(msg) }

function checkHit(h: unknown, where: string): void {
  if (h === null) return
  if (!isObj(h)) return fail(`${where} is not a hit`)
  if (!isInt(h.velocity, 1, 127)) fail(`${where}: velocity must be 1–127`)
  if (!isInt(h.micro, -50, 50)) fail(`${where}: micro must be −50…50`)
  if (!isInt(h.chance, 0, 100)) fail(`${where}: chance must be 0–100`)
  if (!isInt(h.ratchet, 1, 4)) fail(`${where}: ratchet must be 1–4`)
  const s = h.stored
  if (!isObj(s)) return fail(`${where}: stored values are missing`)
  for (const k of ['pitch', 'decay', 'nuance', 'pan']) if (!isInt(s[k], -50, 50)) fail(`${where}: ${k} must be −50…50`)
}

export function parseProject(text: string): ValidationResult {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return { ok: false, error: 'The file is not valid JSON.' }
  }
  return validateProject(data)
}

export function validateProject(data: unknown): ValidationResult {
  try {
    if (!isObj(data)) return fail('The file does not contain a project.')
    if (typeof data.formatVersion !== 'number') fail('The file has no format version, so it is not an R-8 Studio project.')
    if (data.formatVersion !== FORMAT_VERSION) fail(`This project uses format version ${data.formatVersion}; this app reads version ${FORMAT_VERSION}.`)
    if (typeof data.name !== 'string' || !data.name.trim()) fail('The project has no name.')
    if (!isNum(data.tempo, TEMPO_MIN, TEMPO_MAX)) fail(`Tempo must be ${TEMPO_MIN}–${TEMPO_MAX} bpm.`)
    if (data.timeSignature !== '4/4') fail('Only 4/4 projects are supported.')
    if (!Array.isArray(data.lanes) || data.lanes.length === 0) fail('The project has no lanes.')
    const ids = new Set<string>()
    for (const [i, l] of (data.lanes as unknown[]).entries()) {
      const where = `Lane ${i + 1}`
      if (!isObj(l)) return fail(`${where} is not a lane.`)
      if (typeof l.id !== 'string' || !l.id) fail(`${where} has no id.`)
      if (ids.has(l.id as string)) fail(`${where} repeats another lane's id.`)
      ids.add(l.id as string)
      if (typeof l.name !== 'string') fail(`${where} has no name.`)
      if (!isInt(l.channel, 1, 16)) fail(`${where}: channel must be 1–16.`)
      if (!isInt(l.note, 0, 127)) fail(`${where}: note must be 0–127.`)
      if (!isInt(l.defaultVelocity, 1, 127)) fail(`${where}: default velocity must be 1–127.`)
      for (const k of ['enabled', 'mute', 'solo']) if (typeof l[k] !== 'boolean') fail(`${where}: ${k} must be true or false.`)
      if (l.heard !== 'heard' && l.heard !== 'not-tested') fail(`${where}: unknown status.`)
    }
    if (!Array.isArray(data.patterns) || data.patterns.length === 0) fail('The project has no patterns.')
    const patIds = new Set<string>()
    for (const [i, p] of (data.patterns as unknown[]).entries()) {
      const where = `Pattern ${i + 1}`
      if (!isObj(p)) return fail(`${where} is not a pattern.`)
      if (typeof p.id !== 'string' || !/^[A-D](0[1-9]|1[0-6])$/.test(p.id)) fail(`${where} has a bad id.`)
      if (patIds.has(p.id as string)) fail(`${where} repeats another pattern's id.`)
      patIds.add(p.id as string)
      if (typeof p.name !== 'string') fail(`${where} has no name.`)
      if (!isInt(p.bars, 1, MAX_BARS)) fail(`${where}: bars must be 1–${MAX_BARS}.`)
      if (!isObj(p.steps)) return fail(`${where} has no steps.`)
      for (const [laneId, rows] of Object.entries(p.steps)) {
        if (!Array.isArray(rows)) return fail(`${where}: steps for a lane are not a list.`)
        for (const [b, bar] of rows.entries()) {
          if (!Array.isArray(bar) || bar.length !== STEPS_PER_BAR) return fail(`${where}, bar ${b + 1}: expected ${STEPS_PER_BAR} steps.`)
          bar.forEach((h, s) => checkHit(h, `${where}, ${laneId}, step ${b + 1}.${s + 1}`))
        }
      }
    }
    if (typeof data.currentPatternId !== 'string' || !patIds.has(data.currentPatternId)) fail('The open pattern is missing from the project.')
    const project = structuredClone(data) as unknown as Project
    if (!Array.isArray(project.copies)) project.copies = []
    for (const lane of project.lanes) if (lane.kit === undefined) lane.kit = null
    normaliseSteps(project)
    return { ok: true, project }
  } catch (e) {
    if (e instanceof Invalid) return { ok: false, error: e.message }
    throw e
  }
}

export const serialiseProject = (p: Project): string => JSON.stringify(p, null, 2)
