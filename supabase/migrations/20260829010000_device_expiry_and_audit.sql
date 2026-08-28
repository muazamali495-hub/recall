-- ============================================================
--  Device expiry, and a record of what happened
--
--  A device token is a permanent bearer credential: it reads every deadline,
--  class and push subscription on an account, and can write deadlines back.
--  Nothing expired them and nothing recorded them, so a token handed out once
--  stayed live forever and its use left no trace.
--
--  Two changes. Tokens now go stale on their own, and the things worth knowing
--  about get written down.
-- ============================================================


-- ---- 1. Somewhere to write what happened ----
--
-- Deliberately small. An audit log nobody reads is a table that grows; this
-- one exists to answer two questions — "what devices have been linked to my
-- account?" and, after something goes wrong, "was anyone trying?"
create table if not exists public.security_events (
  id         bigserial primary key,
  -- Null for events with no owner: a stranger guessing pairing codes belongs
  -- to nobody, because there is no way to know whose code they were after.
  user_id    uuid references auth.users on delete cascade,
  kind       text not null,
  detail     jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists security_events_user_idx on public.security_events (user_id, created_at desc);
create index if not exists security_events_time_idx on public.security_events (created_at);

alter table public.security_events enable row level security;

-- Read-only, and only your own. Nothing may insert through the API: events are
-- written by the security-definer functions below, so a client cannot forge a
-- history or erase one.
create policy "read own security events"
  on public.security_events for select
  using (auth.uid() = user_id);


/** Records an event. Internal — callers must not choose their own user_id. */
create or replace function public.log_security_event(
  p_user_id uuid,
  p_kind    text,
  p_detail  jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into security_events (user_id, kind, detail)
  values (p_user_id, p_kind, coalesce(p_detail, '{}'::jsonb));

  -- Ninety days. Long enough to investigate something noticed late, short
  -- enough that the table never becomes a liability of its own.
  if random() < 0.01 then
    delete from security_events where created_at < now() - interval '90 days';
  end if;
end;
$$;

revoke execute on function public.log_security_event(uuid, text, jsonb) from public, anon, authenticated;


-- ---- 2. Tokens that go stale on their own ----
--
-- Two rules, because the two cases mean different things. A pairing that never
-- once called in is an abandoned attempt — the extension was never finished
-- being set up — and there is nothing to lose by dropping it the next day. A
-- device that used to sync and then stopped is a laptop someone put away; sixty
-- days is comfortably longer than a semester break.
--
-- A device in regular use is never touched, which is the property that matters:
-- nobody gets logged out mid-semester by a cleanup job.
create or replace function public.expire_stale_devices()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row    record;
  v_count  integer := 0;
begin
  for v_row in
    select id, user_id, label, last_seen_at
      from sync_devices
     where (last_seen_at is null and created_at < now() - interval '24 hours')
        or (last_seen_at is not null and last_seen_at < now() - interval '60 days')
  loop
    delete from sync_devices where id = v_row.id;

    perform log_security_event(
      v_row.user_id,
      'device.expired',
      jsonb_build_object(
        'label', v_row.label,
        'reason', case when v_row.last_seen_at is null then 'never synced' else 'unused 60 days' end
      )
    );

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke execute on function public.expire_stale_devices() from public, anon, authenticated;


-- ---- 3. Record pairing, and pairing attempts ----
--
-- Rebuilt rather than patched so the logging sits on every path out. A device
-- being linked is the single most security-relevant thing a student can do,
-- and until now it happened silently.
create or replace function public.pair_device(
  p_code       text,
  p_token_hash text,
  p_label      text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
  v_gate jsonb;
begin
  -- Counted before the code is looked at, so an attacker cannot dodge the
  -- meter by choosing codes that fail early.
  v_gate := consume_rate_limit('pair', 'global', 40, 600);

  if not (v_gate->>'allowed')::boolean then
    perform log_security_event(null, 'pair.throttled', '{}'::jsonb);
    return jsonb_build_object(
      'ok', false,
      'reason', 'throttled',
      'retry_after', (v_gate->>'retry_after')::int
    );
  end if;

  select user_id into v_user
    from pairing_codes
   where code = upper(trim(p_code))
     and used_at is null
     and expires_at > now();

  if v_user is null then
    -- No owner recorded: there is no way to tell whose code was being guessed,
    -- and attributing it to a user we cannot identify would be a lie.
    perform log_security_event(null, 'pair.failed', '{}'::jsonb);
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;

  update pairing_codes set used_at = now() where code = upper(trim(p_code));

  insert into sync_devices (user_id, token_hash, label)
  values (v_user, p_token_hash, p_label);

  perform log_security_event(v_user, 'device.paired', jsonb_build_object('label', p_label));

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.pair_device(text, text, text) to anon, authenticated;


/**
 * Removes one of your own devices, and says so in the log.
 *
 * A plain DELETE through the API would work — there is a policy for it — but
 * it would leave no record, and "a device disappeared and nobody knows why"
 * is exactly the gap this whole migration exists to close.
 */
create or replace function public.revoke_own_device(p_device_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user  uuid := auth.uid();
  v_label text;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  -- Scoped to the caller: passing somebody else's device id deletes nothing.
  delete from sync_devices
   where id = p_device_id and user_id = v_user
   returning label into v_label;

  if not found then
    return false;
  end if;

  perform log_security_event(v_user, 'device.removed', jsonb_build_object('label', v_label));
  return true;
end;
$$;

grant execute on function public.revoke_own_device(uuid) to authenticated;


-- ---- 4. Run the sweep ----
--
-- Hourly, not daily. Deleting the row is what actually revokes the token —
-- every function that accepts one looks the device up — so the sweep interval
-- is the window in which an expired token still works. An hour is a reasonable
-- bound; a day is not.
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    if exists (select 1 from cron.job where jobname = 'recall-expire-devices') then
      perform cron.unschedule('recall-expire-devices');
    end if;

    perform cron.schedule('recall-expire-devices', '7 * * * *', 'select public.expire_stale_devices();');
  end if;
end $$;
