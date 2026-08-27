-- Let a second account take over a push subscription on a shared device.
--
-- A browser hands out ONE push subscription per installed app, regardless of
-- who is signed in. So when a second student signs in on the same phone — or
-- the same person signs in with a different account — the browser returns the
-- endpoint the first account already registered.
--
-- push_subscriptions.endpoint is unique, and there is no update policy, so
-- that insert simply failed. The UI still said "reminders on", because it asks
-- the browser rather than the server, and the account quietly received nothing.
--
-- Whoever most recently enabled reminders on a device should own it, so the
-- claim removes any previous holder first. It can only ever assign the
-- subscription to the caller: auth.uid() comes from the session, never from an
-- argument.

create or replace function public.claim_push_subscription(
  p_endpoint text,
  p_p256dh   text,
  p_auth     text
)
returns void
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

  -- Release it from whoever held it before, including this same user.
  delete from push_subscriptions where endpoint = p_endpoint;

  insert into push_subscriptions (user_id, endpoint, p256dh, auth)
  values (v_user, p_endpoint, p_p256dh, p_auth);
end;
$$;

grant execute on function public.claim_push_subscription(text, text, text) to authenticated;
