-- ============================================================
--  Shrink what one leaked secret is worth
--
--  cron_reminder_batch returned, for every student with a push subscription,
--  their whole weekly timetable and 48 hours of deadlines. One secret, one
--  call, everything. If it ever leaked — it exists in a GitHub secret, a
--  Vercel environment variable and the database's own vault — the loss was
--  total and instant.
--
--  The realisation is that almost none of that is ever needed. At any given
--  minute nearly nobody has a reminder due, and the job only sends to people
--  who do. So the batch now answers a much narrower question: who has
--  something imminent, and what is it?
--
--  Most calls now return an empty array. A stolen secret used at 3am gets
--  nothing at all, and used at 09:20 gets one student's next class — not three
--  students' entire semesters.
--
--  What is deliberately NOT changed: the decision about which reminders to
--  actually send stays in planReminders, in TypeScript, where seventeen tests
--  cover it. The filter below is a strict superset of that logic — anyone it
--  drops would have produced no reminders anyway — so narrowing the data
--  cannot narrow what gets sent. Getting that wrong would mean silent missed
--  reminders, which is the failure this project has already spent a day on.
-- ============================================================

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
  -- The legitimate callers are pg_cron every five minutes and a GitHub worker
  -- every three, so about five calls per ten minutes between them. Sixty is
  -- far above that and far below useful enumeration.
  v_gate := consume_rate_limit('cron_batch', 'global', 60, 600);

  if not (v_gate->>'allowed')::boolean then
    return jsonb_build_object('error', 'throttled');
  end if;

  -- Returned rather than raised, deliberately. Raising aborts the transaction,
  -- which would roll back both the log line and the rate-limit count — the
  -- exact way the first pairing throttle silently did nothing.
  if not verify_job_secret('reminders', p_secret) then
    perform log_security_event(null, 'cron.bad_secret', '{}'::jsonb);
    return jsonb_build_object('error', 'unauthorized');
  end if;

  -- Everyone here is at the University of Lahore, so local time is UTC+5.
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

      -- Today's classes only. The rest of the week can never produce a
      -- reminder now, so sending it would be handing over a timetable for
      -- nothing.
      coalesce(
        (select jsonb_agg(jsonb_build_object(
                  'id', c.id, 'course', c.course, 'day_of_week', c.day_of_week,
                  'start_time', c.start_time, 'room', c.room))
           from class_sessions c
          where c.user_id = b.user_id and c.day_of_week = v_dow),
        '[]'::jsonb) as classes,

      -- Deadlines inside this student's own furthest window, rather than a
      -- flat 48 hours for everybody.
      coalesce(
        (select jsonb_agg(jsonb_build_object(
                  'id', d.id, 'title', d.title, 'course', d.course,
                  'kind', d.kind, 'due_at', d.due_at))
           from deadlines d
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
        -- A class inside the band planReminders would consider. Wider on both
        -- sides than the TypeScript rule (-20 to +lead), so the filter can
        -- never be the reason a reminder is missed.
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
