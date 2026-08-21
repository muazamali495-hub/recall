-- Registers the reminder job's secret.
--
-- The value itself must never live in a migration — these are committed to a
-- public repository. So the secret is set at runtime instead, and this
-- function is the only way in.
--
-- It can be called freely the FIRST time (nothing to protect yet). After that
-- it demands the current secret, so rotating is possible but hijacking is not.

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
  if length(coalesce(p_new, '')) < 16 then
    raise exception 'secret must be at least 16 characters';
  end if;

  select exists (select 1 from job_secrets where name = p_name) into v_exists;

  if v_exists and not verify_job_secret(p_name, coalesce(p_current, '')) then
    raise exception 'current secret required to rotate' using errcode = '28000';
  end if;

  insert into job_secrets (name, secret_hash)
  values (p_name, encode(digest(p_new, 'sha256'), 'hex'))
  on conflict (name) do update set secret_hash = excluded.secret_hash;
end;
$$;

grant execute on function public.set_job_secret(text, text, text) to anon, authenticated;
