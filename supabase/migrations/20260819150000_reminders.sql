-- ============================================================
--  Reminders
--
--  Delivery is Web Push: free, no third-party service, and it
--  reaches a phone's lock screen. A browser gives us a unique
--  endpoint per device, which is what we store here.
-- ============================================================

create table public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;

create policy "push read own"   on public.push_subscriptions for select using (auth.uid() = user_id);
create policy "push insert own" on public.push_subscriptions for insert with check (auth.uid() = user_id);
create policy "push delete own" on public.push_subscriptions for delete using (auth.uid() = user_id);

create index push_subscriptions_user_idx on public.push_subscriptions (user_id);


-- How far ahead each student wants to be warned. One row per student.
create table public.reminder_prefs (
  user_id              uuid primary key references auth.users (id) on delete cascade,
  class_minutes_before integer not null default 30,
  deadline_hours_ahead integer[] not null default '{24,2}',
  enabled              boolean not null default true,
  updated_at           timestamptz not null default now()
);

alter table public.reminder_prefs enable row level security;

create policy "prefs read own"   on public.reminder_prefs for select using (auth.uid() = user_id);
create policy "prefs write own"  on public.reminder_prefs for insert with check (auth.uid() = user_id);
create policy "prefs update own" on public.reminder_prefs for update using (auth.uid() = user_id);


-- One row per notification actually sent.
--
-- The unique constraint is the whole point: the reminder job runs every few
-- minutes, and without it a student would be pinged about the same quiz on
-- every single run.
create table public.notifications_sent (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  kind       text not null,             -- 'class' | 'deadline'
  ref_id     text not null,             -- deadline id, or class id + date
  window_key text not null,             -- which lead time this was, e.g. '24h'
  sent_at    timestamptz not null default now(),
  unique (user_id, kind, ref_id, window_key)
);

alter table public.notifications_sent enable row level security;

create policy "sent read own" on public.notifications_sent for select using (auth.uid() = user_id);

create index notifications_sent_user_idx on public.notifications_sent (user_id, sent_at desc);
