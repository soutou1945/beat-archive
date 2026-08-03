import type { ChunithmDifficulty, ChunithmFrame, ChunithmScore } from '../src/types'

export const DIFFICULTIES: ChunithmDifficulty[]
export function normalizeText(value: unknown): string
export function rankForChunithmScore(score: number): string

export interface ChunithmParseResult {
  blockCount: number
  scores: ChunithmScore[]
}

export function parseScoreBlock(
  block: Element,
  options?: { difficulty?: ChunithmDifficulty | ''; frame?: ChunithmFrame },
): ChunithmScore | null
export function parseMusicList(
  doc: Document,
  difficulty?: ChunithmDifficulty | '',
  frame?: ChunithmFrame,
): ChunithmParseResult
export function parseRatingPage(doc: Document, frame: ChunithmFrame): ChunithmParseResult
export function parsePlayerRating(doc: Document): number | null
