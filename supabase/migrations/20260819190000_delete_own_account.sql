-- Lets a signed-in user delete their own account.
--
-- Needed because the sign-in flow only learns the email address AFTER Supabase
-- has already created the auth user. When someone signs in with a non-UOL
-- Google account we reject them — but without this their row (and the profile
-- the trigger made) would linger forever.
--
-- It can only ever delete the caller: auth.uid() is taken from the session,
-- never from an argument, so this cannot be pointed at anyone else.

create or replace function public.delete_own_account()
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

  -- Everything else cascades from auth.users via on delete cascade.
  delete from auth.users where id = v_user;
end;
$$;

grant execute on function public.delete_own_account() to authenticated;
