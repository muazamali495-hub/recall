-- reminder_context() invents a default when a student has no prefs row.
-- That default still said {24, 2}, so anyone who never touched their settings
-- kept the old windows and got no last-minute alert.

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
        'class_minutes_before', 30,
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
