/**
 * Getting JSON back out of a free model.
 *
 * Paid models honour a JSON schema. Free ones do not, and they fail in three
 * predictable ways: they wrap the answer in ```json fences, they narrate
 * before it ("We need to create a study plan for..."), and — most often —
 * they run into the token limit and stop mid-object.
 *
 * The first two are easy. The third used to throw the whole reply away, which
 * is a poor trade: a plan with five of its six blocks is worth far more to a
 * student than "Could not build a plan from that. Try again." So a truncated
 * object is closed off and whatever survived is kept.
 */
export function parseJsonLoosely<T>(text: string): T | null {
  const withoutFences = text.replace(/```(?:json)?/gi, "").trim();

  const start = withoutFences.indexOf("{");
  if (start < 0) return null;

  const body = withoutFences.slice(start);

  for (const candidate of repairCandidates(body)) {
    try {
      return JSON.parse(candidate) as T;
    } catch {
      // Cut too greedily. Try the next, shorter one.
    }
  }

  return null;
}

/**
 * Ways the reply might be closed off, best first.
 *
 * Rather than reason about exactly where the model stopped — which needs a
 * full parser to get right — this proposes cut points and lets JSON.parse be
 * the judge. Cheap, and it can't produce anything invalid.
 *
 * Order matters. A `}` or `]` always ends a complete value, so cutting there
 * drops the half-written entry. A quote is tried last because it might be
 * closing a key rather than a value (`..."end"` with nothing after it), which
 * parses as nothing useful.
 */
function* repairCandidates(body: string): Generator<string> {
  // The whole thing, on the chance nothing is wrong with it.
  const lastBrace = body.lastIndexOf("}");
  if (lastBrace > 0) yield body.slice(0, lastBrace + 1);

  // Truncation damage is always at the end, so a bounded backwards scan finds
  // it. Without the cap, a long reply that is broken near the start would try
  // thousands of parses.
  const LIMIT = 60;

  for (const kind of ["container", "comma", "quote"] as const) {
    let tried = 0;

    for (let i = body.length - 1; i >= 0 && tried < LIMIT; i--) {
      const ch = body[i];

      const matches =
        kind === "container" ? ch === "}" || ch === "]" : kind === "comma" ? ch === "," : ch === '"';

      if (!matches) continue;
      tried++;

      // A comma is the separator *before* the incomplete entry, so cut in
      // front of it. The others are part of the value we are keeping.
      const prefix = body.slice(0, kind === "comma" ? i : i + 1);
      const closers = closersFor(prefix);

      if (closers && closers.length > 0) yield prefix + closers.join("");
    }
  }
}

/**
 * The brackets `prefix` left open, in the order they must be closed.
 * Returns null when the cut lands inside a string, which is never a valid
 * place to stop.
 */
function closersFor(prefix: string): string[] | null {
  const stack: string[] = [];
  let inString = false;
  let escaped = false;

  for (const ch of prefix) {
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (ch === "{") stack.push("}");
    else if (ch === "[") stack.push("]");
    else if (ch === "}" || ch === "]") stack.pop();
  }

  if (inString) return null;

  return stack.reverse();
}
