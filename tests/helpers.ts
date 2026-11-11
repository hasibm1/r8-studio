import { blankHit, currentPattern, newProject } from '../src/core/project'
import type { Hit, Project } from '../src/core/types'

/** A project with hits written as strings, one per lane index: 'x...x...' */
export function projectWith(rows: Record<number, string>, bars = 1): Project {
  const p = newProject('Test')
  const pat = currentPattern(p)
  pat.bars = bars
  for (const lane of p.lanes) pat.steps[lane.id] = Array.from({ length: bars }, () => Array.from({ length: 16 }, () => null))
  for (const [li, row] of Object.entries(rows)) {
    const lane = p.lanes[Number(li)]
    row.split('').forEach((ch, i) => {
      if (ch !== '.') pat.steps[lane.id][Math.floor(i / 16)][i % 16] = blankHit(lane)
    })
  }
  return p
}

export function hit(p: Project, lane: number, bar: number, step: number): Hit {
  return currentPattern(p).steps[p.lanes[lane].id][bar][step]!
}
