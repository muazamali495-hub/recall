/**
 * Points Recall at a new domain.
 *
 * The origin is baked into three places that cannot read environment
 * variables — a static extension config, a Chrome manifest, and Kotlin source.
 * Changing them by hand is how you end up with an extension that syncs to the
 * old address for weeks without anyone noticing.
 *
 * Run:  node scripts/set-domain.mjs https://recall.app
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const next = process.argv[2];

if (!next || !next.startsWith("https://")) {
  console.log("Usage: node scripts/set-domain.mjs https://your-domain.app");
  process.exit(1);
}

const origin = next.replace(/\/+$/, "");
const host = new URL(origin).host;

// Whatever the extension currently points at is the origin we are replacing.
const configPath = join(root, "extension", "config.js");
const current = readFileSync(configPath, "utf8").match(/RECALL_ORIGIN = "([^"]+)"/)?.[1];

if (!current) {
  console.log("Could not read the current origin from extension/config.js");
  process.exit(1);
}

if (current === origin) {
  console.log(`Already pointing at ${origin}`);
  process.exit(0);
}

const currentHost = new URL(current).host;
const edits = [];

function edit(path, fn) {
  const before = readFileSync(path, "utf8");
  const after = fn(before);
  if (before !== after) {
    writeFileSync(path, after);
    edits.push(path.replace(root, "").replace(/^[\\/]/, ""));
  }
}

edit(configPath, (s) => s.replace(/RECALL_ORIGIN = "[^"]+"/, `RECALL_ORIGIN = "${origin}"`));

edit(join(root, "extension", "manifest.json"), (s) =>
  s.replaceAll(currentHost, host),
);

edit(join(root, "android", "app", "src", "main", "java", "pk", "edu", "uol", "recall", "Config.kt"), (s) =>
  s.replace(/RECALL_ORIGIN = "[^"]+"/, `RECALL_ORIGIN = "${origin}"`),
);

console.log(`${current}  →  ${origin}\n`);
console.log(edits.length ? "Updated:" : "Nothing changed.");
for (const f of edits) console.log(`  ${f}`);

console.log(`
Still to do by hand — each one fails silently if skipped:

  1. Vercel      add ${host} to the project and set it as production
  2. Registrar   add the DNS records Vercel shows you
  3. Supabase    Auth → URL Configuration
                   Site URL      ${origin}
                   Redirect URLs ${origin}/**   (keep localhost and recall://auth)
  4. GitHub      gh secret set RECALL_URL --repo muazamali495-hub/recall --body "${origin}"
  5. Repackage   npm run package:extension
  6. Rebuild     the Android APK, and reload the extension in Chrome

Anyone already running the old extension must reload it — it will keep
syncing to ${currentHost} until they do.
`);
