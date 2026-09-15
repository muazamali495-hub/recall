/**
 * Shared model call for Recall's AI features.
 *
 * Every provider here is free, and every free tier has the same two
 * failure modes: a pool that is busy this second (a 429 that clears in a
 * minute) and a daily quota that is gone until midnight. OpenRouter's is the
 * tighter one — 50 free-model requests a day for the whole account, shared
 * by every Recall student. Racing four models spent four of those per upload,
 * so a dozen students could empty it before lunch and the thirteenth saw
 * "every model is busy". That is what this file is built around now:
 *
 *   Several providers, each optional. Any OpenAI-compatible free tier can be
 *   added with one key in the environment; a missing key just means that
 *   provider is skipped. Each has its own daily quota, so together they are
 *   many times what one is.
 *
 *   A staggered race, not a stampede. The first candidate starts at once and
 *   the next joins only if no answer has arrived after a few seconds. A
 *   healthy first model therefore costs one request, and a busy one still
 *   gets covered.
 *
 *   A quota that is gone is remembered. The "per-day" error names the whole
 *   provider, not one model, so its remaining candidates are skipped at once
 *   and it is not asked again until the quota resets.
 */

/** How long one model gets before we give up on it. */
const CALL_TIMEOUT_MS = 40_000;

/**
 * Vision gets longer: a timetable image is a few hundred KB and the pools
 * that can read one are slower. The page's maxDuration is 60s, and the retry
 * has to fit inside it too.
 */
const VISION_TIMEOUT_MS = 50_000;
const VISION_BUDGET_MS = 57_000;

/** How long the leading candidate gets to itself before the next one joins. */
// Overridable so the test can run the race in milliseconds.
const STAGGER_MS = Number(process.env.LLM_STAGGER_MS) || 5_000;
const VISION_STAGGER_MS = Number(process.env.LLM_STAGGER_MS) || 8_000;

export class LlmNotConfigured extends Error {
  constructor() {
    super("AI features aren't set up. Add OPENROUTER_API_KEY to .env.local.");
  }
}

type Body = Record<string, unknown>;

type Provider = {
  name: string;
  endpoint: string;
  key: string;
  text: string[];
  vision: string[];
};

type Candidate = { provider: Provider; model: string };

const list = (env: string | undefined, fallback: string[]) =>
  (env ?? fallback.join(","))
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);

/**
 * Every configured provider, in the order they should be tried.
 *
 * OpenRouter comes last on purpose: it is the one with the 50-a-day account
 * quota, so it should carry the load only when nothing with a bigger quota
 * is configured. The model ids for the others are the ones current at the
 * time of writing; each list can be overridden from the environment without
 * a deploy when a provider renames something.
 *
 * Read on every call rather than once at import, so a key added in Vercel
 * takes effect on the next request.
 */
function providers(): Provider[] {
  const env = process.env;
  const out: Provider[] = [];

  if (env.GROQ_API_KEY) {
    out.push({
      name: "groq",
      endpoint: "https://api.groq.com/openai/v1/chat/completions",
      key: env.GROQ_API_KEY,
      text: list(env.GROQ_TEXT_MODELS, ["llama-3.3-70b-versatile", "openai/gpt-oss-120b"]),
      vision: list(env.GROQ_VISION_MODELS, [
        "meta-llama/llama-4-scout-17b-16e-instruct",
        "meta-llama/llama-4-maverick-17b-128e-instruct",
      ]),
    });
  }

  if (env.GEMINI_API_KEY) {
    out.push({
      name: "gemini",
      endpoint: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
      key: env.GEMINI_API_KEY,
      text: list(env.GEMINI_TEXT_MODELS, ["gemini-2.5-flash", "gemini-2.0-flash"]),
      vision: list(env.GEMINI_VISION_MODELS, ["gemini-2.5-flash", "gemini-2.0-flash"]),
    });
  }

  if (env.CEREBRAS_API_KEY) {
    out.push({
      name: "cerebras",
      endpoint: "https://api.cerebras.ai/v1/chat/completions",
      key: env.CEREBRAS_API_KEY,
      text: list(env.CEREBRAS_TEXT_MODELS, ["llama-3.3-70b", "gpt-oss-120b"]),
      vision: list(env.CEREBRAS_VISION_MODELS, []),
    });
  }

  if (env.MISTRAL_API_KEY) {
    out.push({
      name: "mistral",
      endpoint: "https://api.mistral.ai/v1/chat/completions",
      key: env.MISTRAL_API_KEY,
      text: list(env.MISTRAL_TEXT_MODELS, ["mistral-small-latest"]),
      vision: list(env.MISTRAL_VISION_MODELS, ["mistral-small-latest", "pixtral-12b-2409"]),
    });
  }

  if (env.OPENROUTER_API_KEY) {
    out.push({
      name: "openrouter",
      endpoint: "https://openrouter.ai/api/v1/chat/completions",
      key: env.OPENROUTER_API_KEY,
      // Measured against the real study-planner prompt
      // (scripts/check-text-models.mjs), fastest usable JSON first. Free
      // capacity moves: minimax-m3 gave a clean plan one day and was paid-only
      // the next. The list is a starting bet; the stagger covers the rest.
      text: list(env.OPENROUTER_TEXT_MODELS, [
        "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
        "minimax/minimax-m2.7:free",
        "nvidia/nemotron-3-super-120b-a12b:free",
        "z-ai/glm-5.2:free",
        "openrouter/free",
      ]),
      // Re-tested 16 Sep 2026 against every free pool that accepts images
      // (scripts/check-vision.mjs) with a rendered UOL-style grid. nemotron-
      // omni read it correctly in 5s with reasoning off (20s with it on). The
      // gemma pools answer when not 429, which is often. nex-n2.5-pro took 90s
      // and returned nothing; ling, dots and the safety pool returned empty.
      vision: list(env.OPENROUTER_MODELS, [
        "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
        "google/gemma-4-31b-it:free",
        "google/gemma-4-26b-a4b-it:free",
        "openrouter/free",
      ]),
    });
  }

  return out;
}

