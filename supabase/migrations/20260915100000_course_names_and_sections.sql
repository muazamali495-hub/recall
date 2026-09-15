-- ============================================================
--  Course names and sections
--
--  Every deadline showed a bare code: "Quiz 2 - CS13410". Moodle's calendar
--  export carries the course *shortname*, which at UOL is
--  "CS13410|11-BSCS-7A-112001-FALL26", and the full name is simply not in the
--  feed. Recall cannot read what was never sent.
--
--  Two things follow. The section IS in that string and was being thrown away
--  with the rest of the suffix, so it is now kept. The name has to come from
--  the student, once per course — six or so a semester — and is then shown on
--  every deadline, every reminder and in Ask Recall.
-- ============================================================

alter table public.deadlines add column if not exists section text;

create table if not exists public.courses (
  user_id    uuid not null references auth.users on delete cascade,
  -- The code exactly as Slate sends it: "CS13410".
  code       text not null,
  -- What the student calls it: "Intro to Machine Learning".
  name       text not null,
  updated_at timestamptz not null default now(),

  primary key (user_id, code)
);

alter table public.courses enable row level security;

create policy "read own courses"   on public.courses for select using (auth.uid() = user_id);
create policy "insert own courses" on public.courses for insert with check (auth.uid() = user_id);
create policy "update own courses" on public.courses for update using (auth.uid() = user_id);
create policy "delete own courses" on public.courses for delete using (auth.uid() = user_id);


-- ---- Store the section when a calendar syncs ----
create or replace function public.sync_deadlines(
  p_token_hash text,
  p_events     jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user  uuid;
  v_count integer := 0;
  v_size  integer;
begin
  select user_id into v_user
    from sync_devices
   where token_hash = p_token_hash;

  if v_user is null then
    raise exception 'unknown device' using errcode = '28000';
  end if;

  update sync_devices set last_seen_at = now() where token_hash = p_token_hash;

  if p_events is null or jsonb_array_length(p_events) = 0 then
    return 0;
  end if;

  v_size := jsonb_array_length(p_events);

  if v_size > 1000 then
    perform log_security_event(v_user, 'sync.oversized', jsonb_build_object('events', v_size));
    raise exception 'calendar has % events, which is far more than a semester holds', v_size
      using errcode = '54000';
  end if;

  insert into deadlines (user_id, uid, title, course, section, kind, due_at, source_url)
  select v_user,
         e ->> 'uid',
         coalesce(nullif(e ->> 'title', ''), 'Untitled'),
         nullif(e ->> 'course', ''),
         nullif(e ->> 'section', ''),
         coalesce(nullif(e ->> 'kind', ''), 'other'),
         nullif(e ->> 'due_at', '')::timestamptz,
         nullif(e ->> 'source_url', '')
    from jsonb_array_elements(p_events) as e
   where e ->> 'uid' is not null
  on conflict (user_id, uid) do update
     set title      = excluded.title,
         course     = excluded.course,
         section    = excluded.section,
         kind       = excluded.kind,
         due_at     = excluded.due_at,
         source_url = excluded.source_url;

  get diagnostics v_count = row_count;

  delete from deadlines
   where user_id = v_user
     and uid not in (
       select e ->> 'uid'
         from jsonb_array_elements(p_events) as e
        where e ->> 'uid' is not null
     );

  return v_count;
end;
$$;


-- ---- Reminders carry the name, not just the code ----
--
-- The reminder job never reads the courses table itself; it gets what this
-- batch hands it. Joining here means a push notification says "Quiz 2 - Intro
-- to Machine Learning" rather than "Quiz 2 - CS13410", which is the whole
-- point of naming a course.
create or replace function public.cron_reminder_batch(p_secret text, p_limit integer default 500)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_out   jsonb;
  v_gate  jsonb;
  v_local timestamp;
  v_dow   integer;
  v_mins  integer;
begin
  v_gate := consume_rate_limit('cron_batch', 'global', 60, 600);

  if not (v_gate->>'allowed')::boolean then
    return jsonb_build_object('error', 'throttled');
  end if;

  if not verify_job_secret('reminders', p_secret) then
    perform log_security_event(null, 'cron.bad_secret', '{}'::jsonb);
    return jsonb_build_object('error', 'unauthorized');
  end if;

  v_local := (now() at time zone 'UTC') + interval '5 hours';
  v_dow   := extract(dow from v_local);
  v_mins  := extract(hour from v_local) * 60 + extract(minute from v_local);

  select coalesce(jsonb_agg(row_to_json(u)::jsonb), '[]'::jsonb) into v_out
  from (
    select
      b.user_id,
      b.prefs,
      (select jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth))
         from push_subscriptions s where s.user_id = b.user_id) as subscriptions,
      coalesce(
        (select jsonb_agg(jsonb_build_object(
                  'id', c.id, 'course', c.course, 'day_of_week', c.day_of_week,
                  'start_time', c.start_time, 'room', c.room))
           from class_sessions c
          where c.user_id = b.user_id and c.day_of_week = v_dow),
        '[]'::jsonb) as classes,
      coalesce(
        (select jsonb_agg(jsonb_build_object(
                  'id', d.id, 'title', d.title,
                  'course', d.course,
                  'course_name', cn.name,
                  'section', d.section,
                  'kind', d.kind, 'due_at', d.due_at))
           from deadlines d
           left join courses cn on cn.user_id = d.user_id and cn.code = d.course
          where d.user_id = b.user_id
            and d.due_at > now()
            and d.due_at <= now() + make_interval(mins => (b.maxwin * 60)::int + 10)),
        '[]'::jsonb) as deadlines
    from (
      select
        p.user_id,
        coalesce(
          (select to_jsonb(r) from reminder_prefs r where r.user_id = p.user_id),
          jsonb_build_object(
            'class_minutes_before', 15,
            'deadline_hours_ahead', array[24, 2, 0.5]::numeric[],
            'enabled', true
          )
        ) as prefs,
        coalesce((select r.class_minutes_before from reminder_prefs r where r.user_id = p.user_id), 15) as lead,
        coalesce((select max(w) from reminder_prefs r, unnest(r.deadline_hours_ahead) w
                   where r.user_id = p.user_id), 24) as maxwin,
        coalesce((select r.enabled from reminder_prefs r where r.user_id = p.user_id), true) as enabled
      from (select distinct user_id from push_subscriptions) p
    ) b
    where b.enabled
      and (
        exists (
          select 1 from class_sessions c
           where c.user_id = b.user_id
             and c.day_of_week = v_dow
             and (extract(hour from c.start_time) * 60 + extract(minute from c.start_time))
                 between v_mins - 30 and v_mins + b.lead + 5
        )
        or exists (
          select 1 from deadlines d
           where d.user_id = b.user_id
             and d.due_at > now()
             and d.due_at <= now() + make_interval(mins => (b.maxwin * 60)::int + 10)
        )
      )
    limit p_limit
  ) u;

  return v_out;
end;
$$;

grant execute on function public.cron_reminder_batch(text, integer) to anon, authenticated;
