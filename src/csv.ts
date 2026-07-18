import type { Game, IidxScore, SdvxScore, Snapshot } from './types'
import { calculateChartVf } from './vf'

type Row = Record<string, string>

export function parseCsv(text: string): Row[] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  const source = text.replace(/^\uFEFF/, '')

  for (let i = 0; i < source.length; i += 1) {
    const char = source[i]
    if (quoted) {
      if (char === '"' && source[i + 1] === '"') {
        cell += '"'
        i += 1
      } else if (char === '"') {
        quoted = false
      } else {
        cell += char
      }
    } else if (char === '"') {
      quoted = true
    } else if (char === ',') {
      row.push(cell)
      cell = ''
    } else if (char === '\n') {
      row.push(cell.replace(/\r$/, ''))
      if (row.some((value) => value !== '')) rows.push(row)
      row = []
      cell = ''
    } else {
      cell += char
    }
  }
  row.push(cell.replace(/\r$/, ''))
  if (row.some((value) => value !== '')) rows.push(row)

  const headers = rows.shift()
  if (!headers) return []
  return rows.map((values) =>
    Object.fromEntries(headers.map((header, index) => [header.trim(), values[index]?.trim() ?? ''])),
  )
}

export function detectGame(rows: Row[]): Exclude<Game, 'chunithm'> {
  const first = rows[0]
  if (!first) throw new Error('CSVにデータ行がありません。')
  if ('楽曲名' in first && 'ハイスコア' in first) return 'sdvx'
  if ('タイトル' in first && 'ANOTHER スコア' in first) return 'iidx'
  throw new Error('SDVX / IIDXの公式CSVとして認識できませんでした。')
}

const number = (value: string) => {
  const parsed = Number(value.replaceAll(',', ''))
  return Number.isFinite(parsed) ? parsed : 0
}

const nullableNumber = (value: string) => {
  if (!value || value === '---') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function parseSdvx(rows: Row[]): SdvxScore[] {
  return rows.map((row) => {
    const title = row['楽曲名']
    const difficulty = row['難易度']
    const level = number(row['楽曲レベル'])
    const clear = row['クリアランク']
    const grade = row['スコアグレード']
    const score = number(row['ハイスコア'])
    return {
      id: `${title}::${difficulty}`,
      title,
      difficulty,
      level,
      clear,
      grade,
      score,
      exScore: number(row['EXスコア']),
      playCount: number(row['プレー回数']),
      clearCount: number(row['クリア回数']),
      ultimateChain: number(row['ULTIMATE CHAIN']),
      perfect: number(row['PERFECT']),
      vf: calculateChartVf(level, score, grade, clear),
    }
  })
}

export function parseIidx(rows: Row[]): IidxScore[] {
  const scores: IidxScore[] = []
  for (const row of rows) {
    for (const difficulty of ['ANOTHER', 'LEGGENDARIA'] as const) {
      const level = number(row[`${difficulty} 難易度`])
      if (level <= 0) continue
      const pGreat = number(row[`${difficulty} PGreat`])
      const great = number(row[`${difficulty} Great`])
      scores.push({
        id: `${row['タイトル']}::${difficulty}`,
        version: row['バージョン'],
        title: row['タイトル'],
        genre: row['ジャンル'],
        artist: row['アーティスト'],
        difficulty,
        level,
        clear: row[`${difficulty} クリアタイプ`],
        djLevel: row[`${difficulty} DJ LEVEL`],
        score: number(row[`${difficulty} スコア`]),
        exScore: pGreat * 2 + great,
        missCount: nullableNumber(row[`${difficulty} ミスカウント`]),
        playCount: number(row['プレー回数']),
        lastPlayedAt: row['最終プレー日時'],
      })
    }
  }
  return scores
}

export function makeSnapshot(text: string, fileName: string, importedAt: string): Snapshot {
  const rows = parseCsv(text)
  const game = detectGame(rows)
  const scores = game === 'sdvx' ? parseSdvx(rows) : parseIidx(rows)
  if (!scores.length) throw new Error('取り込める譜面データがありませんでした。')
  return {
    id: crypto.randomUUID(),
    game,
    importedAt,
    fileName,
    scores,
  }
}
