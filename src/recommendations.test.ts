import { describe, expect, it } from 'vitest'
import type { SdvxScore } from './types'
import { recommendSdvx } from './recommendations'
import { calculateChartVf } from './vf'

const chart = (overrides: Partial<SdvxScore>): SdvxScore => {
  const score = overrides.score ?? 9_750_000
  const level = overrides.level ?? 18
  const grade = overrides.grade ?? 'AAA'
  const clear = overrides.clear ?? 'COMPLETE'
  return {
    id: overrides.id ?? 'song::EXHAUST',
    title: overrides.title ?? 'Song',
    difficulty: overrides.difficulty ?? 'EXHAUST',
    level,
    clear,
    grade,
    score,
    exScore: 0,
    playCount: 1,
    clearCount: 1,
    ultimateChain: 0,
    perfect: 0,
    vf: calculateChartVf(level, score, grade, clear),
  }
}

describe('SDVX recommendations', () => {
  it('suggests the next 100k milestone and recalculates VF', () => {
    const [result] = recommendSdvx([chart({ score: 9_750_000 })])
    expect(result.targetScore).toBe(9_800_000)
    expect(result.projectedGrade).toBe('AAA+')
    expect(result.projectedVf).toBeGreaterThan(result.score.vf)
    expect(result.reason).toContain('AAA+圏')
  })

  it('uses recent score growth as a ranking signal', () => {
    const rising = chart({ id: 'rising', title: 'Rising' })
    const steady = chart({ id: 'steady', title: 'Steady' })
    const previous = [
      chart({ id: 'rising', title: 'Rising', score: rising.score - 80_000 }),
      steady,
    ]
    const results = recommendSdvx([steady, rising], previous)
    expect(results[0].score.id).toBe('rising')
    expect(results[0].recentScoreGain).toBe(80_000)
  })

  it('does not suggest perfect scores or unplayed charts', () => {
    const results = recommendSdvx([
      chart({ id: 'perfect', score: 10_000_000, grade: 'S' }),
      chart({ id: 'unplayed', score: 0, grade: 'D', clear: 'PLAYED' }),
    ])
    expect(results).toHaveLength(0)
  })
})
