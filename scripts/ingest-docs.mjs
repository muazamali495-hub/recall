/**
 * Loads documents into the searchable library.
 *
 * Runs on a laptop, not on the server: embedding a whole handbook takes
 * minutes and only has to happen when the document changes. The result is
 * vectors in Postgres, which is all the app needs at question time.
 *
 * Chunking is the part that decides whether retrieval works at all. Split too
 * small and a rule loses the sentence that qualifies it; too large and the
 * match is diluted by surrounding text. Splitting on headings and keeping
 * paragraphs whole preserves the unit a regulation is actually written in.
 *
 * Run:  node --env-file=.env.local scripts/ingest-docs.mjs <file.md|file.txt> [--kind policy] [--title "..."]
 *       node --env-file=.env.local scripts/ingest-docs.mjs --list
 */
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { pipeline, env } from "@xenova/transformers";

env.allowLocalModels = false;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// The library has no insert policy, on purpose — students will be told to
// trust what it says about university rules. This project also keeps the
// service-role key empty by design, so ingestion proves itself with the same
// shared secret the reminder job uses and gets exactly one capability:
// replace one document.
const secret = process.env.CRON_SECRET;

if (!url || !key || !secret) {
  console.log("Missing NEXT_PUBLIC_SUPABASE_URL / ANON_KEY / CRON_SECRET in .env.local");
  process.exit(1);
}

const db = createClient(url, key);
const args = process.argv.slice(2);

function flag(name, fallback = null) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}

// ---------------------------------------------------------------- listing

if (args.includes("--list")) {
  const { data } = await db
    .from("documents")
    .select("id, title, kind, created_at, document_chunks(count)")
    .order("created_at", { ascending: false });

  if (!data?.length) {
    console.log("\n  The library is empty.\n");
  } else {
    console.log("\n  Documents in the library:\n");
    for (const d of data) {
      const chunks = d.document_chunks?.[0]?.count ?? 0;
      console.log(`  ${d.title}`);
      console.log(`     ${d.kind} · ${chunks} chunks · ${d.id}`);
    }
    console.log();
  }
  process.exit(0);
}

const file = args.find((a) => !a.startsWith("--") && args[args.indexOf(a) - 1]?.startsWith("--") !== true);

if (!file) {
  console.log("\nUsage: node --env-file=.env.local scripts/ingest-docs.mjs <file> [--kind policy] [--title \"...\"]\n");
  process.exit(1);
}

// ---------------------------------------------------------------- chunking

/**
 * Splits on headings first, then packs paragraphs up to a size budget.
 *
 * The heading travels with every chunk taken from under it. Without that, a
 * passage reading "students must maintain 75%" loses the fact that it sits
 * under "Attendance" — and a retrieved passage that cannot say what it is
 * about is one a model will misapply.
 */
function chunk(text, maxChars = 1100) {
  const lines = text.split(/\r?\n/);
  const sections = [];
  let heading = null;
  let buffer = [];

  const flush = () => {
    const body = buffer.join("\n").trim();
    if (body) sections.push({ heading, body });
    buffer = [];
  };

  for (const line of lines) {
    const h = line.match(/^\s{0,3}#{1,4}\s+(.*)$/);
    if (h) {
      flush();
      heading = h[1].trim();
      continue;
    }
    buffer.push(line);
  }
  flush();

  const out = [];

  for (const section of sections) {
    const paragraphs = section.body.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
    let current = [];
    let size = 0;

    const emit = () => {
      if (!current.length) return;
      out.push({ heading: section.heading, content: current.join("\n\n") });
      current = [];
      size = 0;
    };

    for (const p of paragraphs) {
      // A paragraph longer than the budget is kept whole rather than cut
      // mid-sentence; losing the end of a rule is worse than a long chunk.
      if (size > 0 && size + p.length > maxChars) emit();
      current.push(p);
      size += p.length + 2;
    }
    emit();
  }

  return out.filter((c) => c.content.length > 40);
}

// ---------------------------------------------------------------- ingest

const raw = readFileSync(file, "utf8");
const title = flag("title", basename(file).replace(/\.[^.]+$/, "").replace(/[-_]/g, " "));
const kind = flag("kind", "reference");

const chunks = chunk(raw);

if (chunks.length === 0) {
  console.log("\n  Nothing to ingest — the file produced no usable chunks.\n");
  process.exit(1);
}

console.log(`\n  ${title}`);
console.log(`  ${kind} · ${raw.length} chars · ${chunks.length} chunks\n`);

console.log("  loading the embedding model...");
const embed = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");

let done = 0;
const rows = [];

for (const [i, c] of chunks.entries()) {
  // The heading is embedded with the body so a passage carries its own
  // context into the comparison.
  const text = c.heading ? `${c.heading}\n\n${c.content}` : c.content;
  const out = await embed(text, { pooling: "mean", normalize: true });

  rows.push({
    chunk_index: i,
    heading: c.heading,
    content: c.content,
    embedding: JSON.stringify(Array.from(out.data)),
  });

  done++;
  if (done % 10 === 0 || done === chunks.length) {
    process.stdout.write(`\r  embedded ${done}/${chunks.length}`);
  }
}

console.log();

// One call: the document and every chunk land together, so a failure part-way
// through cannot leave a half-ingested document that retrieval would happily
// quote as if it were whole.
const { error: insertError } = await db.rpc("ingest_document", {
  p_secret: secret,
  p_title: title,
  p_kind: kind,
  p_source: basename(file),
  p_chunks: rows,
});

if (insertError) {
  console.log(`  FAILED to store: ${insertError.message}\n`);
  process.exit(1);
}

console.log(`  stored ${rows.length} chunks\n`);
