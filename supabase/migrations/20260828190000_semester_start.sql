-- ============================================================
--  When the semester started
--
--  Attendance looks back a week so a student who forgets to mark for a few
--  days can catch up. At the start of term that same lookback reaches into the
--  holidays and asks "were you in Operating Systems last Thursday?" about a day
--  with no classes on it — and any answer pollutes the count that decides
--  whether they sit their exams.
--
--  So attendance needs to know where term begins. Nothing before it is asked
--  about, and nothing before it is counted.
-- ============================================================

create table if not exists public.semester (
  user_id    uuid primary key references auth.users on delete cascade,
  starts_on  date not null,
  -- Free text: "Fall 2026", "6th semester" — whatever the student calls it.
  -- Only ever shown back to them, never parsed.
  label      text,
  updated_at timestamptz not null default now()
);

alter table public.semester enable row level security;

create policy "read own semester"   on public.semester for select using (auth.uid() = user_id);
create policy "insert own semester" on public.semester for insert with check (auth.uid() = user_id);
create policy "update own semester" on public.semester for update using (auth.uid() = user_id);
create policy "delete own semester" on public.semester for delete using (auth.uid() = user_id);
