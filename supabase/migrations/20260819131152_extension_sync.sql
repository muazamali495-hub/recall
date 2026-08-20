-- ============================================================
--  Browser-extension sync
--
--  Slate sits behind Cloudflare, which blocks server-to-server
--  requests. So the student's own browser does the fetching, via
--  an extension, and pushes the parsed deadlines here.
--
--  The extension proves who it is with a device token. That token
--  is stored HASHED — same reasoning as a password: if this table
--  ever leaked, the hashes alone can't be used to sync as anyone.
-- ============================================================

-- A short-lived code shown on the website and typed into the extension once.
create table public.pairing_codes (
  code       text primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  expires_at timestamptz not null,
  used_at    timestamptz,
  created_at timestamptz not null default now()
);

alter table public.pairing_codes enable row level security;
-- No direct client access: the functions below are the only way in.

-- One row per installed extension.
create table public.sync_devices (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  token_hash   text not null unique,
  label        text,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz
);

alter table public.sync_devices enable row level security;

create policy "devices read own"
  on public.sync_devices for select
  using (auth.uid() = user_id);

-- Lets a student revoke an extension from the website.
create policy "devices delete own"
  on public.sync_devices for delete
  using (auth.uid() = user_id);


-- ------------------------------------------------------------
-- The website calls this to show a pairing code.
-- ------------------------------------------------------------
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

  v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

  insert into pairing_codes (code, user_id, expires_at)
  values (v_code, v_user, now() + interval '15 minutes');

  return v_code;
end;
$$;


-- ------------------------------------------------------------
-- The extension calls this once, with the code the student typed.
-- ------------------------------------------------------------
create or replace function public.pair_device(
  p_code       text,
  p_token_hash text,
  p_label      text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
begin
  select user_id into v_user
    from pairing_codes
   where code = upper(trim(p_code))
     and used_at is null
     and expires_at > now();

  if v_user is null then
    raise exception 'invalid or expired code' using errcode = '28000';
  end if;

  update pairing_codes set used_at = now() where code = upper(trim(p_code));

  insert into sync_devices (user_id, token_hash, label)
  values (v_user, p_token_hash, p_label);

  return true;
end;
$$;


-- ------------------------------------------------------------
-- The extension calls this on every sync.
--
-- security definer lets it write deadlines without the caller
-- holding a session — but it can ONLY ever write rows for the
-- user that owns the device token. It is not a general backdoor.
-- ------------------------------------------------------------
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
  return v_count;
end;
$$;

-- The pairing/sync functions are called without a user session, so they
-- must be callable by the anon role. Their own checks do the gatekeeping.
grant execute on function public.pair_device(text, text, text)    to anon, authenticated;
grant execute on function public.sync_deadlines(text, jsonb)      to anon, authenticated;
grant execute on function public.create_pairing_code()            to authenticated;
