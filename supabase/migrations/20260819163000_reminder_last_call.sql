-- Add a last-minute deadline reminder.
--
-- The windows were {24, 2} hours. That leaves a two-hour silence right before
-- something is due — which is precisely when a student wants to be told. A
-- quiz 20 minutes away produced no alert at all, because the 2-hour reminder
-- had already fired and nothing else matched.
--
-- 0.5 needs a fractional type, so the column moves from integer[] to numeric[].

alter table public.reminder_prefs
  alter column deadline_hours_ahead drop default;

alter table public.reminder_prefs
  alter column deadline_hours_ahead type numeric[]
  using deadline_hours_ahead::numeric[];

alter table public.reminder_prefs
  alter column deadline_hours_ahead set default '{24,2,0.5}';

-- Bring existing rows up to the new default without clobbering custom choices.
update public.reminder_prefs
   set deadline_hours_ahead = deadline_hours_ahead || array[0.5]::numeric[]
 where not (0.5 = any (deadline_hours_ahead));
