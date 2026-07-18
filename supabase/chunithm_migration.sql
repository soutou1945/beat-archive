-- Run this once in Supabase SQL Editor for an existing BEAT ARCHIVE database.
alter table public.score_snapshots
  drop constraint if exists score_snapshots_game_check;

alter table public.score_snapshots
  add constraint score_snapshots_game_check
  check (game in ('sdvx', 'iidx', 'chunithm'));
