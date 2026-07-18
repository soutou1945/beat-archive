export type Game = 'sdvx' | 'iidx' | 'chunithm'

export interface SdvxScore {
  id: string
  title: string
  difficulty: string
  level: number
  clear: string
  grade: string
  score: number
  exScore: number
  playCount: number
  clearCount: number
  ultimateChain: number
  perfect: number
  vf: number
}

export interface IidxScore {
  id: string
  version: string
  title: string
  genre: string
  artist: string
  difficulty: 'ANOTHER' | 'LEGGENDARIA'
  level: number
  clear: string
  djLevel: string
  score: number
  exScore: number
  missCount: number | null
  playCount: number
  lastPlayedAt: string
}

export type ChunithmDifficulty = 'BASIC' | 'ADVANCED' | 'EXPERT' | 'MASTER' | 'ULTIMA'
export type ChunithmFrame = 'best' | 'new' | null

export interface ChunithmScore {
  id: string
  title: string
  difficulty: ChunithmDifficulty
  level: string
  score: number
  rank: string
  clear: string
  isNewSong: boolean
  frame: ChunithmFrame
}

export interface Snapshot {
  id: string
  game: Game
  importedAt: string
  fileName: string
  scores: SdvxScore[] | IidxScore[] | ChunithmScore[]
  playerRating?: number
}

export interface PersistedState {
  snapshots: Snapshot[]
}
