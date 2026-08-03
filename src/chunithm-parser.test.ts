// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import musicListFixture from './fixtures/chunithm/music-list.html?raw'
import ratingFixture from './fixtures/chunithm/rating.html?raw'
import {
  parseMusicList,
  parsePlayerRating,
  parseRatingPage,
} from '../public/chunithm-parser.js'

const documentFrom = (html: string) => new DOMParser().parseFromString(html, 'text/html')

describe('CHUNITHM-NET HTML parser', () => {
  it('reports detected blocks separately from valid scores', () => {
    const result = parseMusicList(documentFrom(musicListFixture), 'MASTER')

    expect(result.blockCount).toBe(2)
    expect(result.scores).toEqual([expect.objectContaining({
      id: 'music-101::MASTER',
      title: 'Fixture Song',
      difficulty: 'MASTER',
      level: '14+',
      score: 1_009_321,
      rank: 'SSS+',
      clear: 'FULL COMBO',
    })])
  })

  it('parses rating frames and difficulty numbers', () => {
    const result = parseRatingPage(documentFrom(ratingFixture), 'new')

    expect(result.blockCount).toBe(1)
    expect(result.scores[0]).toEqual(expect.objectContaining({
      id: 'music-202::MASTER',
      frame: 'new',
      isNewSong: true,
      clear: 'ALL JUSTICE',
    }))
  })

  it('supports selector and text fallbacks for player rating', () => {
    expect(parsePlayerRating(documentFrom('<div class="player_rating_num">17.42</div>'))).toBe(17.42)
    expect(parsePlayerRating(documentFrom('<body>PLAYER RATING: 16.88</body>'))).toBe(16.88)
    expect(parsePlayerRating(documentFrom('<body>no rating</body>'))).toBeNull()
  })
})
