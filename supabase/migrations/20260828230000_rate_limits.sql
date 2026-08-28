-- ============================================================
--  Rate limiting
--
--  Recall runs on free tiers shared between everyone using it. One student
--  holding down the planner button exhausts the OpenRouter quota for the whole
--  university, and nothing currently stops them. That is the realistic abuse
--  here — not a determined attacker, just an ordinary person with a slow
--  connection clicking twice, or a bored one finding out what happens.
--
--  It lives in the database rather than in memory for two reasons. Vercel runs
--  many instances, so an in-process counter counts a fraction of the traffic
--  and enforces nothing. And pair_device is reachable directly over PostgREST,
--  which never touches the app at all — a limit in the app layer would simply
--  be walked around.
-- ============================================================

create table if not exists public.rate_limits (
  bucket       text        not null,
  subject      text        not null,
  window_start timestamptz not null,
  count        integer     not null default 0,

  primary key (bucket, subject, window_start)
);

alter table public.rate_limits enable row level security;
-- No policies: nothing reaches this table except the functions below.

create index if not exists rate_limits_window_idx on public.rate_limits (window_start);


/**
 * Counts one request against a bucket and says whether it may proceed.
 *
 * A fixed window rather than a sliding one: it is a handful of arithmetic and
 * one upsert, where sliding windows need per-request history. The known cost
 * is that someone can spend a full allowance at the end of one window and
 * another at the start of the next. For "don't exhaust a shared AI quota" that
 * is irrelevant; it would matter for a login throttle, and there is none here.
 *
 * Internal. The subject is a parameter, so exposing this directly would let
 * anyone burn down anybody else's allowance — the wrappers below derive the
 * subject from something the caller cannot choose.
 */
create or replace function public.consume_rate_limit(
  p_bucket  text,
  p_subject text,
  p_limit   integer,
  p_window  integer  -- seconds
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_start timestamptz;
  v_count integer;
begin
  -- Snap to the start of the current window so every caller in the same period
  -- lands on the same row and increments the same counter.
  v_start := to_timestamp(floor(extract(epoch from now()) / p_window) * p_window);

  insert into rate_limits (bucket, subject, window_start, count)
  values (p_bucket, p_subject, v_start, 1)
  on conflict (bucket, subject, window_start)
    do update set count = rate_limits.count + 1
  returning count into v_count;

  -- Sweep occasionally rather than on every call: this table is written on
  -- every request and a delete each time would cost more than the limiting.
  if random() < 0.01 then
    delete from rate_limits where window_start < now() - interval '2 hours';
  end if;

  return jsonb_build_object(
    'allowed', v_count <= p_limit,
    'count', v_count,
    'limit', p_limit,
    'retry_after', greatest(0, ceil(extract(epoch from (v_start + make_interval(secs => p_window)) - now()))::int)
  );
end;
$$;

revoke execute on function public.consume_rate_limit(text, text, integer, integer) from public, anon, authenticated;


/**
 * The same, for a signed-in student, keyed to whoever they actually are.
 *
 * auth.uid() comes from the session, so the subject cannot be supplied — which
 * is what stops one student spending another's allowance.
 */
create or replace function public.consume_my_rate_limit(
  p_bucket text,
  p_limit  integer,
  p_window integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  return consume_rate_limit(p_bucket, v_user::text, p_limit, p_window);
end;
$$;

grant execute on function public.consume_my_rate_limit(text, integer, integer) to authenticated;


/**
 * Throttles pairing attempts, and does it inside pair_device.
 *
 * This is the one endpoint an unauthenticated stranger can call that yields a
 * credential — redeem a code and you get a device token that reads every
 * deadline, class and push subscription on the account. Twelve-character codes
 * already put brute force out of reach, so this is not the last line of
 * defence; it is what makes an attempt visible and cheap to absorb instead of
 * unbounded.
 *
 * The counter is global and counts only FAILURES. There is no caller identity
 * to key on — PostgREST does not hand the database an IP — and a global
 * counter on failures cannot be tripped by ordinary use, because ordinary use
 * pastes a code that works. Someone could deliberately burn the allowance to
 * block pairing for fifteen minutes; that is a far better outcome than leaving
 * the guessing unbounded.
 */
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
  v_user  uuid;
  v_gate  jsonb;
begin
  select user_id into v_user
    from pairing_codes
   where code = upper(trim(p_code))
     and used_at is null
     and expires_at > now();

  if v_user is null then
    -- 30 wrong codes in ten minutes, across everybody. A student mistyping a
    -- code they were given will never see this.
    v_gate := consume_rate_limit('pair_fail', 'global', 30, 600);

    if not (v_gate->>'allowed')::boolean then
      raise exception 'too many pairing attempts, try again shortly'
        using errcode = '53400';
    end if;

    raise exception 'invalid or expired code' using errcode = '28000';
  end if;

  update pairing_codes set used_at = now() where code = upper(trim(p_code));

  insert into sync_devices (user_id, token_hash, label)
  values (v_user, p_token_hash, p_label);

  return true;
end;
$$;

grant execute on function public.pair_device(text, text, text) to anon, authenticated;
