/**
 * The staggered multi-provider race, with fetch stubbed.
 *
 * What is pinned down here is quota arithmetic, not model quality: a healthy
 * first model must cost exactly one request, a daily-quota error must take
 * its whole provider out of the race, and the losers must be aborted the
 * moment there is a winner. Each of these was the difference between a
 * dozen students a day and fifty.
 *
 * Run:  npm run test:llm
 */
process.env.LLM_STAGGER_MS = "30";
process.env.GROQ_API_KEY = "g";
process.env.OPENROUTER_API_KEY = "o";
process.env.GROQ_TEXT_MODELS = "groq-a,groq-b";
process.env.OPENROUTER_TEXT_MODELS = "or-a,or-b";
process.env.GROQ_VISION_MODELS = "groq-v";
process.env.OPENROUTER_MODELS = "or-v-reasoning,or-v2";

const { callModel, callVisionModel } = await import("../lib/llm.ts");

let failures = 0;
const check = (label: string, ok: boolean, detail = "") => {
  if (!ok) failures++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
};

type Plan = Record<string, { status?: number; body?: unknown; delay?: number; text?: string }>;
let calls: Array<{ model: string; body: Record<string, unknown>; aborted: boolean }> = [];

/** Each model answers per the plan; anything not planned is a fast 429. */
function stub(plan: Plan) {
  calls = [];
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    const body = JSON.parse(init.body as string);
    const entry = { model: body.model as string, body, aborted: false };
    calls.push(entry);
    const p = plan[body.model] ?? { status: 429, body: { error: { message: "Provider returned error" } } };

    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(resolve, p.delay ?? 1);
      init.signal?.addEventListener("abort", () => {
        clearTimeout(t);
        entry.aborted = true;
        reject(new DOMException("aborted", "AbortError"));
      });
    });

    const status = p.status ?? 200;
    const json = p.body ?? { choices: [{ message: { content: p.text ?? "answer" } }] };
    return new Response(JSON.stringify(json), { status, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
}

// ---- A healthy first model costs one request ----
stub({ "groq-a": { text: "hi" } });
check("healthy first model answers", (await callModel("x")) === "hi");
check("…and only one request was made", calls.length === 1, `${calls.length} calls`);

// ---- A slow leader gets company, the winner wins, the loser is aborted ----
stub({ "groq-a": { delay: 200, text: "slow" }, "groq-b": { delay: 5, text: "fast" } });
check("second joins after the stagger and wins", (await callModel("x")) === "fast");
check("the slow leader was aborted", calls[0].aborted === true);
check("nothing beyond the two was asked", calls.length === 2, `${calls.length} calls`);

// ---- A fast failure brings the next in immediately ----
stub({ "groq-b": { text: "b" } });
const t0 = Date.now();
check("falls through a 429 to the next model", (await callModel("x")) === "b");
check("…without waiting out the stagger", Date.now() - t0 < 25, `${Date.now() - t0}ms`);

// ---- Auth failure stops everything ----
stub({ "groq-a": { status: 401, body: { error: { message: "bad key" } } } });
const auth = await callModel("x").catch((e: Error) => e.message);
check("a rejected key is named, not hidden", /groq key was rejected/.test(String(auth)), String(auth));

// ---- reasoning is switched off only for reasoning models ----
stub({ "or-v-reasoning": { text: "{}" } });
process.env.GROQ_VISION_MODELS = "";
await callVisionModel("p", ["aW1n"]);
const vcall = calls.find((c) => c.model === "or-v-reasoning");
check("reasoning disabled for a reasoning pool", JSON.stringify(vcall?.body.reasoning) === '{"enabled":false}');
stub({ "or-v2": { text: "{}" } });
process.env.OPENROUTER_MODELS = "or-v2";
await callVisionModel("p", ["aW1n"]);
check("…and untouched for a plain one", calls[0].body.reasoning === undefined);
process.env.GROQ_VISION_MODELS = "groq-v";
process.env.OPENROUTER_MODELS = "or-v-reasoning,or-v2";

// ---- Every candidate busy → honest message listing them ----
stub({});
const busy = await callModel("x").catch((e: Error) => e.message);
check("all busy → 'busy' message", /busy right now/.test(String(busy)));
check("…every candidate was tried", calls.length === 4, `${calls.length} calls`);

// ---- A daily-quota 429 takes its whole provider out (last: it sticks) ----
const quota = { status: 429, body: { error: { message: "Rate limit exceeded: free-models-per-day. Add 10 credits to unlock 1000" } } };
stub({ "groq-a": quota, "or-a": { text: "or" } });
check("quota on groq → openrouter answers", (await callModel("x")) === "or");
check("groq-b was never asked", !calls.some((c) => c.model === "groq-b"), calls.map((c) => c.model).join(","));

stub({ "or-a": { text: "or again" } });
await callModel("x");
check("groq stays out on the next call", !calls.some((c) => c.model.startsWith("groq")), calls.map((c) => c.model).join(","));

stub({ "or-a": quota, "or-b": quota });
const gone = await callModel("x").catch((e: Error) => e.message);
check("every provider out → quota message with reset time", /quota for today.*5 am/.test(String(gone)), String(gone).split("\n")[0]);

const again = await callModel("x").catch((e: Error) => e.message);
check("…and no request is even attempted after that", calls.length === 1 && /quota for today/.test(String(again)), `${calls.length} calls`);

console.log(failures === 0 ? "\nAll passed.\n" : `\n${failures} FAILED.\n`);
process.exitCode = failures === 0 ? 0 : 1;
