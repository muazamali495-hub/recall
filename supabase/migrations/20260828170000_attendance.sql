-- ============================================================
--  Attendance
--
--  UOL detains students below 75%, which makes "can I miss the next one?" a
--  question with real consequences and no good answer anywhere. Recall already
--  knows the timetable, so it is the only thing that can ask "were you in
--  Software Engineering just now?" at the moment the answer is still
--  remembered.
--
--  Notably this needs nothing from Slate. Every feature so far depends on the
--  extension, a laptop and Cloudflare's mood; this one works on a phone with
--  none of them.
-- ============================================================

create table if not exists public.attendance (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users on delete cascade,
  class_id   uuid not null references public.class_sessions on delete cascade,
  on_date    date not null,
  status     text not null check (status in ('present', 'absent', 'cancelled')),
  created_at timestamptz not null default now(),

  -- One answer per class per day. Changing your mind updates the row rather
  -- than adding a second, contradictory one.
  unique (user_id, class_id, on_date)
);

create index if not exists attendance_user_date_idx on public.attendance (user_id, on_date desc);

alter table public.attendance enable row level security;

create policy "read own attendance"   on public.attendance for select using (auth.uid() = user_id);
create policy "insert own attendance" on public.attendance for insert with check (auth.uid() = user_id);
create policy "update own attendance" on public.attendance for update using (auth.uid() = user_id);
create policy "delete own attendance" on public.attendance for delete using (auth.uid() = user_id);


-- The record from before Recall existed.
--
-- Nobody installs a tracker in week one. A student joining in week ten has a
-- history this app never saw, and starting them at 0/0 would cheerfully report
-- "you're fine" to someone one absence from detention — the exact failure the
-- feature exists to prevent. So they can state where they already stand.
create table if not exists public.attendance_baseline (
  user_id          uuid not null references auth.users on delete cascade,
  course           text not null,
  attended         integer not null default 0 check (attended >= 0),
  held             integer not null default 0 check (held >= attended),
  -- Most courses are 75%, some are 80%. Per course, because it varies by
  -- course and a single global setting would quietly be wrong for one of them.
  required_percent integer not null default 75 check (required_percent between 1 and 99),
  updated_at       timestamptz not null default now(),

  primary key (user_id, course)
);

alter table public.attendance_baseline enable row level security;

create policy "read own baseline"   on public.attendance_baseline for select using (auth.uid() = user_id);
create policy "insert own baseline" on public.attendance_baseline for insert with check (auth.uid() = user_id);
create policy "update own baseline" on public.attendance_baseline for update using (auth.uid() = user_id);
create policy "delete own baseline" on public.attendance_baseline for delete using (auth.uid() = user_id);
