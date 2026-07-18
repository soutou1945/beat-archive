import type {
  ChunithmDifficulty,
  ChunithmFrame,
  ChunithmScore,
  Snapshot,
} from './types'

export const CHUNITHM_SCHEMA = 'beat-archive.chunithm.v1'

const DIFFICULTIES = new Set<ChunithmDifficulty>([
  'BASIC',
  'ADVANCED',
  'EXPERT',
  'MASTER',
  'ULTIMA',
])

const SCORE_TARGETS = [
  { score: 975_000, rank: 'S' },
  { score: 990_000, rank: 'S+' },
  { score: 1_000_000, rank: 'SS' },
  { score: 1_005_000, rank: 'SS+' },
  { score: 1_007_500, rank: 'SSS' },
  { score: 1_009_000, rank: 'SSS+' },
  { score: 1_010_000, rank: 'MAX' },
]

export const rankForChunithmScore = (score: number) => {
  if (score >= 1_009_000) return 'SSS+'
  if (score >= 1_007_500) return 'SSS'
  if (score >= 1_005_000) return 'SS+'
  if (score >= 1_000_000) return 'SS'
  if (score >= 990_000) return 'S+'
  if (score >= 975_000) return 'S'
  return 'AAA以下'
}

const asString = (value: unknown) => (typeof value === 'string' ? value.trim() : '')
const asBoolean = (value: unknown) => value === true

const normalizeDifficulty = (value: unknown): ChunithmDifficulty => {
  const difficulty = asString(value).toUpperCase() as ChunithmDifficulty
  if (!DIFFICULTIES.has(difficulty)) throw new Error(`未対応の難易度です: ${String(value)}`)
  return difficulty
}

const normalizeFrame = (value: unknown, isNewSong: boolean): ChunithmFrame => {
  if (value === 'best' || value === 'new') return value
  return isNewSong ? 'new' : null
}

export function parseChunithmExport(text: string): ChunithmScore[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('JSONファイルを読み取れませんでした。')
  }

  if (!parsed || typeof parsed !== 'object') throw new Error('CHUNITHMデータの形式が不正です。')
  const source = parsed as { schema?: unknown; scores?: unknown }
  if (source.schema !== CHUNITHM_SCHEMA) {
    throw new Error('BEAT ARCHIVE用のCHUNITHM JSONではありません。')
  }
  if (!Array.isArray(source.scores)) throw new Error('楽曲データが見つかりません。')

  const scores = source.scores.map((raw, index): ChunithmScore => {
    if (!raw || typeof raw !== 'object') throw new Error(`${index + 1}件目のデータが不正です。`)
    const item = raw as Record<string, unknown>
    const title = asString(item.title)
    const difficulty = normalizeDifficulty(item.difficulty)
    const score = Number(item.score)
    const level = asString(item.level)
    const isNewSong = asBoolean(item.isNewSong)
    if (!title || !level || !Number.isFinite(score) || score < 0 || score > 1_010_000) {
      throw new Error(`${index + 1}件目の曲名・レベル・スコアが不正です。`)
    }
    const suppliedId = asString(item.id)
    return {
      id: suppliedId || `${title}::${difficulty}`,
      title,
      difficulty,
      level,
      score: Math.trunc(score),
      rank: asString(item.rank) || rankForChunithmScore(score),
      clear: asString(item.clear) || 'NO DATA',
      isNewSong,
      frame: normalizeFrame(item.frame, isNewSong),
    }
  })

  const unique = new Map(scores.map((score) => [score.id, score]))
  return [...unique.values()]
}

export function makeChunithmSnapshot(text: string, fileName: string, importedAt = new Date()): Snapshot {
  const scores = parseChunithmExport(text)
  return {
    id: crypto.randomUUID(),
    game: 'chunithm',
    importedAt: importedAt.toISOString(),
    fileName,
    scores,
  }
}

export const CHUNITHM_RANKS = ['SSS+', 'SSS', 'SS+', 'SS', 'S+', 'S', 'AAA以下'] as const

export function aggregateChunithmRanks(scores: ChunithmScore[]) {
  const result: Record<string, Record<string, Record<string, number>>> = {}
  for (const score of scores) {
    result[score.level] ??= {}
    result[score.level][score.difficulty] ??= Object.fromEntries(
      CHUNITHM_RANKS.map((rank) => [rank, 0]),
    )
    const bucket = rankForChunithmScore(score.score)
    result[score.level][score.difficulty][bucket] += 1
  }
  return result
}

export interface ChunithmRecommendation {
  score: ChunithmScore
  targetScore: number
  targetRank: string
  recentGain: number
  reason: string
}

export function recommendChunithm(
  currentScores: ChunithmScore[],
  previousScores: ChunithmScore[] = [],
  frame: Exclude<ChunithmFrame, null>,
  limit = 10,
): ChunithmRecommendation[] {
  const previousById = new Map(previousScores.map((score) => [score.id, score]))
  return currentScores
    .filter((score) => {
      if (score.score <= 0 || score.score >= 1_010_000) return false
      return frame === 'new' ? score.frame === 'new' || score.isNewSong : score.frame === 'best'
    })
    .map((score) => {
      const target = SCORE_TARGETS.find((candidate) => candidate.score > score.score) ?? SCORE_TARGETS.at(-1)!
      const recentGain = Math.max(0, score.score - (previousById.get(score.id)?.score ?? score.score))
      const distance = target.score - score.score
      let reason = `あと${distance.toLocaleString('ja-JP')}点で${target.rank}`
      if (recentGain > 0) reason += `・前回から+${recentGain.toLocaleString('ja-JP')}点`
      return {
        score,
        targetScore: target.score,
        targetRank: target.rank,
        recentGain,
        reason,
      }
    })
    .sort((a, b) => {
      const aDistance = a.targetScore - a.score.score
      const bDistance = b.targetScore - b.score.score
      const aPriority = Math.min(a.recentGain, 20_000) * 2 - aDistance + Number.parseFloat(a.score.level) * 100
      const bPriority = Math.min(b.recentGain, 20_000) * 2 - bDistance + Number.parseFloat(b.score.level) * 100
      return bPriority - aPriority
    })
    .slice(0, limit)
}
