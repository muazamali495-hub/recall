-- ============================================================
--  Slate returns every course a student has ever taken
--
--  The first live sync sent 18 courses and stored none of them. Postgres
--  refused with 21000, "ON CONFLICT DO UPDATE command cannot affect row a
--  second time": the list spans every semester, the same code appears more
--  than once — a retake, or the same course in two sections — and one insert
--  statement tried to write the same key twice.
--
--  The names are the same course either way, so one per code is enough, and
--  the section Slate bakes into the name ("Advance Software Engineering-
--  BSCS-6F") comes off — the section is already stored on each deadline,
--  where it is per-deadline and correct, and repeating it in the name would
--  print "…-BSCS-6F · CS04327 · BSCS-6B" for a student in two sections.
-- ============================================================

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

  if jsonb_array_length(p_courses) > 200 then
    raise exception 'too many courses' using errcode = '54000';
  end if;

  insert into courses (user_id, code, name, source, updated_at)
  select v_user, code, name, 'slate', now()
    from (
      select distinct on (code)
             code,
             name
        from (
          select
            trim(split_part(e ->> 'shortname', '|', 1)) as code,
            -- Strip a trailing " - BSCS-6F" style section from the name.
            left(trim(regexp_replace(
              trim(e ->> 'fullname'),
              '\s*[-–—]\s*[A-Z]{2,6}-\d{1,2}[A-Z]?\s*$',
              ''
            )), 80) as name,
            e ->> 'shortname' as shortname
          from jsonb_array_elements(p_courses) as e
        ) raw
       where nullif(code, '') is not null
         and nullif(name, '') is not null
       -- Later terms sort after earlier ones in the shortname's tail
       -- ("F26" after "F25"), so this leans towards the current offering when
       -- the names differ at all. When they are the same it does not matter.
       order by code, shortname desc
    ) deduped
  on conflict (user_id, code) do update
     set name       = excluded.name,
         source     = 'slate',
         updated_at = now()
   where courses.source = 'slate';

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.sync_courses(text, jsonb) to anon, authenticated;
