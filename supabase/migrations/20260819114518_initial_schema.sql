-- ============================================================
--  RECALL — v1 schema
--  AI student assistant for University of Lahore
--
--  Four tables, all owner-scoped with Row Level Security:
--    profiles           one row per signed-in student
--    moodle_connections the Slate (Moodle) iCal feed per student
--    deadlines          assignments/quizzes synced from that feed
--    class_sessions     the weekly timetable
-- ============================================================


-- ------------------------------------------------------------
-- 1) PROFILES
-- ------------------------------------------------------------
create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  full_name  text,
  program    text,
  semester   int,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles read own"
  on public.profiles for select
  using (auth.uid() = id);

create policy "profiles insert own"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "profiles update own"
  on public.profiles for update
  using (auth.uid() = id);

-- Create the profile row automatically on first Google sign-in.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name'
    )
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ------------------------------------------------------------
-- 2) MOODLE CONNECTIONS  (the Slate iCal feed — the moat)
--    ical_url is a secret: a per-user, read-only calendar token.
--    Never expose it back to the client; never log it.
-- ------------------------------------------------------------
create table public.moodle_connections (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  ical_url       text not null,
  last_synced_at timestamptz,
  sync_status    text not null default 'pending',
  sync_error     text,
  created_at     timestamptz not null default now(),
  unique (user_id)
);

alter table public.moodle_connections enable row level security;

create policy "moodle read own"
  on public.moodle_connections for select
  using (auth.uid() = user_id);

create policy "moodle insert own"
  on public.moodle_connections for insert
  with check (auth.uid() = user_id);

create policy "moodle update own"
  on public.moodle_connections for update
  using (auth.uid() = user_id);

create policy "moodle delete own"
  on public.moodle_connections for delete
  using (auth.uid() = user_id);


-- ------------------------------------------------------------
-- 3) DEADLINES  (synced from the .ics feed)
--    Written only by the sync worker (service-role key).
--    Students may read their own rows, never write them.
-- ------------------------------------------------------------
create table public.deadlines (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  uid        text not null,                     -- VEVENT UID from the .ics
  title      text not null,
  course     text,
  kind       text not null default 'other',     -- assignment | quiz | other
  due_at     timestamptz,
  source_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, uid)                         -- upsert target: no duplicates
);

alter table public.deadlines enable row level security;

create policy "deadlines read own"
  on public.deadlines for select
  using (auth.uid() = user_id);

-- Fast lookup for "what's coming up for this student".
create index deadlines_user_due_idx
  on public.deadlines (user_id, due_at);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger deadlines_touch_updated_at
  before update on public.deadlines
  for each row execute function public.touch_updated_at();


-- ------------------------------------------------------------
-- 4) CLASS SESSIONS  (weekly timetable, imported once a semester)
-- ------------------------------------------------------------
create table public.class_sessions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  course      text not null,
  day_of_week int  not null check (day_of_week between 0 and 6),  -- 0 = Sunday
  start_time  time not null,
  end_time    time,
  room        text,
  created_at  timestamptz not null default now()
);

alter table public.class_sessions enable row level security;

create policy "classes read own"
  on public.class_sessions for select
  using (auth.uid() = user_id);

create policy "classes insert own"
  on public.class_sessions for insert
  with check (auth.uid() = user_id);

create policy "classes update own"
  on public.class_sessions for update
  using (auth.uid() = user_id);

create policy "classes delete own"
  on public.class_sessions for delete
  using (auth.uid() = user_id);

-- Fast lookup for "what classes do I have today".
create index class_sessions_user_day_idx
  on public.class_sessions (user_id, day_of_week, start_time);
