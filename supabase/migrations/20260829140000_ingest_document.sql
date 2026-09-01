-- ============================================================
--  Getting documents into the library
--
--  document_chunks has no insert policy on purpose: students will be told to
--  trust what this corpus says about university rules, so nothing should be
--  able to push text into it through the API.
--
--  The usual way around that is the service-role key, which bypasses row-level
--  security entirely. This project keeps that key empty deliberately, so
--  ingestion proves itself with the same shared secret the reminder job uses
--  and gets exactly one capability: replace one document, wholesale.
-- ============================================================

create or replace function public.ingest_document(
  p_secret text,
  p_title  text,
  p_kind   text,
  p_source text,
  p_chunks jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_doc uuid;
  v_n   integer;
begin
  if not verify_job_secret('reminders', p_secret) then
    raise exception 'bad job secret' using errcode = '28000';
  end if;

  if p_chunks is null or jsonb_array_length(p_chunks) = 0 then
    raise exception 'nothing to ingest';
  end if;

  v_n := jsonb_array_length(p_chunks);

  -- The same ceiling reasoning as calendar imports: a document large enough to
  -- fill the free tier should be refused rather than discovered later.
  if v_n > 5000 then
    raise exception 'document has % chunks, which is more than the library accepts', v_n;
  end if;

  -- Replaced, not appended. Re-ingesting after an edit must not leave the old
  -- wording in the corpus beside the new — two versions of a rule is worse
  -- than one out-of-date version, because retrieval could return either.
  delete from documents where title = p_title and owner_id is null;

  insert into documents (title, kind, source, owner_id)
  values (p_title, p_kind, p_source, null)
  returning id into v_doc;

  insert into document_chunks (document_id, chunk_index, page, heading, content, embedding)
  select v_doc,
         (e ->> 'chunk_index')::integer,
         nullif(e ->> 'page', '')::integer,
         nullif(e ->> 'heading', ''),
         e ->> 'content',
         (e ->> 'embedding')::vector
    from jsonb_array_elements(p_chunks) as e
   where nullif(e ->> 'content', '') is not null;

  return v_doc;
end;
$$;

-- anon, because ingestion runs from a laptop with no user session — the same
-- reasoning as the reminder job. The secret is what authorises it.
grant execute on function public.ingest_document(text, text, text, text, jsonb) to anon, authenticated;
