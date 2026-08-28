-- ============================================================
--  Can one student read another's data?
--
--  This is the single most important property Recall has, and for a long time
--  it was only inferred: every policy says auth.uid() = user_id, and that
--  looked right. Looking right is not being enforced.
--
--  Postgres can answer it directly. set_config('role', 'authenticated') plus a
--  jwt claim makes this session indistinguishable from a signed-in browser, so
--  the query below runs under exactly the RLS a real student is subject to —
--  no second account, no credentials, no test users left behind.
--
--  HOW TO RUN
--    Supabase dashboard -> SQL Editor -> paste this whole file -> Run.
--    The report arrives as an error message. That is deliberate: raising is
--    what rolls the transaction back, so the writes it attempts can never
--    survive even if a policy were missing.
--
--  WHAT TO LOOK FOR
--    Every "attacker can see" line must read 0.
--    Every write must be 0 rows or refused.
--    The attacker's OWN counts must be non-zero — otherwise the session is
--    simply broken and the zeroes above mean nothing.
-- ============================================================

do $$
declare
  a uuid; b uuid; v text;
  b_dead_total int; b_cls_total int; b_dev_total int; b_push_total int;
  b_dead int; b_cls int; b_dev int; b_push int; b_prof int;
  a_dead int; a_cls int;
  upd int; del int; ins text;
begin
  -- The victim is whoever owns the most data, so "saw nothing" is meaningful
  -- rather than an accident of an empty account.
  select user_id into b from class_sessions group by user_id order by count(*) desc limit 1;
  select id into a from profiles where id <> b order by id limit 1;

  if a is null or b is null then
    raise exception 'Needs at least two accounts with data to be a real test.';
  end if;

  select count(*) into b_dead_total from deadlines          where user_id = b;
  select count(*) into b_cls_total  from class_sessions     where user_id = b;
  select count(*) into b_dev_total  from sync_devices       where user_id = b;
  select count(*) into b_push_total from push_subscriptions where user_id = b;

  -- From here on, this session IS a signed-in student.
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', a)::text, true);

  select count(*) into a_dead from deadlines           where user_id = a;
  select count(*) into a_cls  from class_sessions      where user_id = a;
  select count(*) into b_dead from deadlines           where user_id = b;
  select count(*) into b_cls  from class_sessions      where user_id = b;
  select count(*) into b_dev  from sync_devices        where user_id = b;
  select count(*) into b_push from push_subscriptions  where user_id = b;
  select count(*) into b_prof from profiles            where id = b;

  with x as (update deadlines set title = 'HIJACKED' where user_id = b returning 1)
    select count(*) into upd from x;
  with y as (delete from class_sessions where user_id = b returning 1)
    select count(*) into del from y;

  begin
    insert into deadlines (user_id, title, kind, due_at)
    values (b, 'planted', 'quiz', now() + interval '1 day');
    ins := 'ALLOWED  <-- LEAK';
  exception when others then
    ins := 'refused (' || sqlstate || ')';
  end;

  execute 'reset role';

  v := format(
    'signed in as %s   |   victim %s (the account with the most data)' || E'\n\n' ||
    'victim really owns:  %s deadlines, %s classes, %s devices, %s push subs' || E'\n\n' ||
    'attacker can see of the victim   (every line must be 0)' || E'\n' ||
    '   deadlines %s / %s' || E'\n' ||
    '   classes   %s / %s' || E'\n' ||
    '   devices   %s / %s' || E'\n' ||
    '   push subs %s / %s' || E'\n' ||
    '   profile   %s / 1' || E'\n\n' ||
    'attacker sees their OWN data   (must be non-zero, or the test is hollow)' || E'\n' ||
    '   %s deadlines, %s classes' || E'\n\n' ||
    'writes against the victim' || E'\n' ||
    '   UPDATE -> %s rows' || E'\n' ||
    '   DELETE -> %s rows' || E'\n' ||
    '   INSERT -> %s',
    left(a::text, 8), left(b::text, 8),
    b_dead_total, b_cls_total, b_dev_total, b_push_total,
    b_dead, b_dead_total, b_cls, b_cls_total, b_dev, b_dev_total,
    b_push, b_push_total, b_prof,
    a_dead, a_cls, upd, del, ins);

  raise exception E'\n--- CROSS-USER ISOLATION ---\n%', v;
end $$;
