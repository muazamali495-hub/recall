-- Undo a notification claim when every delivery failed.
--
-- record_notification() claims a reminder BEFORE it is sent, so two overlapping
-- runs can't both send it. The cost of that ordering is that a failed send
-- leaves a claim behind and the reminder is never retried — it just vanishes.
--
-- This lets the sender release its own claim so the next run picks it up again.

create or replace function public.release_notification(
  p_token_hash text,
  p_kind       text,
  p_ref_id     text,
  p_window_key text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
begin
  select user_id into v_user from sync_devices where token_hash = p_token_hash;
  if v_user is null then return; end if;

  delete from notifications_sent
   where user_id = v_user
     and kind = p_kind
     and ref_id = p_ref_id
     and window_key = p_window_key;
end;
$$;

grant execute on function public.release_notification(text, text, text, text) to anon, authenticated;
