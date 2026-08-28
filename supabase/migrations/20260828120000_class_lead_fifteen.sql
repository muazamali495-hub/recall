-- Class reminders now arrive 15 minutes before the class, not 30.
--
-- Thirty minutes was a guess. In practice a student is still in the previous
-- lecture, or walking between blocks, and the ping is forgotten by the time it
-- matters. Fifteen minutes is the point where it changes what you do next.
--
-- Existing rows are updated, not just the default: everyone who has ever
-- opened the reminder settings already has a row holding the old 30, so
-- changing only the default would leave every current user on the old timing.
-- Anyone who deliberately chose their own value is left alone.

alter table public.reminder_prefs
  alter column class_minutes_before set default 15;

update public.reminder_prefs
   set class_minutes_before = 15
 where class_minutes_before = 30;


-- The three fallbacks used when a student has no preferences row at all.
-- They are spelled out in each function, so all three have to move together
-- or a user without a row would keep the old lead time.

create or replace function public.cron_reminder_batch(p_secret text, p_limit integer default 500)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_out jsonb;
begin
  if not verify_job_secret('reminders', p_secret) then
    raise exception 'bad job secret' using errcode = '28000';
  end if;

  select coalesce(jsonb_agg(row_to_json(u)::jsonb), '[]'::jsonb) into v_out
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
      (select jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth))
         from push_subscriptions s where s.user_id = p.user_id) as subscriptions,
      coalesce(
        (select jsonb_agg(jsonb_build_object(
                  'id', c.id, 'course', c.course, 'day_of_week', c.day_of_week,
                  'start_time', c.start_time, 'room', c.room))
           from class_sessions c where c.user_id = p.user_id),
        '[]'::jsonb) as classes,
      coalesce(
        (select jsonb_agg(jsonb_build_object(
                  'id', d.id, 'title', d.title, 'course', d.course,
                  'kind', d.kind, 'due_at', d.due_at))
           from deadlines d
          where d.user_id = p.user_id
            and d.due_at between now() and now() + interval '48 hours'),
        '[]'::jsonb) as deadlines
    from (select distinct user_id from push_subscriptions) p
    limit p_limit
  ) u;

  return v_out;
end;
$$;

grant execute on function public.cron_reminder_batch(text, integer) to anon, authenticated;

create or replace function public.reminder_context(p_token_hash text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
  v_out  jsonb;
begin
  select user_id into v_user from sync_devices where token_hash = p_token_hash;
  if v_user is null then
    raise exception 'unknown device' using errcode = '28000';
  end if;

  select jsonb_build_object(
    'user_id', v_user,
    'prefs', coalesce(
      (select to_jsonb(p) from reminder_prefs p where p.user_id = v_user),
      jsonb_build_object(
        'class_minutes_before', 15,
        'deadline_hours_ahead', array[24, 2, 0.5]::numeric[],
        'enabled', true
      )
    ),
    'subscriptions', coalesce(
      (select jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth))
         from push_subscriptions s where s.user_id = v_user),
      '[]'::jsonb
    ),
    'classes', coalesce(
      (select jsonb_agg(jsonb_build_object(
                'id', c.id, 'course', c.course, 'day_of_week', c.day_of_week,
                'start_time', c.start_time, 'room', c.room))
         from class_sessions c where c.user_id = v_user),
      '[]'::jsonb
    ),
    'deadlines', coalesce(
      (select jsonb_agg(jsonb_build_object(
                'id', d.id, 'title', d.title, 'course', d.course,
                'kind', d.kind, 'due_at', d.due_at))
         from deadlines d
        where d.user_id = v_user
          and d.due_at between now() and now() + interval '48 hours'),
      '[]'::jsonb
    )
  ) into v_out;

  return v_out;
end;
$$;
