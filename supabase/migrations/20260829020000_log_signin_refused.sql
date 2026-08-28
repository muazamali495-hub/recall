-- Records a sign-in refused for being outside the university.
--
-- Called from the auth callback in the moment between Supabase creating the
-- account and Recall undoing it, so auth.uid() is available and the caller
-- cannot claim to be anyone else.
--
-- Only the domain is kept. The full address belongs to a person who was turned
-- away, and storing it would mean holding data on people who are not users —
-- the domain is the part that answers "is someone probing this?".
create or replace function public.log_signin_refused(p_domain text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    return; -- nothing to attribute it to; not worth failing the rejection over
  end if;

  perform log_security_event(v_user, 'signin.refused', jsonb_build_object('domain', p_domain));
end;
$$;

grant execute on function public.log_signin_refused(text) to authenticated;
