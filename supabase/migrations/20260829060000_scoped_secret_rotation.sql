-- ============================================================
--  Rotating one credential must not revoke the other
--
--  Two callers hold a 'reminders' secret: the GitHub workflow, whose value
--  lives in a repository secret, and pg_cron, which mints and keeps its own in
--  the vault. That separation is the point — either can be revoked without
--  touching the other.
--
--  set_job_secret did `delete from job_secrets where name = p_name`, which is
--  every credential for the job. Rotating the GitHub one would have silently
--  taken pg_cron's with it, and pg_cron is the trigger that actually fires
--  reminders on time; GitHub is the unreliable backup. The symptom would have
--  been reminders quietly stopping, hours later, with a rotation that appeared
--  to succeed — the same shape of failure this project has already lost a day
--  to.
--
--  The delete is now scoped to the credential being replaced.
-- ============================================================

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

  -- Only the manually-held credential. Rows created before the label column
  -- existed are null and belong to this same caller, hence the coalesce.
  -- pg_cron's row is labelled and survives untouched.
  delete from job_secrets
   where name = p_name
     and coalesce(label, 'manual') = 'manual';

  insert into job_secrets (name, secret_hash, label)
  values (p_name, encode(digest(p_new, 'sha256'), 'hex'), 'manual');
end;
$$;
