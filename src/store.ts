import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { PersistedState, Snapshot } from './types'

const STORAGE_KEY = 'beat-archive:v1'
const emptyState: PersistedState = { snapshots: [] }

export function loadLocal(): PersistedState {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    return value ? (JSON.parse(value) as PersistedState) : emptyState
  } catch {
    return emptyState
  }
}

export function saveLocal(state: PersistedState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

export const cloudConfigured =
  Boolean(import.meta.env.VITE_SUPABASE_URL) && Boolean(import.meta.env.VITE_SUPABASE_ANON_KEY)

export const supabase: SupabaseClient | null = cloudConfigured
  ? createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY)
  : null

export async function signInWithEmail(email: string) {
  if (!supabase) throw new Error('クラウド同期が設定されていません。')
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.href.split('#')[0] },
  })
  if (error) throw error
}

export async function signOut() {
  if (!supabase) return
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

export async function loadCloud(): Promise<Snapshot[]> {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('score_snapshots')
    .select('id, game, imported_at, file_name, payload')
    .order('imported_at', { ascending: true })
  if (error) throw error
  return (data ?? []).map((row) => ({
    id: row.id,
    game: row.game,
    importedAt: row.imported_at,
    fileName: row.file_name,
    scores: row.payload,
  }))
}

export async function saveCloud(snapshot: Snapshot) {
  if (!supabase) return
  const { error } = await supabase.from('score_snapshots').upsert({
    id: snapshot.id,
    game: snapshot.game,
    imported_at: snapshot.importedAt,
    file_name: snapshot.fileName,
    payload: snapshot.scores,
  })
  if (error) throw error
}
