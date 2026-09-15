-- ============================================================
--  Done
--
--  A submitted assignment stayed on the dashboard until its due date passed,
--  and kept sending reminders for work that was already handed in. Slate
--  knows better: Moodle's Timeline block drops an assignment the moment it is
--  submitted and a quiz once it is attempted. The extension already talks to
--  that API, so it can ask which events are still "actionable" and Recall can
--  mark the rest done.
--
--  Nothing is deleted. Wrongly marking something done means a lost reminder,
--  which is the one failure this app must not have — so a done task moves to
--  a list the student can see and undo from, and the source is recorded so a
--  wrong guess from Slate is distinguishable from a student's own tap.
-- ============================================================

alter table public.deadlines
  add column if not exists done_at     timestamptz,
  add column if not exists done_source text check (done_source in ('manual', 'slate'));

create index if not exists deadlines_open_idx
  on public.deadlines (user_id, due_at) where done_at is null;


-- ---- A student marks their own ----
create or replace function public.set_deadline_done(p_deadline_id uuid, p_done boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  update deadlines
     set done_at     = case when p_done then now() else null end,
         done_source = case when p_done then 'manual' else null end
   where id = p_deadline_id
     and user_id = v_user;

  return found;
end;
$$;

grant execute on function public.set_deadline_done(uuid, boolean) to authenticated;


-- ---- Slate says what is still open ----
--
-- Takes the ids of events Moodle still considers actionable. Any assignment
-- or quiz NOT in that list, due in the future, is done. Two safeguards:
--
--   An empty list is refused outright. "Slate returned nothing" is far more
--   likely to be a failed call than a student with no work, and acting on it
--   would mark everything done at once.
--
--   A student's own "done" is never touched, and their own "undone" is
--   respected: only rows Slate marked (or that are unmarked) are changed.
--   If Slate's list later includes an event Recall had marked done from
--   Slate — the assignment was reopened — it comes back.
create or replace function public.sync_deadline_status(
  p_token_hash    text,
  p_actionable    bigint[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user   uuid;
  v_done   integer := 0;
  v_undone integer := 0;
begin
  select user_id into v_user
    from sync_devices
   where token_hash = p_token_hash;

  if v_user is null then
    raise exception 'unknown device' using errcode = '28000';
  end if;

  if p_actionable is null or array_length(p_actionable, 1) is null then
    return jsonb_build_object('done', 0, 'undone', 0, 'skipped', 'empty list');
  end if;

  -- The .ics UID is "<eventid>@host", so the numeric prefix is Moodle's event
  -- id — the same id the action-events API returns.
  with numbered as (
    select id, kind, due_at, done_at, done_source,
           nullif(split_part(uid, '@', 1), '')::bigint as event_id
      from deadlines
     where user_id = v_user
       and uid ~ '^[0-9]+@'
  ),
  marked as (
    update deadlines d
       set done_at = now(), done_source = 'slate'
      from numbered n
     where d.id = n.id
       and n.done_at is null
       and n.kind in ('assignment', 'quiz')
       and n.due_at > now()
       and not (n.event_id = any(p_actionable))
    returning d.id
  )
  select count(*) into v_done from marked;

  -- Reopened on Slate: an event Recall had marked done from Slate is back in
  -- the actionable list. A student's own done stays done.
  with numbered as (
    select id, done_source,
           nullif(split_part(uid, '@', 1), '')::bigint as event_id
      from deadlines
     where user_id = v_user
       and uid ~ '^[0-9]+@'
  ),
  reopened as (
    update deadlines d
       set done_at = null, done_source = null
      from numbered n
     where d.id = n.id
       and n.done_source = 'slate'
       and n.event_id = any(p_actionable)
    returning d.id
  )
  select count(*) into v_undone from reopened;

  return jsonb_build_object('done', v_done, 'undone', v_undone);
end;
$$;

grant execute on function public.sync_deadline_status(text, bigint[]) to anon, authenticated;


-- ---- Reminders skip finished work ----
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
            and d.done_at is null
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
             and d.done_at is null
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
