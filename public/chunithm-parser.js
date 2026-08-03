export const DIFFICULTIES = ['BASIC', 'ADVANCED', 'EXPERT', 'MASTER', 'ULTIMA']

const DIFFICULTY_BY_NUMBER = DIFFICULTIES

export const normalizeText = (value) => String(value || '').replace(/\s+/g, ' ').trim()

const numberFrom = (value) => Number(String(value || '').replace(/[^\d]/g, '')) || 0

export const rankForChunithmScore = (score) => {
  if (score >= 1009000) return 'SSS+'
  if (score >= 1007500) return 'SSS'
  if (score >= 1005000) return 'SS+'
  if (score >= 1000000) return 'SS'
  if (score >= 990000) return 'S+'
  if (score >= 975000) return 'S'
  return 'AAA以下'
}

const findText = (block, selectors) => {
  for (const selector of selectors) {
    const value = normalizeText(block.querySelector(selector)?.textContent)
    if (value) return value
  }
  return ''
}

const difficultyFromBlock = (block, forcedDifficulty) => {
  if (DIFFICULTIES.includes(forcedDifficulty)) return forcedDifficulty
  const inputDifficulty = Number(block.querySelector('input[name="diff"]')?.value)
  if (Number.isInteger(inputDifficulty) && DIFFICULTY_BY_NUMBER[inputDifficulty]) {
    return DIFFICULTY_BY_NUMBER[inputDifficulty]
  }
  const classText = `${block.className || ''} ${block.parentElement?.className || ''}`
  const fromClass = classText.match(/bg_(basic|advanced|expert|master|ultima)/i)?.[1]
  if (fromClass) return fromClass.toUpperCase()
  const text = normalizeText(block.textContent)
  return DIFFICULTIES.find((value) => new RegExp(`\\b${value}\\b`, 'i').test(text)) || ''
}

export const parseScoreBlock = (block, { difficulty: forcedDifficulty = '', frame = null } = {}) => {
  const text = normalizeText(block.textContent)
  const difficulty = difficultyFromBlock(block, forcedDifficulty)
  if (!DIFFICULTIES.includes(difficulty)) return null

  let title = findText(block, [
    '.music_title',
    '.music_title_block',
    '.music_name',
    '.musiclist_title',
    '.musiclist_box_title',
    '[class*="music"][class*="title"]',
  ])
  if (!title) {
    title = text
      .split(/SCORE|HIGH SCORE|LEVEL|Lv\.?|BASIC|ADVANCED|EXPERT|MASTER|ULTIMA/i)[0]
      .replace(/NEW!/gi, '')
      .trim()
  }

  const scoreText = findText(block, [
    '.play_musicdata_highscore span',
    '.play_musicdata_highscore',
    'span.text_b',
    '[class*="highscore"]',
  ])
  const scoreMatch = `${scoreText} ${text}`.match(/(?:HIGH\s*)?SCORE\s*[：:]?\s*([\d,]{6,9})|([\d,]{6,9})/)
  const score = numberFrom(scoreMatch?.[1] || scoreMatch?.[2])

  const levelText = findText(block, [
    '.music_lv',
    '.music_level',
    '.play_musicdata_lv',
    '[class*="music"][class*="level"]',
    '[class*="music"][class*="_lv"]',
  ])
  const levelMatch = levelText.match(/(\d{1,2}(?:\.\d+)?\+?)/)
    || text.match(/(?:LEVEL|Lv\.?)\s*[：:]?\s*(\d{1,2}(?:\.\d+)?\+?)/i)
  const level = normalizeText(levelMatch?.[1]) || '?'
  if (!title || score <= 0 || score > 1010000) return null

  const iconSources = [...block.querySelectorAll('.play_musicdata_icon img, img')]
    .map((image) => String(image.getAttribute('src') || '').toLowerCase())
    .join(' ')
  let clear = 'CLEAR'
  if (/alljustice|all_justice/.test(iconSources) || /ALL\s*JUSTICE/i.test(text)) clear = 'ALL JUSTICE'
  else if (/fullcombo|full_combo/.test(iconSources) || /FULL\s*COMBO/i.test(text)) clear = 'FULL COMBO'
  else if (/failed|未クリア/i.test(text)) clear = 'FAILED'

  const isNewSong = frame === 'new' || /\bNEW!?\b|新曲/i.test(text)
  const sourceId = normalizeText(block.querySelector('input[name="idx"]')?.value)
  return {
    id: sourceId ? `${sourceId}::${difficulty}` : `${title}::${difficulty}`,
    title,
    difficulty,
    level,
    score,
    rank: rankForChunithmScore(score),
    clear,
    isNewSong,
    frame: frame || (isNewSong ? 'new' : null),
  }
}

const parseBlocks = (blocks, options) => ({
  blockCount: blocks.length,
  scores: blocks.map((block) => parseScoreBlock(block, options)).filter(Boolean),
})

export const parseMusicList = (doc, difficulty = '', frame = null) => {
  const blocks = [...doc.querySelectorAll('.musiclist_box, [class*="musiclist_box"]')]
  return parseBlocks(blocks, { difficulty, frame })
}

export const parseRatingPage = (doc, frame) => {
  const blocks = [...doc.querySelectorAll('.w420 > .box05 > form, .box05 form')]
  return parseBlocks(blocks, { frame })
}

export const parsePlayerRating = (doc) => {
  const selectors = [
    '.player_data_rating',
    '.player_rating',
    '.player_rating_num',
    '[class*="player"][class*="rating"]',
  ]
  for (const selector of selectors) {
    for (const element of doc.querySelectorAll(selector)) {
      const match = normalizeText(element.textContent).match(/(\d{1,2}(?:\.\d{1,2})?)/)
      const rating = Number(match?.[1])
      if (Number.isFinite(rating) && rating >= 0 && rating <= 100) return rating
    }
  }
  const labelMatch = normalizeText(doc.body?.textContent)
    .match(/\bRATING\s*[：:]?\s*(\d{1,2}(?:\.\d{1,2})?)/i)
  const rating = Number(labelMatch?.[1])
  return Number.isFinite(rating) && rating >= 0 && rating <= 100 ? rating : null
}
