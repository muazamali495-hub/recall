-- The Android app mints its own device token after the student signs in,
-- rather than making them copy a pairing code between two halves of the same
-- app. That insert runs as the user, so it needs a policy.
--
-- auth.uid() = user_id means a student can only ever create a device for
-- themselves.

create policy "devices insert own"
  on public.sync_devices for insert
  with check (auth.uid() = user_id);
