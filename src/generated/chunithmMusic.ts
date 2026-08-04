// このファイルは `pnpm update:chunithm-music` で生成します。
// 初期状態では空のため、CHUNITHM取込時に未一致の警告が表示されます。

export interface ChunithmMusicChartMaster {
  musicId: string
  title: string
  difficulty: 'BASIC' | 'ADVANCED' | 'EXPERT' | 'MASTER' | 'ULTIMA'
  level: string
  constant: number | null
  maxCombo: number | null
}

export const CHUNITHM_MUSIC_MASTER_UPDATED_AT = ''
export const CHUNITHM_MUSIC_MASTER: ChunithmMusicChartMaster[] = []
