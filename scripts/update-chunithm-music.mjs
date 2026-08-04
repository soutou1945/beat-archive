import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const token = process.env.CHUNIREC_ACCESS_TOKEN?.trim()
if (!token) {
  console.error('CHUNIREC_ACCESS_TOKEN を環境変数へ設定してください。')
  process.exit(1)
}

const endpoint = new URL('https://api.chunirec.net/2.0/music/showall.json')
endpoint.searchParams.set('region', 'jp2')
endpoint.searchParams.set('token', token)

const response = await fetch(endpoint, {
  headers: { Accept: 'application/json' },
  redirect: 'error',
})

if (!response.ok) {
  console.error(`chunirec APIの取得に失敗しました（HTTP ${response.status}）。既存ファイルは変更しません。`)
  process.exit(1)
}

const payload = await response.json()
if (!Array.isArray(payload) || payload.length === 0) {
  console.error('chunirec APIの応答が空または不正です。既存ファイルは変更しません。')
  process.exit(1)
}

const difficultyMap = {
  BAS: 'BASIC',
  ADV: 'ADVANCED',
  EXP: 'EXPERT',
  MAS: 'MASTER',
  ULT: 'ULTIMA',
}

const levelLabel = (value) => {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return String(value ?? '').trim()
  if (Number.isInteger(numeric)) return String(numeric)
  if (numeric * 2 === Math.trunc(numeric * 2) && numeric % 1 === 0.5) {
    return `${Math.floor(numeric)}+`
  }
  return String(numeric)
}

const charts = []
for (const music of payload) {
  if (!music || typeof music !== 'object' || !music.meta || !music.data) continue
  const musicId = String(music.meta.id ?? '').trim()
  const title = String(music.meta.title ?? '').trim()
  if (!musicId || !title) continue

  for (const [apiDifficulty, difficulty] of Object.entries(difficultyMap)) {
    const chart = music.data[apiDifficulty]
    if (!chart || typeof chart !== 'object') continue
    const level = levelLabel(chart.level)
    if (!level) continue
    const constant = chart.is_const_unknown === true ? null : Number(chart.const)
    const maxCombo = Number(chart.maxcombo)
    charts.push({
      musicId,
      title,
      difficulty,
      level,
      constant: Number.isFinite(constant) ? constant : null,
      maxCombo: Number.isFinite(maxCombo) ? maxCombo : null,
    })
  }
}

if (charts.length < 100) {
  console.error(`生成対象が${charts.length}譜面しかありません。異常応答の可能性があるため更新を中止します。`)
  process.exit(1)
}

charts.sort((a, b) => {
  const titleCompare = a.title.localeCompare(b.title, 'ja')
  return titleCompare !== 0 ? titleCompare : a.difficulty.localeCompare(b.difficulty)
})

const updatedAt = new Date().toISOString()
const output = `// このファイルは scripts/update-chunithm-music.mjs により生成されました。\n\nexport interface ChunithmMusicChartMaster {\n  musicId: string\n  title: string\n  difficulty: 'BASIC' | 'ADVANCED' | 'EXPERT' | 'MASTER' | 'ULTIMA'\n  level: string\n  constant: number | null\n  maxCombo: number | null\n}\n\nexport const CHUNITHM_MUSIC_MASTER_UPDATED_AT = ${JSON.stringify(updatedAt)}\nexport const CHUNITHM_MUSIC_MASTER: ChunithmMusicChartMaster[] = ${JSON.stringify(charts, null, 2)}\n`

const outputPath = resolve('src/generated/chunithmMusic.ts')
await writeFile(outputPath, output, 'utf8')
console.log(`${charts.length}譜面の楽曲マスターを更新しました: ${outputPath}`)
console.log('APIへのアクセスはこの1回のみです。差分を確認してからコミットしてください。')
