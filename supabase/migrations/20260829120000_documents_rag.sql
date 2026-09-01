-- ============================================================
--  A searchable document library
--
--  Ask Recall already answers from the student's own data — deadlines,
--  classes, courses — because that data is small, structured and queryable
--  with a WHERE clause. Semantic search would add cost and imprecision there
--  for nothing.
--
--  Documents are the opposite case, and the one where retrieval earns its
--  place: a regulations handbook is hundreds of pages, a student does not
--  know which paragraph applies, and no WHERE clause can find "the bit about
--  missing classes" when the document says "minimum attendance requirement
--  for eligibility to sit terminal examinations".
--
--  384 dimensions because that is what all-MiniLM-L6-v2 produces. It runs
--  locally with no API and no bill, which is the whole reason this is
--  affordable.
-- ============================================================

create extension if not exists vector;

create table if not exists public.documents (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  -- What kind of thing this is, so an answer can say "per the Academic
  -- Regulations" rather than "per document 4".
  kind        text not null default 'reference'
              check (kind in ('policy', 'handbook', 'notes', 'past_paper', 'help', 'reference')),
  source      text,
  -- Null means the whole university can read it: regulations are not personal
  -- data. A student's own lecture notes belong to them alone.
  owner_id    uuid references auth.users on delete cascade,
  created_at  timestamptz not null default now()
);

create table if not exists public.document_chunks (
  id           bigserial primary key,
  document_id  uuid not null references public.documents on delete cascade,
  chunk_index  integer not null,
  -- Where in the source this came from, so an answer can be checked rather
  -- than believed. An uncited answer about attendance rules is worse than no
  -- answer, because a student would act on it.
  page         integer,
  heading      text,
  content      text not null,
  embedding    vector(384),

  unique (document_id, chunk_index)
);

-- IVFFlat needs training data to build a useful index and is pointless on a
-- near-empty table. With a few thousand chunks an exact scan is already
-- milliseconds; the index is worth adding when the corpus makes it worth it.
create index if not exists document_chunks_doc_idx on public.document_chunks (document_id);

alter table public.documents enable row level security;
alter table public.document_chunks enable row level security;

-- Shared documents are readable by any signed-in student; private ones only
-- by their owner.
create policy "read shared or own documents"
  on public.documents for select
  using (owner_id is null or auth.uid() = owner_id);

create policy "read chunks of readable documents"
  on public.document_chunks for select
  using (
    exists (
      select 1 from documents d
       where d.id = document_chunks.document_id
         and (d.owner_id is null or d.owner_id = auth.uid())
    )
  );

-- Deliberately no insert policy. Ingestion runs offline through the function
-- below, so nothing can push unvetted content into a corpus that students
-- will be told to trust.


/**
 * Finds the passages most likely to answer a question.
 *
 * Scoped to what the caller may actually read, so the search itself cannot
 * become a way to see somebody else's notes — the retrieval step is exactly
 * where that leak would hide, since the text never appears on screen.
 *
 * The similarity floor matters more than the count. Without it the top five
 * chunks of an unrelated corpus come back for any question at all, and a model
 * handed irrelevant context will cheerfully use it.
 */
create or replace function public.match_document_chunks(
  p_embedding vector(384),
  p_count     integer default 5,
  p_min_score real default 0.35
)
returns table (
  chunk_id    bigint,
  document_id uuid,
  title       text,
  kind        text,
  page        integer,
  heading     text,
  content     text,
  score       real
)
language sql
stable
security invoker
set search_path = public
as $$
  select c.id, d.id, d.title, d.kind, c.page, c.heading, c.content,
         (1 - (c.embedding <=> p_embedding))::real as score
    from document_chunks c
    join documents d on d.id = c.document_id
   where c.embedding is not null
     and (d.owner_id is null or d.owner_id = auth.uid())
     and (1 - (c.embedding <=> p_embedding)) >= p_min_score
   order by c.embedding <=> p_embedding
   limit greatest(1, least(p_count, 20));
$$;

grant execute on function public.match_document_chunks(vector, integer, real) to authenticated;
