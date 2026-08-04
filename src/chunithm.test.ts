import { describe, expect, it, vi } from 'vitest'

vi.mock('./generated/chunithmMusic', () => ({
  CHUNITHM_MUSIC_MASTER_UPDATED_AT: '2026-08-04T00:00:00.000Z',
  CHUNITHM_MUSIC_MASTER: [
    {
      musicId: 'music-1',
      title: 'Song',
      difficulty: 'MASTER',
      level: '14+',
      constant: 14.8,
      maxCombo: 1234,
    },
    {
      musicId: 'music-2',
      title: 'New',
      difficulty: 'MASTER',
      level: '14+',
      constant: 14.7,
      maxCombo: 1200,
    },
  ],
}))

import {
  aggregateChunithmRanks,
  makeChunithmSnapshot,
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
  it('楽曲マスターからレベルと譜面情報を補完する', () => {
    const result = parseChunithmExport(
      JSON.stringify({
        schema: 'beat-archive.chunithm.v1',
        scores: [{ title: 'Song', difficulty: 'master', score: 1_007_600 }],
      }),
    )
    expect(result[0]).toMatchObject({
      difficulty: 'MASTER',
      level: '14+',
      rank: 'SSS',
      frame: null,
      musicId: 'music-1',
      constant: 14.8,
      maxCombo: 1234,
    })
  })

  it('表記の正規化後に楽曲マスターと照合する', () => {
    const result = parseChunithmExport(
      JSON.stringify({
        schema: 'beat-archive.chunithm.v1',
        scores: [{ title: 'Ｓｏｎｇ', difficulty: 'master', score: 1_000_000 }],
      }),
    )
    expect(result[0].musicId).toBe('music-1')
  })

  it('楽曲マスターにない譜面は登録を止める', () => {
    expect(() => parseChunithmExport(JSON.stringify({
      schema: 'beat-archive.chunithm.v1',
      scores: [{ title: 'Unknown', difficulty: 'master', score: 1_000_000 }],
    }))).toThrow('楽曲マスターと一致しない')
  })

  it('rejects unrelated JSON', () => {
    expect(() => parseChunithmExport('{}')).toThrow('BEAT ARCHIVE用')
  })

  it('stores the player rating in the snapshot', () => {
    const snapshot = makeChunithmSnapshot(JSON.stringify({
      schema: 'beat-archive.chunithm.v1',
      playerRating: 12.25,
      scores: [{ title: 'Song', difficulty: 'master', score: 1_007_600 }],
    }), 'chunithm.json')
    expect(snapshot.playerRating).toBe(12.25)
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
