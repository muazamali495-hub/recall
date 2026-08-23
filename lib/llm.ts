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

const TEXT_MODELS = (
  process.env.OPENROUTER_TEXT_MODELS ??
  ["google/gemma-4-26b-a4b-it:free", "google/gemma-4-31b-it:free", "openrouter/free"].join(",")
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
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "X-Title": "Recall",
    },
    body: JSON.stringify(body),
    signal,
  });

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
  if (/^s*(user|response)s+safetys*:/i.test(text)) {
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
            errors.push(`${model}: ${err.message}`);
            outstanding -= 1;
            if (outstanding === 0 && !settled) {
              reject(new Error(`Every free model was busy or refused. (${errors[0] ?? "unknown"})`));
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

  return race(apiKey, TEXT_MODELS.slice(0, 3), (model) => ({
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

  // Three, not two: free pools 429 constantly, and text requests are small
  // enough that the extra concurrent call costs nothing meaningful.
  return race(apiKey, TEXT_MODELS.slice(0, 3), (model) => ({
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

  return race(apiKey, models.slice(0, 2), (model) => ({
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
