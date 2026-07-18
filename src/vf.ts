const GRADE_FACTOR: Record<string, number> = {
  S: 1.05,
  'AAA+': 1.02,
  AAA: 1,
  'AA+': 0.97,
  AA: 0.94,
  'A+': 0.91,
  A: 0.88,
  B: 0.85,
  C: 0.82,
  D: 0.8,
}

const CLEAR_FACTOR: Record<string, number> = {
  PERFECT: 1.1,
  'ULTIMATE CHAIN': 1.06,
  'MAXXIVE COMPLETE': 1.04,
  'EXCESSIVE COMPLETE': 1.02,
  COMPLETE: 1,
  PLAYED: 0.5,
}

export function calculateChartVf(level: number, score: number, grade: string, clear: string) {
  const raw =
    level *
    (score / 10_000_000) *
    (GRADE_FACTOR[grade] ?? 0.8) *
    (CLEAR_FACTOR[clear] ?? 0.5) *
    20
  return Math.floor(raw) / 1000
}

export function calculateTotalVf(values: number[]) {
  return values
    .slice()
    .sort((a, b) => b - a)
    .slice(0, 50)
    .reduce((sum, value) => sum + value, 0)
}
