-- ============================================================
--  A calendar cannot be allowed to fill the database
--
--  /api/sync capped the raw .ics at 2MB but nothing capped the number of
--  events inside it. A minimal VEVENT is about 200 bytes, so a crafted feed
--  yields roughly ten thousand deadline rows in one call — and it can be
--  called again immediately. The free tier is 500MB, so a handful of those
--  takes Recall down for everybody.
--
--  It is not a way in: a device token is needed, so this is a paired student
--  rather than a stranger. It is a way to break the thing for everyone else,
--  which is worth closing before there are other students to break it for.
--
--  The cap is enforced here as well as in the parser because sync_deadlines is
--  callable directly over PostgREST with a device token — an app-layer limit
--  would simply be walked around, the same way pair_device's would have been.
--
--  A thousand is unreachable for a real student: the busiest account on this
--  system currently holds twelve.
-- ============================================================

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

  -- Refused rather than truncated. Silently keeping the first thousand would
  -- hide whichever of the two things is actually happening: a broken feed, or
  -- someone testing how much they can push in.
  if v_size > 1000 then
    perform log_security_event(v_user, 'sync.oversized', jsonb_build_object('events', v_size));
    raise exception 'calendar has % events, which is far more than a semester holds', v_size
      using errcode = '54000';
  end if;

  insert into deadlines (user_id, uid, title, course, kind, due_at, source_url)
  select v_user,
         e ->> 'uid',
         coalesce(nullif(e ->> 'title', ''), 'Untitled'),
         nullif(e ->> 'course', ''),
         coalesce(nullif(e ->> 'kind', ''), 'other'),
         nullif(e ->> 'due_at', '')::timestamptz,
         nullif(e ->> 'source_url', '')
    from jsonb_array_elements(p_events) as e
   where e ->> 'uid' is not null
  on conflict (user_id, uid) do update
     set title      = excluded.title,
         course     = excluded.course,
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
