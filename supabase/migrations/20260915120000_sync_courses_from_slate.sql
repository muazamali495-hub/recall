-- ============================================================
--  Course names from Slate itself
--
--  The previous migration had students type each course's name because the
--  calendar export does not carry it. That was accepting the wrong constraint.
--  The extension already runs inside a logged-in Slate page, and Moodle's own
--  dashboard fetches the enrolled-course list — full name and shortname
--  together — through an internal web service. Asking it the same question
--  fills every name in one request, with nothing typed.
--
--  The manual editor stays as the override. Slate's name is the default;
--  a name a student set themselves is theirs and is never replaced by a sync.
-- ============================================================

alter table public.courses
  add column if not exists source text not null default 'manual'
  check (source in ('manual', 'slate'));


/**
 * Records course names the extension read from Slate.
 *
 * Takes the raw shortname and lets the same split rule the calendar import
 * uses recover the code from it — "CS13410|11-BSCS-7A-112001-FALL26" is the
 * shortname exactly as Moodle stores it, and the code is what deadlines are
 * keyed on. Doing the split here rather than in the extension keeps one rule
 * in one place; an extension that split differently would produce codes that
 * matched no deadline.
 *
 * Authenticated by device token like the calendar sync, and scoped to that
 * device's owner by the same lookup.
 */
create or replace function public.sync_courses(
  p_token_hash text,
  p_courses    jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user  uuid;
  v_count integer := 0;
begin
  select user_id into v_user
    from sync_devices
   where token_hash = p_token_hash;

  if v_user is null then
    raise exception 'unknown device' using errcode = '28000';
  end if;

  if p_courses is null or jsonb_array_length(p_courses) = 0 then
    return 0;
  end if;

  -- Nobody is enrolled in two hundred courses. Anything larger is not a
  -- course list.
  if jsonb_array_length(p_courses) > 200 then
    raise exception 'too many courses' using errcode = '54000';
  end if;

  insert into courses (user_id, code, name, source, updated_at)
  select v_user,
         -- The code is everything before the pipe; the calendar import keeps
         -- the same rule, so the two always agree.
         trim(split_part(e ->> 'shortname', '|', 1)),
         left(trim(e ->> 'fullname'), 80),
         'slate',
         now()
    from jsonb_array_elements(p_courses) as e
   where nullif(trim(split_part(e ->> 'shortname', '|', 1)), '') is not null
     and nullif(trim(e ->> 'fullname'), '') is not null
  on conflict (user_id, code) do update
     set name       = excluded.name,
         source     = 'slate',
         updated_at = now()
   -- A name the student chose is theirs. Slate only fills blanks and refreshes
   -- names Slate itself supplied.
   where courses.source = 'slate';

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.sync_courses(text, jsonb) to anon, authenticated;
