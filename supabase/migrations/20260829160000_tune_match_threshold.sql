-- ============================================================
--  Set the similarity floor from measurement, not from a guess
--
--  0.35 was chosen before there was a corpus to measure against, and it was
--  too high: real questions phrased in a student's own words were being
--  discarded. "My phone isn't buzzing for quizzes" scored 0.275 against the
--  right section and returned nothing at all.
--
--  Measured across eight real questions and six deliberately unrelated ones:
--
--      lowest on-topic     0.275
--      highest off-topic   0.178
--
--  0.22 sits between them with room on both sides. The gap is what matters
--  more than the number — it means this model separates relevant from
--  irrelevant cleanly on this corpus, and the floor is doing real work rather
--  than being a hopeful constant.
--
--  Worth re-measuring when the corpus changes character. A regulations
--  handbook is written in very different language from a help page, and the
--  distribution will move with it.
-- ============================================================

create or replace function public.match_document_chunks(
  p_embedding vector(384),
  p_count     integer default 5,
  p_min_score real default 0.22
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
