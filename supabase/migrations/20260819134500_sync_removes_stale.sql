-- Make a sync authoritative: whatever Slate reports is the full picture.
--
-- Two reasons this matters:
--   1. A teacher who deletes or reschedules an event should not leave a
--      ghost deadline on the student's dashboard forever.
--   2. Moodle emits some deadlines twice (a quiz's open/close events, or one
--      copy per group). The parser now collapses those, so the extra rows
--      already stored need clearing out.
--
-- We only prune when the feed actually returned events, so a failed or empty
-- fetch can never wipe a student's dashboard.

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
