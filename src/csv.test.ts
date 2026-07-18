import { describe, expect, it } from 'vitest'
import { detectGame, parseCsv, parseIidx, parseSdvx } from './csv'
import { calculateChartVf, calculateTotalVf } from './vf'

describe('official CSV parser', () => {
  it('parses quoted cells and detects SDVX', () => {
    const rows = parseCsv(
      '楽曲名,難易度,楽曲レベル,クリアランク,スコアグレード,ハイスコア,EXスコア,プレー回数,クリア回数,ULTIMATE CHAIN,PERFECT\n"Song, One",MAXIMUM,18.3,MAXXIVE COMPLETE,S,9923042,5000,3,2,0,0',
    )
    expect(detectGame(rows)).toBe('sdvx')
    const score = parseSdvx(rows)[0]
    expect(score.title).toBe('Song, One')
    expect(score.vf).toBe(0.396)
  })

  it('keeps only ANOTHER and LEGGENDARIA and computes EX score', () => {
    const header = [
      'バージョン','タイトル','ジャンル','アーティスト','プレー回数',
      'ANOTHER 難易度','ANOTHER スコア','ANOTHER PGreat','ANOTHER Great','ANOTHER ミスカウント','ANOTHER クリアタイプ','ANOTHER DJ LEVEL',
      'LEGGENDARIA 難易度','LEGGENDARIA スコア','LEGGENDARIA PGreat','LEGGENDARIA Great','LEGGENDARIA ミスカウント','LEGGENDARIA クリアタイプ','LEGGENDARIA DJ LEVEL','最終プレー日時',
    ].join(',')
    const row = '30,Test,TECHNO,Artist,5,12,2000,800,300,12,HARD CLEAR,AA,0,0,0,0,---,NO PLAY,---,2026-01-01 10:00'
    const parsed = parseCsv(`${header}\n${row}`)
    expect(detectGame(parsed)).toBe('iidx')
    const scores = parseIidx(parsed)
    expect(scores).toHaveLength(1)
    expect(scores[0].difficulty).toBe('ANOTHER')
    expect(scores[0].exScore).toBe(1900)
    expect(scores[0].missCount).toBe(12)
  })
})

describe('VOLFORCE', () => {
  it('uses the Nabla clear factors and floors each chart to three decimals', () => {
    expect(calculateChartVf(18.3, 9_923_042, 'S', 'EXCESSIVE COMPLETE')).toBe(0.388)
    expect(calculateChartVf(18.3, 9_923_042, 'S', 'ULTIMATE CHAIN')).toBe(0.404)
  })

  it('sums only best 50 chart values', () => {
    expect(calculateTotalVf(Array.from({ length: 60 }, (_, index) => index / 1000))).toBeCloseTo(1.725)
  })
})
