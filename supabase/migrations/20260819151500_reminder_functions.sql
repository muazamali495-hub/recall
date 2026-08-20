-- ============================================================
--  Reminder plumbing, without a service-role key.
--
--  The reminder job runs without a user session (the extension
--  triggers it with its device token), so it needs to read across
--  RLS. Rather than hand the app the god-mode service-role key,
--  these security-definer functions do exactly one job each and
--  can only ever touch the user who owns the device token.
-- ============================================================

/**
 * Everything the reminder job needs for one student, in a single round trip.
 */
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
      jsonb_build_object('class_minutes_before', 30, 'deadline_hours_ahead', array[24, 2], 'enabled', true)
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


/**
 * Records that a notification went out.
 *
 * Returns false when this exact reminder was already sent, which is how the
 * job avoids pinging a student about the same quiz on every run. The insert
 * is the lock — checking first and inserting after would race.
 */
create or replace function public.record_notification(
  p_token_hash text,
  p_kind       text,
  p_ref_id     text,
  p_window_key text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
begin
  select user_id into v_user from sync_devices where token_hash = p_token_hash;
  if v_user is null then
    raise exception 'unknown device' using errcode = '28000';
  end if;

  insert into notifications_sent (user_id, kind, ref_id, window_key)
  values (v_user, p_kind, p_ref_id, p_window_key)
  on conflict (user_id, kind, ref_id, window_key) do nothing;

  return found;
end;
$$;


/**
 * Drops a push subscription the browser has since invalidated (HTTP 404/410).
 */
create or replace function public.drop_push_subscription(
  p_token_hash text,
  p_endpoint   text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
begin
  select user_id into v_user from sync_devices where token_hash = p_token_hash;
  if v_user is null then return; end if;

  delete from push_subscriptions where user_id = v_user and endpoint = p_endpoint;
end;
$$;

grant execute on function public.reminder_context(text)                      to anon, authenticated;
grant execute on function public.record_notification(text, text, text, text) to anon, authenticated;
grant execute on function public.drop_push_subscription(text, text)          to anon, authenticated;
