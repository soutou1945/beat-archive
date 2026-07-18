import type { SdvxScore } from './types'
import { calculateChartVf } from './vf'

export interface SdvxRecommendation {
  score: SdvxScore
  targetScore: number
  projectedGrade: string
  projectedVf: number
  chartVfGain: number
  totalVfGain: number
  recentScoreGain: number
  reason: string
}

const gradeForScore = (score: number) => {
  if (score >= 9_900_000) return 'S'
  if (score >= 9_800_000) return 'AAA+'
  if (score >= 9_700_000) return 'AAA'
  if (score >= 9_500_000) return 'AA+'
  if (score >= 9_300_000) return 'AA'
  if (score >= 9_000_000) return 'A+'
  if (score >= 8_700_000) return 'A'
  if (score >= 8_000_000) return 'B'
  if (score >= 7_000_000) return 'C'
  return 'D'
}

const nextTargetScore = (score: number) =>
  Math.min(10_000_000, Math.ceil((score + 1) / 100_000) * 100_000)

export function recommendSdvx(
  currentScores: SdvxScore[],
  previousScores: SdvxScore[] = [],
  limit = 5,
): SdvxRecommendation[] {
  const bestValues = currentScores
    .map((score) => score.vf)
    .sort((a, b) => b - a)
    .slice(0, 50)
  const best50Cutoff = bestValues.length >= 50 ? bestValues[bestValues.length - 1] : 0
  const previousById = new Map(previousScores.map((score) => [score.id, score]))

  return currentScores
    .filter((score) => score.score > 0 && score.score < 10_000_000 && score.level > 0)
    .map((score) => {
      const targetScore = nextTargetScore(score.score)
      const projectedGrade = gradeForScore(targetScore)
      const projectedVf = calculateChartVf(
        score.level,
        targetScore,
        projectedGrade,
        score.clear,
      )
      const chartVfGain = Math.max(0, projectedVf - score.vf)
      const totalVfGain =
        bestValues.length < 50
          ? chartVfGain
          : score.vf >= best50Cutoff
            ? chartVfGain
            : Math.max(0, projectedVf - best50Cutoff)
      const recentScoreGain = Math.max(0, score.score - (previousById.get(score.id)?.score ?? score.score))
      const reachesNextGrade = projectedGrade !== score.grade

      let reason = `あと${Math.ceil((targetScore - score.score) / 1000)}千点で${(
        targetScore / 1_000_000
      ).toFixed(1)}M`
      if (reachesNextGrade) reason += `・${projectedGrade}圏`
      if (recentScoreGain > 0) reason += `・前回から+${Math.floor(recentScoreGain / 1000)}千点`
      if (score.clear === 'PLAYED') reason += '・クリア更新余地あり'

      return {
        score,
        targetScore,
        projectedGrade,
        projectedVf,
        chartVfGain,
        totalVfGain,
        recentScoreGain,
        reason,
      }
    })
    .sort((a, b) => {
      const rank = (item: SdvxRecommendation) =>
        item.totalVfGain * 10_000 +
        item.chartVfGain * 1_000 +
        Math.min(item.recentScoreGain / 10_000, 20) +
        (item.projectedGrade !== item.score.grade ? 6 : 0) +
        item.score.level / 100
      return rank(b) - rank(a)
    })
    .slice(0, limit)
}
