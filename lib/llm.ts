/**
 * Shared model call for Recall's AI features.
 *
 * Free model pools are shared with everyone else on the free tier, so latency
 * swings wildly — the same request can take 2 seconds or 50 depending on who
 * else is queued. Rather than wait on one pool, we fire at two at once and
 * take whichever answers first. A 429 ("Provider returned error") means that
 * pool is busy, not that the account is out of quota.
 */
const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

/**
 * How long one model gets before we give up on it.
 *
 * Without this a stalled pool holds the race open until Vercel kills the whole
 * request at maxDuration, so the student waits the full 60 seconds and then
 * gets an error — even when a fast model failed early and could have said so.
 * Cutting a straggler loose lets the honest "everything is busy" message
 * arrive while it is still useful.
 */
const CALL_TIMEOUT_MS = 40_000;

/**
 * Measured against the real study-planner prompt (scripts/check-text-models.mjs),
 * ordered by how quickly they returned usable JSON.
 *
 * The previous chain was two gemma pools plus openrouter/free. All three timed
 * out past 75 seconds on every run of that test — which is exactly what the
 * planner felt like to use: a long wait ending in "every free model was busy".
 * Neither gemma pool has answered a single test since, so they are gone rather
 * than demoted.
 *
 * Free capacity moves fast enough that this list is a starting bet, not a
 * fact: minimax-m3 returned a clean plan in 12s and a 402 three minutes later.
 * That is why callChat/callModel race the whole list instead of walking it.
 */
const TEXT_MODELS = (
  process.env.OPENROUTER_TEXT_MODELS ??
  [
    "minimax/minimax-m2.7:free",
    "nvidia/nemotron-3-super-120b-a12b:free",
    "minimax/minimax-m3:free",
    "z-ai/glm-5.2:free",
    "openrouter/free",
  ].join(",")
)
  .split(",")
  .map((m) => m.trim())
  .filter(Boolean);

export class LlmNotConfigured extends Error {
  constructor() {
    super("AI features aren't set up. Add OPENROUTER_API_KEY to .env.local.");
  }
}

type Body = Record<string, unknown>;

async function callOne(apiKey: string, body: Body, signal: AbortSignal): Promise<string> {
  // Two ways to stop: a winner was found, or this pool is taking too long.
  const timeout = AbortSignal.timeout(CALL_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "X-Title": "Recall",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.any([signal, timeout]),
    });
  } catch (err) {
    // Distinguish "we stopped it because someone else won" from "this pool
    // never answered", so the failure summary names the real problem.
    if (timeout.aborted) throw new Error(`no response in ${CALL_TIMEOUT_MS / 1000}s`);
    throw err;
  }

  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    const message = detail?.error?.message ?? `HTTP ${res.status}`;

    // A rejected key fails identically everywhere, so make it unmistakable.
    if (res.status === 401 || res.status === 403) {
      throw new Error(
        "AUTH: Your OpenRouter key was rejected. Check OPENROUTER_API_KEY, and that free models are enabled at openrouter.ai/settings/privacy.",
      );
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

/**
 * Races the given models and resolves with the first usable answer.
 *
 * The losers are aborted as soon as a winner appears, so we don't keep
 * burning free-tier requests on work nobody is waiting for.
 */
async function race(apiKey: string, models: string[], makeBody: (model: string) => Body) {
  const controller = new AbortController();
  const errors: string[] = [];

  try {
    return await new Promise<string>((resolve, reject) => {
      let settled = false;
      let outstanding = models.length;

      for (const model of models) {
        callOne(apiKey, makeBody(model), controller.signal)
          .then((text) => {
            if (settled) return;
            settled = true;
            resolve(text);
          })
          .catch((err: Error) => {
            if (err.message.startsWith("AUTH:")) {
              settled = true;
              reject(new Error(err.message.slice(5).trim()));
              return;
            }
            errors.push(`${model.replace(/:free$/, "")} — ${err.message}`);
            outstanding -= 1;
            if (outstanding === 0 && !settled) {
              // Naming several: the first failure is usually the fastest one,
              // which is a 429 from a pool that was never going to be the one
              // that answered. On its own it made every outage look identical.
              reject(
                new Error(
                  `Every free AI model is busy right now. Try again in a minute.\n\n${errors
                    .slice(0, 4)
                    .join("\n")}`,
                ),
              );
            }
          });
      }
    });
  } finally {
    controller.abort();
  }
}

/** Plain text prompt → model reply. */
export async function callModel(prompt: string, maxTokens = 2500): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new LlmNotConfigured();

  // The whole list, not the first few. Free pools fail independently and
  // unpredictably — on one test run three of five were 429 within the same
  // second — so the only reliable way to get an answer is to ask everyone and
  // take the first one home. The losers are aborted the moment a winner lands.
  return race(apiKey, TEXT_MODELS, (model) => ({
    model,
    messages: [{ role: "user", content: prompt }],
    max_tokens: maxTokens,
  }));
}

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

/** Multi-turn conversation → model reply. Used by Ask Recall. */
export async function callChat(messages: ChatMessage[], maxTokens = 1800): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new LlmNotConfigured();

  // Same reasoning as callModel: race the lot. Text requests are small, so the
  // extra concurrent calls cost nothing meaningful and buy availability.
  return race(apiKey, TEXT_MODELS, (model) => ({
    model,
    messages,
    max_tokens: maxTokens,
  }));
}

/** Prompt plus images → model reply. Used by the timetable reader. */
export async function callVisionModel(
  prompt: string,
  images: string[],
  models: string[],
  maxTokens = 4000,
): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new LlmNotConfigured();

  // Three, not two. Free vision pools 429 constantly — losing two of them at
  // once left the feature dead, which is exactly what happened in production.
  return race(apiKey, models.slice(0, 3), (model) => ({
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
  }));
}