/**
 * Providers whose daily quota is spent, and when to try them again.
 *
 * Module-level, so it lasts as long as the server instance does — on Vercel
 * that is one warm function, which is exactly the scope that matters: the
 * next student's request a minute later, not next week's.
 */
const exhaustedUntil = new Map<string, number>();

function nextUtcMidnight() {
  const d = new Date();
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
}

/** The daily-quota error, as distinct from a pool that is merely busy. */
const isQuotaError = (message: string) =>
  /per-day|daily|quota/i.test(message) && /limit|exceed/i.test(message);

async function callOne(
  candidate: Candidate,
  body: Body,
  signal: AbortSignal,
  timeoutMs: number,
): Promise<string> {
  const { provider } = candidate;

  // Two ways to stop: a winner was found, or this pool is taking too long.
  const timeout = AbortSignal.timeout(timeoutMs);

  let res: Response;
  try {
    res = await fetch(provider.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${provider.key}`,
        "Content-Type": "application/json",
        "X-Title": "Recall",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.any([signal, timeout]),
    });
  } catch (err) {
    // Distinguish "we stopped it because someone else won" from "this pool
    // never answered", so the failure summary names the real problem.
    if (timeout.aborted) throw new Error(`no response in ${Math.round(timeoutMs / 1000)}s`);
    throw err;
  }

  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    const message: string = detail?.error?.message ?? detail?.message ?? `HTTP ${res.status}`;

    // A rejected key fails identically everywhere, so make it unmistakable.
    if (res.status === 401 || res.status === 403) {
      throw new Error(
        `AUTH: The ${provider.name} key was rejected. Check ${provider.name.toUpperCase()}_API_KEY.`,
      );
    }

    if (res.status === 429 && isQuotaError(message)) {
      exhaustedUntil.set(provider.name, nextUtcMidnight());
      throw new Error(`QUOTA: ${message}`);
    }

    throw new Error(message);
  }

  const json = await res.json();
  const text = json?.choices?.[0]?.message?.content;

  if (typeof text !== "string" || !text.trim()) throw new Error("Empty reply.");

  // openrouter/free routes to whatever pool is idle, and that pool includes
  // content-safety classifiers. Their output ("User Safety: safe") is a
  // verdict, not an answer — reject it so the race falls to a real model.
  if (/^\s*(user|response)\s+safety\s*:/i.test(text)) {
    throw new Error("Routed to a classifier, not a chat model.");
  }

  return text;
}

/** Every (provider, model) pair worth asking, quota-exhausted ones left out. */
function candidates(kind: "text" | "vision"): Candidate[] {
  const now = Date.now();
  const out: Candidate[] = [];

  for (const provider of providers()) {
    const until = exhaustedUntil.get(provider.name);
    if (until && until > now) continue;
    if (until) exhaustedUntil.delete(provider.name);

    for (const model of provider[kind]) out.push({ provider, model });
  }

  return out;
}

const QUOTA_MESSAGE =
  "Recall's free AI quota for today is used up. It resets at midnight UTC (5 am in Pakistan).";

/**
 * Asks the candidates in a staggered race and resolves with the first
 * usable answer.
 *
 * Candidate 0 starts now; candidate n starts after n × stagger, unless an
 * answer or the end of the list arrives first. A quota error from a provider
 * drops its remaining candidates on the spot. The losers are aborted as soon
 * as there is a winner, so nothing keeps burning quota for an answer nobody
 * is waiting for.
 */
async function race(
  cands: Candidate[],
  makeBody: (model: string) => Body,
  timeoutMs: number,
  staggerMs: number,
): Promise<string> {
  if (cands.length === 0) throw new Error(QUOTA_MESSAGE);

  const controller = new AbortController();
  const errors: string[] = [];
  const timers: ReturnType<typeof setTimeout>[] = [];

  try {
    return await new Promise<string>((resolve, reject) => {
      let settled = false;
      let started = 0;
      let finished = 0;
      const skipped = new Set<string>();

      const finish = () => {
        if (settled) return;
        if (started - finished > 0) return; // something is still running
        if (started < cands.length) return; // more are still due to start
        settled = true;

        // Naming several: the first failure is usually the fastest one — a
        // 429 from a pool that was never going to be the one that answered.
        // On its own it made every outage look identical.
        const allQuota = errors.every((e) => e.includes("quota"));
        const head = allQuota ? QUOTA_MESSAGE : "Every free AI model is busy right now. Try again in a minute.";
        reject(new Error(`${head}\n\n${errors.slice(0, 4).join("\n")}`));
      };

      const launch = (i: number) => {
        if (settled || i >= cands.length) return;
        const c = cands[i];
        const name = `${c.provider.name}/${c.model.replace(/:free$/, "")}`;
        started += 1;

        if (skipped.has(c.provider.name)) {
          finished += 1;
          errors.push(`${name} — skipped, quota used`);
          launch(started);
          finish();
          return;
        }

        callOne(c, makeBody(c.model), controller.signal, timeoutMs)
          .then((text) => {
            if (settled) return;
            settled = true;
            resolve(text);
          })
          .catch((err: Error) => {
            finished += 1;
            if (settled) return;

            if (err.message.startsWith("AUTH:")) {
              settled = true;
              reject(new Error(err.message.slice(5).trim()));
              return;
            }

            if (err.message.startsWith("QUOTA:")) skipped.add(c.provider.name);
            errors.push(`${name} — ${err.message.replace(/^QUOTA: /, "daily quota: ")}`);

            // A failure is the cue to bring the next candidate in early
            // rather than wait out the stagger.
            launch(started);
            finish();
          });

        // The next one joins if this one has not answered in time.
        if (i + 1 < cands.length) {
          timers.push(setTimeout(() => launch(started), staggerMs));
        }
      };

      launch(0);
    });
  } finally {
    controller.abort();
    for (const t of timers) clearTimeout(t);
  }
}

function assertConfigured() {
  if (providers().length === 0) throw new LlmNotConfigured();
}

/**
 * A "reasoning" pool thinks out loud before it answers, and on a timetable
 * that thinking took 20 seconds against 5 without it — for a task where the
 * reasoning added nothing. Only sent to models that would otherwise reason;
 * the rest get an unchanged request.
 */
const noReasoning = (model: string): Body =>
  /reasoning|thinking/i.test(model) ? { reasoning: { enabled: false } } : {};

/** Plain text prompt → model reply. */
export async function callModel(prompt: string, maxTokens = 2500): Promise<string> {
  assertConfigured();

  return race(
    candidates("text"),
    (model) => ({
      model,
      messages: [{ role: "user", content: prompt }],
      max_tokens: maxTokens,
      ...noReasoning(model),
    }),
    CALL_TIMEOUT_MS,
    STAGGER_MS,
  );
}

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

/** Multi-turn conversation → model reply. Used by Ask Recall. */
export async function callChat(messages: ChatMessage[], maxTokens = 1800): Promise<string> {
  assertConfigured();

  return race(
    candidates("text"),
    (model) => ({ model, messages, max_tokens: maxTokens, ...noReasoning(model) }),
    CALL_TIMEOUT_MS,
    STAGGER_MS,
  );
}

/** Prompt plus images → model reply. Used by the timetable reader. */
export async function callVisionModel(
  prompt: string,
  images: string[],
  maxTokens = 4000,
): Promise<string> {
  assertConfigured();

  const makeBody = (model: string): Body => ({
    model,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          ...images.map((data) => ({
            type: "image_url",
            image_url: { url: `data:image/png;base64,${data}` },
          })),
        ],
      },
    ],
    max_tokens: maxTokens,
    ...noReasoning(model),
  });

  // A second go: a 429 is "this pool is busy this second", so when the whole
  // race fails fast there is usually time left to ask again, and the second
  // answer is often different. Only when the budget allows — a retry that
  // runs past maxDuration is a worse error than the first one.
  const started = Date.now();
  try {
    return await race(candidates("vision"), makeBody, VISION_TIMEOUT_MS, VISION_STAGGER_MS);
  } catch (err) {
    const elapsed = Date.now() - started;
    const remaining = VISION_BUDGET_MS - elapsed - 2_000;
    const message = (err as Error).message;
    if (remaining < 12_000 || message.includes("key was rejected") || message.includes("quota")) throw err;

    await new Promise((r) => setTimeout(r, 2_000));
    return race(candidates("vision"), makeBody, remaining, VISION_STAGGER_MS);
  }
}

/**
 * What a student should see when a call fails, and what the log should.
 *
 * The race's error carries the per-model detail after a blank line — that
 * is for the log, where it says which pool did what. A student saw it once
 * ("minimax-m3 — This model is unavailable for free…") and it read as the
 * app falling apart. They get the first line; Vercel's log gets the rest.
 */
export function studentFacing(err: unknown, fallback: string, where: string): string {
  const message = err instanceof Error ? err.message : "";
  const [head, ...detail] = message.split("\n\n");
  if (detail.length) console.warn(`[${where}] ${head}\n${detail.join("\n")}`);
  return head.trim() || fallback;
}
