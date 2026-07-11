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
drop policy if exists "Users insert own profile"  on public.profiles;
create policy "Users read own profile"  on public.profiles
  for select using (auth.uid() = id);
create policy "Users update own profile" on public.profiles
  for update using (auth.uid() = id);
-- Lets the client self-heal a missing profile row (e.g. users created before
-- the signup trigger existed) — the trigger below stays the normal path.
create policy "Users insert own profile" on public.profiles
  for insert with check (auth.uid() = id);

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

-- ── Saved harmonizations (Melody Harmonizer arrangements) ───────────────────
-- Stores the full working state — the user's original melody (grid + bars +
-- anchors), the AI arrangement (columns with added-note flags), and the
-- settings (scale, styles, bpm) — so a harmonization can be reopened in the
-- Harmonizer exactly as it was saved, not just as a flattened tab.
create table if not exists public.saved_harmonizations (
  id          uuid default gen_random_uuid() primary key,
  user_id     uuid references public.profiles(id) on delete cascade not null,
  name        text not null default 'Harmonization',
  scale       text,                          -- e.g. "A minor pentatonic"
  styles      jsonb not null default '[]',   -- HarmonizeStyle[]
  bpm         integer,
  melody      jsonb not null default '{}',   -- { grid, bars } incl. anchors
  result      jsonb not null default '{}',   -- HarmonizeResult (active variation)
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

alter table public.saved_harmonizations enable row level security;
drop policy if exists "Users crud own saved_harmonizations" on public.saved_harmonizations;
create policy "Users crud own saved_harmonizations" on public.saved_harmonizations
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── Saved voicing paths (VOICINGS → Paths) ──────────────────────────────────
-- A chord progression + the specific voicing path the user picked for it,
-- plus the filters that produced it, so it can be reopened as-was.
create table if not exists public.saved_voicings (
  id          uuid default gen_random_uuid() primary key,
  user_id     uuid references public.profiles(id) on delete cascade not null,
  name        text not null default 'Voicing Path',
  chords      jsonb not null default '[]',   -- chord names, string[]
  path        jsonb not null default '{}',   -- { label, description, smoothness, voicings }
  settings    jsonb not null default '{}',   -- { genre, mode, stringGroup }
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

alter table public.saved_voicings enable row level security;
drop policy if exists "Users crud own saved_voicings" on public.saved_voicings;
create policy "Users crud own saved_voicings" on public.saved_voicings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── Saved re-harmonizations (VOICINGS → Reharm) ─────────────────────────────
create table if not exists public.saved_reharms (
  id          uuid default gen_random_uuid() primary key,
  user_id     uuid references public.profiles(id) on delete cascade not null,
  name        text not null default 'Re-Harmonization',
  original    jsonb not null default '[]',   -- original chord names, string[]
  result      jsonb not null default '{}',   -- { chords, analysis, theory }
  genre       text,
  tension     integer,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

alter table public.saved_reharms enable row level security;
drop policy if exists "Users crud own saved_reharms" on public.saved_reharms;
create policy "Users crud own saved_reharms" on public.saved_reharms
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── Keep updated_at fresh on every UPDATE ───────────────────────────────────
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists touch_audio_tabs            on public.audio_tabs;
drop trigger if exists touch_saved_tabs            on public.saved_tabs;
drop trigger if exists touch_saved_progressions    on public.saved_progressions;
drop trigger if exists touch_saved_harmonizations  on public.saved_harmonizations;
drop trigger if exists touch_saved_voicings        on public.saved_voicings;
drop trigger if exists touch_saved_reharms         on public.saved_reharms;
create trigger touch_audio_tabs         before update on public.audio_tabs
  for each row execute procedure public.touch_updated_at();
create trigger touch_saved_tabs         before update on public.saved_tabs
  for each row execute procedure public.touch_updated_at();
create trigger touch_saved_progressions before update on public.saved_progressions
  for each row execute procedure public.touch_updated_at();
create trigger touch_saved_harmonizations before update on public.saved_harmonizations
  for each row execute procedure public.touch_updated_at();
create trigger touch_saved_voicings     before update on public.saved_voicings
  for each row execute procedure public.touch_updated_at();
create trigger touch_saved_reharms      before update on public.saved_reharms
  for each row execute procedure public.touch_updated_at();

-- ── Ear Training (preferences, best streak & weak-spot analytics) ───────────
-- One row per user. `prefs` holds the tool toggles (language, playback mode,
-- direction); `best_streak` is the historical high score; `stats` is a
-- per-interval { correct, wrong } map that powers the smart-practice weighting.
create table if not exists public.ear_training (
  user_id      uuid references public.profiles(id) on delete cascade primary key,
  prefs        jsonb not null default '{}',   -- { lang, playback, direction }
  best_streak  integer not null default 0,
  stats        jsonb not null default '{}',   -- { [intervalId]: { correct, wrong } }
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

alter table public.ear_training enable row level security;
drop policy if exists "Users crud own ear_training" on public.ear_training;
create policy "Users crud own ear_training" on public.ear_training
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop trigger if exists touch_ear_training on public.ear_training;
create trigger touch_ear_training before update on public.ear_training
  for each row execute procedure public.touch_updated_at();

-- ── Indexes for the per-user library queries ────────────────────────────────
create index if not exists idx_audio_tabs_user            on public.audio_tabs(user_id, updated_at desc);
create index if not exists idx_saved_tabs_user            on public.saved_tabs(user_id, updated_at desc);
create index if not exists idx_saved_progressions_user    on public.saved_progressions(user_id, updated_at desc);
create index if not exists idx_saved_harmonizations_user  on public.saved_harmonizations(user_id, updated_at desc);
create index if not exists idx_saved_voicings_user        on public.saved_voicings(user_id, updated_at desc);
create index if not exists idx_saved_reharms_user         on public.saved_reharms(user_id, updated_at desc);

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
