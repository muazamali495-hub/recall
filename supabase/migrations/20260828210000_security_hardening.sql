-- ============================================================
--  Security review follow-ups
-- ============================================================

-- ---- 1. Pairing codes were only 8 hex characters ----
--
-- A pairing code is a bearer credential: whoever redeems one gets a device
-- token that can read every deadline, class and push subscription on the
-- account. Eight hex characters is 4.3 billion possibilities, pair_device is
-- callable unauthenticated, and nothing rate-limits it. That is survivable
-- with two users and a fifteen-minute window; it is not something to leave in
-- place while asking a university to endorse the app.
--
-- Twelve characters is 2.8 × 10^14 — brute force stops being a question at all
-- rather than being merely impractical. The code is normally passed
-- automatically by the website; typing it is the fallback path, so the extra
-- four characters cost almost nothing.

create or replace function public.create_pairing_code()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_code text;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  -- One live code per student, and sweep expired ones.
  delete from pairing_codes where user_id = v_user or expires_at < now();

  v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));

  insert into pairing_codes (code, user_id, expires_at)
  values (v_code, v_user, now() + interval '15 minutes');

  return v_code;
end;
$$;


-- ---- 2. set_job_secret accepted any name, from anyone ----
--
-- Two problems. Changing job_secrets' primary key to (name, secret_hash) — so
-- the GitHub workflow and pg_cron could each hold their own credential — left
-- this function's `on conflict (name)` matching no constraint, which silently
-- broke secret rotation.
--
-- And the function is reachable unauthenticated. The guard correctly refuses
-- to touch an existing name without the current secret, so nobody can hijack
-- the reminder job. But any name that does NOT exist could be created freely,
-- letting a stranger insert unbounded rows into the table. Recall only ever
-- uses one name, so the function now only accepts that one.

create or replace function public.set_job_secret(
  p_name    text,
  p_new     text,
  p_current text default null
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_exists boolean;
begin
  if p_name is distinct from 'reminders' then
    raise exception 'unknown job' using errcode = '22023';
  end if;

  if length(coalesce(p_new, '')) < 16 then
    raise exception 'secret must be at least 16 characters';
  end if;

  select exists (select 1 from job_secrets where name = p_name) into v_exists;

  if v_exists and not verify_job_secret(p_name, coalesce(p_current, '')) then
    raise exception 'current secret required to rotate' using errcode = '28000';
  end if;

  -- Replaces every credential for this job rather than upserting one row: the
  -- key is (name, secret_hash) now, so there is no single row to conflict on,
  -- and rotating should retire the old secret rather than leave it valid.
  delete from job_secrets where name = p_name;

  insert into job_secrets (name, secret_hash, label)
  values (p_name, encode(digest(p_new, 'sha256'), 'hex'), 'manual');
end;
$$;


-- ---- 3. Tighten who can reach the job-secret plumbing ----
--
-- Postgres grants EXECUTE to PUBLIC on new functions by default, which is why
-- these showed up as callable by anon even where no grant said so. The cron
-- functions still need anon (the reminder job authenticates with the secret,
-- not a session), but the ones only ever run by hand do not.

revoke execute on function public.enable_reminder_pings(text, text, text) from public, anon, authenticated;
revoke execute on function public.provision_reminder_pings(text, text)     from public, anon, authenticated;
revoke execute on function public.disable_reminder_pings()                 from public, anon, authenticated;
revoke execute on function public.reminder_ping_history(integer)           from public, anon, authenticated;
revoke execute on function public.verify_job_secret(text, text)            from public, anon, authenticated;

-- handle_new_user is a trigger body. Calling it directly is meaningless, but
-- there is no reason for it to be reachable at all.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
