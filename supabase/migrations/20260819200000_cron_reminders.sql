-- ============================================================
--  Server-side reminder job
--
--  Until now the extension triggered every reminder check, which
--  meant a student with a closed laptop got nothing — even though
--  their deadlines were sitting right here and the server can read
--  them perfectly well. Only Slate ingestion needs a browser;
--  reminders never did.
--
--  The obvious way to let a cron read every user's rows is the
--  service-role key, which bypasses RLS entirely. We don't use it:
--  one leak would expose every student's data. Instead the job
--  proves itself with a shared secret and gets back exactly the
--  three things it needs, for exactly the users who could receive
--  a notification.
-- ============================================================

create extension if not exists pgcrypto with schema extensions;

-- The job's credential, stored hashed like any other.
create table if not exists public.job_secrets (
  name        text primary key,
  secret_hash text not null,
  created_at  timestamptz not null default now()
);

alter table public.job_secrets enable row level security;
-- No policies: nothing reaches this table except the functions below.

create or replace function public.verify_job_secret(p_name text, p_secret text)
returns boolean
language sql
stable
security definer
-- extensions is on the path because Supabase installs pgcrypto there, so a
-- bare digest() call would not resolve.
set search_path = public, extensions
as $$
  select exists (
    select 1 from job_secrets
     where name = p_name
       and secret_hash = encode(digest(p_secret, 'sha256'), 'hex')
  );
$$;


/**
 * Everything the reminder job needs, for every student who could actually
 * receive a notification.
 *
 * Users with no push subscription are skipped — there is nothing to send to,
 * so fetching their deadlines would be wasted work and needless exposure.
 */
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
          'class_minutes_before', 30,
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


/** Claims a reminder. Returns false when it was already sent. */
create or replace function public.cron_record_notification(
  p_secret     text,
  p_user_id    uuid,
  p_kind       text,
  p_ref_id     text,
  p_window_key text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not verify_job_secret('reminders', p_secret) then
    raise exception 'bad job secret' using errcode = '28000';
  end if;

  insert into notifications_sent (user_id, kind, ref_id, window_key)
  values (p_user_id, p_kind, p_ref_id, p_window_key)
  on conflict (user_id, kind, ref_id, window_key) do nothing;

  return found;
end;
$$;


/** Releases a claim when every delivery failed, so the next run retries. */
create or replace function public.cron_release_notification(
  p_secret     text,
  p_user_id    uuid,
  p_kind       text,
  p_ref_id     text,
  p_window_key text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not verify_job_secret('reminders', p_secret) then
    raise exception 'bad job secret' using errcode = '28000';
  end if;

  delete from notifications_sent
   where user_id = p_user_id and kind = p_kind
     and ref_id = p_ref_id and window_key = p_window_key;
end;
$$;


/** Drops a subscription the browser has thrown away (HTTP 404/410). */
create or replace function public.cron_drop_subscription(p_secret text, p_endpoint text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not verify_job_secret('reminders', p_secret) then
    raise exception 'bad job secret' using errcode = '28000';
  end if;

  delete from push_subscriptions where endpoint = p_endpoint;
end;
$$;

grant execute on function public.cron_reminder_batch(text, integer)                     to anon, authenticated;
grant execute on function public.cron_record_notification(text, uuid, text, text, text) to anon, authenticated;
grant execute on function public.cron_release_notification(text, uuid, text, text, text) to anon, authenticated;
grant execute on function public.cron_drop_subscription(text, text)                     to anon, authenticated;
-- verify_job_secret is deliberately NOT granted: it is only called internally.
revoke execute on function public.verify_job_secret(text, text) from anon, authenticated;
