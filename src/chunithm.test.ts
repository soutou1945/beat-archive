import { describe, expect, it } from 'vitest'
import {
  aggregateChunithmRanks,
  parseChunithmExport,
  rankForChunithmScore,
  recommendChunithm,
} from './chunithm'
import type { ChunithmScore } from './types'

const score = (overrides: Partial<ChunithmScore> = {}): ChunithmScore => ({
  id: 'song::MASTER',
  title: 'Song',
  difficulty: 'MASTER',
  level: '14+',
  score: 1_006_000,
  rank: 'SS+',
  clear: 'CLEAR',
  isNewSong: false,
  frame: 'best',
  ...overrides,
})

describe('CHUNITHM import', () => {
  it('parses and normalizes an exporter file', () => {
    const result = parseChunithmExport(
      JSON.stringify({
        schema: 'beat-archive.chunithm.v1',
        scores: [{ title: 'Song', difficulty: 'master', level: '14+', score: 1_007_600 }],
      }),
    )
    expect(result[0]).toMatchObject({ difficulty: 'MASTER', rank: 'SSS', frame: null })
  })

  it('rejects unrelated JSON', () => {
    expect(() => parseChunithmExport('{}')).toThrow('BEAT ARCHIVE用')
  })
})

describe('CHUNITHM analysis', () => {
  it('uses score thresholds for rank aggregation', () => {
    expect(rankForChunithmScore(1_009_000)).toBe('SSS+')
    const result = aggregateChunithmRanks([score()])
    expect(result['14+'].MASTER['SS+']).toBe(1)
  })

  it('separates best and new recommendations', () => {
    const current = [
      score(),
      score({ id: 'new::MASTER', title: 'New', frame: 'new', isNewSong: true, score: 1_007_400 }),
    ]
    expect(recommendChunithm(current, [], 'best')).toHaveLength(1)
    expect(recommendChunithm(current, [], 'new')[0].score.title).toBe('New')
  })
})
