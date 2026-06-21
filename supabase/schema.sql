-- ════════════════════════════════════════════════════════════════════════════
--  ScaleUp — User Portal schema
--  Run this in the Supabase SQL editor (Database → SQL Editor → New query).
--  Safe to re-run: every object uses "if not exists" / "or replace" / drop-guards.
-- ════════════════════════════════════════════════════════════════════════════

-- ── Profiles (extends auth.users) ───────────────────────────────────────────
create table if not exists public.profiles (
  id            uuid references auth.users(id) on delete cascade primary key,
  email         text,
  display_name  text,
  avatar_url    text,
  created_at    timestamptz default now(),
  last_seen_at  timestamptz default now()
);

alter table public.profiles enable row level security;

drop policy if exists "Users read own profile"   on public.profiles;
drop policy if exists "Users update own profile"  on public.profiles;
create policy "Users read own profile"  on public.profiles
  for select using (auth.uid() = id);
create policy "Users update own profile" on public.profiles
  for update using (auth.uid() = id);

-- Auto-create a profile row whenever a new auth user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ── Audio-to-Tab archive ────────────────────────────────────────────────────
create table if not exists public.audio_tabs (
  id                 uuid default gen_random_uuid() primary key,
  user_id            uuid references public.profiles(id) on delete cascade not null,
  name               text not null default 'Untitled',
  original_audio_url text,            -- public URL of the uploaded source clip
  tab_content        text,            -- generated tab (plain text / ASCII)
  duration_seconds   numeric,
  created_at         timestamptz default now(),
  updated_at         timestamptz default now()
);

alter table public.audio_tabs enable row level security;
drop policy if exists "Users crud own audio_tabs" on public.audio_tabs;
create policy "Users crud own audio_tabs" on public.audio_tabs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── My Tabs (Tab Builder songs) ─────────────────────────────────────────────
create table if not exists public.saved_tabs (
  id          uuid default gen_random_uuid() primary key,
  user_id     uuid references public.profiles(id) on delete cascade not null,
  name        text not null default 'Untitled Tab',
  content     jsonb not null default '{}',   -- { title, subtitle, grid, bars }
  tempo       integer,
  music_key   text,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

alter table public.saved_tabs enable row level security;
drop policy if exists "Users crud own saved_tabs" on public.saved_tabs;
create policy "Users crud own saved_tabs" on public.saved_tabs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── Saved progressions (Chord Builder) ──────────────────────────────────────
create table if not exists public.saved_progressions (
  id           uuid default gen_random_uuid() primary key,
  user_id      uuid references public.profiles(id) on delete cascade not null,
  name         text not null default 'My Progression',
  chords       jsonb not null default '[]',  -- ChordInProgression[]
  detected_key text,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

alter table public.saved_progressions enable row level security;
drop policy if exists "Users crud own saved_progressions" on public.saved_progressions;
create policy "Users crud own saved_progressions" on public.saved_progressions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── Keep updated_at fresh on every UPDATE ───────────────────────────────────
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists touch_audio_tabs          on public.audio_tabs;
drop trigger if exists touch_saved_tabs          on public.saved_tabs;
drop trigger if exists touch_saved_progressions  on public.saved_progressions;
create trigger touch_audio_tabs         before update on public.audio_tabs
  for each row execute procedure public.touch_updated_at();
create trigger touch_saved_tabs         before update on public.saved_tabs
  for each row execute procedure public.touch_updated_at();
create trigger touch_saved_progressions before update on public.saved_progressions
  for each row execute procedure public.touch_updated_at();

-- ── Indexes for the per-user library queries ────────────────────────────────
create index if not exists idx_audio_tabs_user          on public.audio_tabs(user_id, updated_at desc);
create index if not exists idx_saved_tabs_user          on public.saved_tabs(user_id, updated_at desc);
create index if not exists idx_saved_progressions_user  on public.saved_progressions(user_id, updated_at desc);

-- ── Storage bucket for original audio clips ─────────────────────────────────
-- (Create via dashboard: Storage → New bucket → "audio" → public.
--  Then add these policies so users only touch their own folder.)
insert into storage.buckets (id, name, public)
  values ('audio', 'audio', true)
  on conflict (id) do nothing;

drop policy if exists "Users upload own audio" on storage.objects;
drop policy if exists "Anyone reads audio"     on storage.objects;
drop policy if exists "Users delete own audio" on storage.objects;
create policy "Users upload own audio" on storage.objects
  for insert with check (
    bucket_id = 'audio' and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy "Anyone reads audio" on storage.objects
  for select using (bucket_id = 'audio');
create policy "Users delete own audio" on storage.objects
  for delete using (
    bucket_id = 'audio' and (storage.foldername(name))[1] = auth.uid()::text
  );
