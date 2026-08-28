-- ============================================================
--  Turn the database-side reminder ping on, with nothing to paste
--
--  The previous migration left one manual step: someone had to open the SQL
--  editor and hand the job the bearer token, because CRON_SECRET cannot go in
--  a public repository.
--
--  There is no reason the token has to be *that* token. The database can mint
--  its own, keep the plaintext in the vault and register the hash the same way
--  the GitHub one is registered. Nothing secret is typed, committed, or passes
--  through anybody's clipboard, and the two triggers stay independent — either
--  can be revoked without touching the other.
-- ============================================================


-- One secret per name was the old rule, which left no room for a second
-- caller. The hash is what identifies a row, so it belongs in the key.
alter table public.job_secrets add column if not exists label text;

alter table public.job_secrets drop constraint if exists job_secrets_pkey;
alter table public.job_secrets add primary key (name, secret_hash);

comment on column public.job_secrets.label is
  'Which caller this secret belongs to, so it can be rotated without disturbing the others.';


/**
 * Mints a token for pg_cron, registers it, and schedules the ping.
 *
 * Takes no secret: it generates one. Safe to run again — the previous
 * pg_cron token is revoked first, so re-running rotates rather than
 * accumulating credentials.
 */
create or replace function public.provision_reminder_pings(
  p_url      text,
  p_schedule text default '*/5 * * * *'
)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $fn$
declare
  v_base  text := rtrim(p_url, '/');
  v_token text;
  v_job   bigint;
begin
  if v_base !~ '^https://' then
    raise exception 'The URL must start with https:// (got %)', v_base;
  end if;

  v_token := encode(gen_random_bytes(32), 'hex');

  -- Rotate: drop the token this job used last time, leave every other caller
  -- (the GitHub workflow's) alone.
  delete from job_secrets where name = 'reminders' and label = 'pg_cron';

  insert into job_secrets (name, secret_hash, label)
  values ('reminders', encode(digest(v_token, 'sha256'), 'hex'), 'pg_cron');

  -- Plaintext lives in the vault, never in cron.job — a job command is stored
  -- as readable text, so a token baked into it would be sitting in the open.
  delete from vault.secrets where name = 'recall_cron_secret';
  perform vault.create_secret(v_token, 'recall_cron_secret', 'Bearer token for /api/cron/reminders');

  if exists (select 1 from cron.job where jobname = 'recall-reminders') then
    perform cron.unschedule('recall-reminders');
  end if;

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

revoke execute on function public.provision_reminder_pings(text, text) from anon, authenticated;


-- Turn it on. The URL is public, so this can live in the repository.
select public.provision_reminder_pings('https://recall-kohl-mu.vercel.app');
