create table if not exists public.score_snapshots (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  game text not null check (game in ('sdvx', 'iidx', 'chunithm')),
  imported_at timestamptz not null,
  file_name text not null,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists score_snapshots_user_imported_idx
  on public.score_snapshots (user_id, imported_at desc);

alter table public.score_snapshots enable row level security;

create policy "Users can read their own score snapshots"
  on public.score_snapshots for select
  using (auth.uid() = user_id);

create policy "Users can create their own score snapshots"
  on public.score_snapshots for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own score snapshots"
  on public.score_snapshots for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own score snapshots"
  on public.score_snapshots for delete
  using (auth.uid() = user_id);
