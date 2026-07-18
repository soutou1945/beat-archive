export type Game = 'sdvx' | 'iidx'

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

export interface Snapshot {
  id: string
  game: Game
  importedAt: string
  fileName: string
  scores: SdvxScore[] | IidxScore[]
}

export interface PersistedState {
  snapshots: Snapshot[]
}
