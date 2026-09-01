import { createClient } from "@/lib/supabase/server";

export type Passage = {
  title: string;
  kind: string;
  page: number | null;
  heading: string | null;
  content: string;
  score: number;
};

/**
 * Finds passages that might answer a question.
 *
 * Returns nothing rather than something weak. A model handed loosely-related
 * context will use it — that is the failure mode of retrieval augmentation,
 * and it is worse than no retrieval at all, because the answer arrives wearing
 * a citation. The floor lives in the database function so it cannot be
 * forgotten by a caller.
 */
export async function findPassages(question: string, count = 5): Promise<Passage[]> {
  const trimmed = question.trim();
  if (trimmed.length < 8) return [];

  try {
    const { embed } = await import("@/lib/embed");
    const vector = await embed(trimmed);

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("match_document_chunks", {
      p_embedding: JSON.stringify(vector),
      p_count: count,
    });

    if (error || !Array.isArray(data)) return [];

    return data as Passage[];
  } catch {
    // Retrieval is an enhancement. If the model fails to load or the search
    // errors, Ask Recall should still answer from the student's own data
    // rather than fail outright.
    return [];
  }
}

/** How a source is named back to the student, so an answer can be checked. */
export function cite(p: Passage): string {
  const where = p.page ? `p.${p.page}` : p.heading;
  return where ? `${p.title}, ${where}` : p.title;
}

/**
 * Builds the section of the prompt that carries retrieved text.
 *
 * The instructions are strict on purpose. Recall's other AI features give
 * advice, where being vague is merely unhelpful. These documents describe
 * rules — how much attendance is required, when enrolment closes — and a
 * confident wrong answer about a rule is something a student will act on.
 * So: answer only from what is quoted, name the source, and say plainly when
 * the documents do not cover it.
 */
export function passagesPrompt(passages: Passage[]): string {
  if (passages.length === 0) return "";

  const quoted = passages
    .map((p, i) => `[${i + 1}] ${cite(p)}\n${p.content.trim()}`)
    .join("\n\n");

  return `
Reference material from the university's own documents:

"""
${quoted}
"""

Rules for using it:
- If the answer is in the material above, give it and name the source, like "per Academic Regulations, p.14".
- Quote the rule closely rather than paraphrasing it into something looser. These are regulations; the exact wording is the point.
- If the material does not answer the question, say so plainly and answer from what you know, making clear which part is which.
- Never infer a rule that is not written above. A confident wrong answer about attendance or deadlines is one a student will act on.`;
}
