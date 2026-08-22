-- Run this once in the Supabase SQL editor for your project.
-- One table, JSONB columns mirroring the app's PupilData shape
-- (src/persistence.ts) closely so persistence.ts is basically a thin
-- storage adapter rather than needing a separate data model.

create table if not exists public.pupils (
  pupil_id text primary key,
  session_count integer not null default 0,
  last_session_at timestamptz,
  letters jsonb not null default '{}'::jsonb,
  session_log jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

-- Row Level Security. The app has no login (a deliberate design choice -
-- see CLAUDE.md), and reads/writes go straight from the browser using the
-- public anon key, so RLS is what stands in for access control here.
--
-- IMPORTANT TRADE-OFF: the policies below allow ANYONE who has your
-- deployed app's URL to read and write EVERY pupil's data - there is no
-- per-teacher or per-classroom scoping. This is a materially bigger
-- exposure than the previous localStorage version, where each tablet
-- only ever saw its own pupils. It's a reasonable starting point given
-- the data involved is first names + confidence scores (not sensitive
-- PII) and the no-login design was already an accepted trade-off, but if
-- you want real per-teacher isolation later, that needs actual
-- authentication (e.g. Supabase Auth) and policies scoped to auth.uid(),
-- not just RLS with a public anon key.
alter table public.pupils enable row level security;

create policy "anon can read pupils" on public.pupils
  for select
  to anon
  using (true);

create policy "anon can insert pupils" on public.pupils
  for insert
  to anon
  with check (true);

create policy "anon can update pupils" on public.pupils
  for update
  to anon
  using (true)
  with check (true);
