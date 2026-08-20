-- Let a signed-in student sync their OWN deadlines from the browser.
--
-- Originally `deadlines` was read-only to users, on the assumption that a
-- background worker holding the service-role key would do all writing.
-- For the MVP the sync is triggered by the student themselves, so they need
-- to write their own rows. The `auth.uid() = user_id` check still makes it
-- impossible to touch anyone else's data.
--
-- (The future cron worker will use the service-role key, which bypasses RLS
--  entirely, so these policies do not need to change when we add it.)

create policy "deadlines insert own"
  on public.deadlines for insert
  with check (auth.uid() = user_id);

create policy "deadlines update own"
  on public.deadlines for update
  using (auth.uid() = user_id);

create policy "deadlines delete own"
  on public.deadlines for delete
  using (auth.uid() = user_id);
