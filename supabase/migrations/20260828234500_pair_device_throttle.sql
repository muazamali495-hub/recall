-- ============================================================
--  Make the pairing throttle actually count
--
--  The previous attempt incremented a counter and then raised an exception for
--  the invalid-code path. Raising aborts the transaction, and aborting rolls
--  back the increment — so thirty-five wrong codes in a row produced thirty-five
--  rejections and a counter still sitting at zero. It looked exactly like rate
--  limiting from the outside and did nothing at all, which is the worst way for
--  a control to fail: the header says protected, the behaviour is not.
--
--  So the failure paths return a value instead of raising. Returning commits,
--  and the count survives.
-- ============================================================

-- The return type changes, and Postgres will not replace a function's return
-- type in place.
drop function if exists public.pair_device(text, text, text);

create function public.pair_device(
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
  -- Counted before the code is even looked at, so an attacker cannot avoid the
  -- meter by choosing codes that fail early. A student pairing normally spends
  -- one of these and never notices.
  v_gate := consume_rate_limit('pair', 'global', 40, 600);

  if not (v_gate->>'allowed')::boolean then
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
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;

  update pairing_codes set used_at = now() where code = upper(trim(p_code));

  insert into sync_devices (user_id, token_hash, label)
  values (v_user, p_token_hash, p_label);

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.pair_device(text, text, text) to anon, authenticated;
