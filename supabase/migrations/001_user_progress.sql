-- Migration: 001_user_progress
-- Creates the user_progress table with RLS.
-- Apply manually in the Supabase dashboard SQL editor.

create table user_progress (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users not null unique,
  data       jsonb not null default '{}',
  updated_at timestamptz default now()
);

alter table user_progress enable row level security;

create policy "own rows only"
  on user_progress for all
  using (auth.uid() = user_id);

-- Auto-update updated_at on upsert
create or replace function update_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_updated_at
  before update on user_progress
  for each row execute procedure update_updated_at();
