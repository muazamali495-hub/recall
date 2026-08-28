-- ============================================================
--  Let the database trigger reminders on its own schedule
--
--  Reminders have been driven by a GitHub Actions `schedule:`, which asks for
--  a run every ten minutes. The actual run history over three days:
--
--    26 Aug   ~30 runs, gaps of 20 to 80 minutes
--    27 Aug   THREE runs — 00:48, 10:36, 20:43
--    28 Aug   one run, 04:29
--
--  GitHub documents `schedule:` as best-effort and drops runs under load, and
--  a high-frequency cron on a free public repo is the first thing dropped. A
--  fifteen-minute class reminder cannot survive a ten-hour gap, which is why a
--  four-class day produced a single notification.
--
--  pg_cron runs inside this database, on time, on the free tier, with nothing
--  in between to deprioritise it. The GitHub workflow stays as a second
--  trigger — reminders are claimed before sending, so two triggers can never
--  double-send, and either one alone is enough.
--
--  This migration only defines the plumbing. Enabling it needs the bearer
--  token, which does not belong in a public repository, so that is one line
--  run once from the Supabase SQL editor. See the bottom of this file.
-- ============================================================


-- pg_cron creates the `cron` schema and pg_net the `net` schema. Both are
-- available on the Supabase free tier.
create extension if not exists pg_cron;
create extension if not exists pg_net;


/**
 * Schedules (or reschedules) the reminder ping.
 *
 * The token is put in Supabase Vault rather than baked into the job command,
 * because cron.job is readable by anyone who can read the database and a
 * command string is stored there in plain text.
 *
 * Safe to run again: it replaces the secret and the schedule rather than
 * stacking a second job on top.
 */
create or replace function public.enable_reminder_pings(
  p_secret   text,
  p_url      text,
  p_schedule text default '*/5 * * * *'
)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $fn$
declare
  v_base text := rtrim(p_url, '/');
  v_job  bigint;
begin
  if p_secret is null or length(p_secret) < 16 then
    raise exception 'Pass the real CRON_SECRET — it should be a long random string.';
  end if;

  if v_base !~ '^https://' then
    raise exception 'The URL must start with https:// (got %)', v_base;
  end if;

  -- Vault rejects a duplicate name, so clear any previous value first.
  delete from vault.secrets where name = 'recall_cron_secret';
  perform vault.create_secret(p_secret, 'recall_cron_secret', 'Bearer token for /api/cron/reminders');

  if exists (select 1 from cron.job where jobname = 'recall-reminders') then
    perform cron.unschedule('recall-reminders');
  end if;

  -- The URL is interpolated because it is not a secret. The token is read at
  -- run time from the vault, so it never appears in cron.job.
  select cron.schedule(
    'recall-reminders',
    p_schedule,
    format($job$
      select net.http_post(
        url     := %L,
        headers := jsonb_build_object(
          'Content-Type',  'application/json',
          'Authorization', 'Bearer ' || (
            select decrypted_secret from vault.decrypted_secrets
             where name = 'recall_cron_secret'
          )
        ),
        body                 := '{}'::jsonb,
        timeout_milliseconds := 60000
      );
    $job$, v_base || '/api/cron/reminders')
  ) into v_job;

  return format('Scheduled job %s (%s) → %s/api/cron/reminders', v_job, p_schedule, v_base);
end;
$fn$;


/** Stops the database-side pings. The GitHub workflow keeps running. */
create or replace function public.disable_reminder_pings()
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not exists (select 1 from cron.job where jobname = 'recall-reminders') then
    return 'Not scheduled.';
  end if;

  perform cron.unschedule('recall-reminders');
  return 'Unscheduled.';
end;
$$;


/**
 * "Is it actually running, and is it working?"
 *
 * cron.job_run_details records every run with its status, which is the only
 * place a failing ping shows up — net.http_post is asynchronous and swallows
 * transport errors, so a broken URL looks like a job that succeeded.
 */
create or replace function public.reminder_ping_history(p_limit integer default 20)
returns table (started timestamptz, status text, message text)
language sql
security definer
set search_path = public, extensions
as $$
  select start_time, status, return_message
    from cron.job_run_details d
    join cron.job j on j.jobid = d.jobid
   where j.jobname = 'recall-reminders'
   order by start_time desc
   limit p_limit;
$$;

-- Deliberately not granted to anon or authenticated: these take the bearer
-- token and change scheduling. They are run from the SQL editor, as postgres.
revoke execute on function public.enable_reminder_pings(text, text, text) from anon, authenticated;
revoke execute on function public.disable_reminder_pings()                 from anon, authenticated;
revoke execute on function public.reminder_ping_history(integer)           from anon, authenticated;


-- ============================================================
--  To turn this on, run once in the Supabase SQL editor:
--
--    create extension if not exists pg_cron;
--    create extension if not exists pg_net;
--
--    select public.enable_reminder_pings(
--      '<your CRON_SECRET>',
--      'https://<your-app>.vercel.app'
--    );
--
--  Then check it is firing:
--
--    select * from public.reminder_ping_history();
-- ============================================================
