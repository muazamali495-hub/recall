/**
 * Loads the extension's modules the way Chrome would and checks nothing is
 * missing.
 *
 * This exists because moving a helper between files left background.js calling
 * a function that had gone with it — an error that only appears when a student
 * actually syncs, which is the worst possible time to find out. A service
 * worker that throws on load is silently dead: no error surfaces anywhere in
 * the app.
 *
 * Run:  node scripts/test-extension.mjs
 */
import { readFileSync, readdirSync } from "node:fs";
import { pathToFileURL } from "node:url";

let failures = 0;

function report(label, ok, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
}

// ---- Every import resolves, and every export it asks for exists ----
const files = readdirSync("extension").filter((f) => f.endsWith(".js"));

for (const file of files) {
  const source = readFileSync(`extension/${file}`, "utf8");

  for (const match of source.matchAll(/import\s+\{([^}]+)\}\s+from\s+"(\.[^"]+)"/g)) {
    const wanted = match[1].split(",").map((n) => n.trim()).filter(Boolean);
    const target = match[2].replace(/^\.\//, "");

    if (!files.includes(target)) {
      report(`${file} imports ${target}`, false, "file does not exist");
      continue;
    }

    const targetSource = readFileSync(`extension/${target}`, "utf8");
    const missing = wanted.filter(
      (name) => !new RegExp(`export\\s+(const|let|function|async function)\\s+${name}\\b`).test(targetSource),
    );

    report(
      `${file} imports { ${wanted.join(", ")} } from ${target}`,
      missing.length === 0,
      missing.length ? `not exported: ${missing.join(", ")}` : "",
    );
  }
}

// ---- No call to a function that exists nowhere ----
// Catches exactly the mistake above: a helper moved out, its callers left
// behind. Parameter names count as declared — sendResponse and resolve are
// perfectly real, they just arrive as arguments.
const background = readFileSync("extension/background.js", "utf8");

function parameterNames(source) {
  const names = new Set();

  const signatures = [
    ...[...source.matchAll(/function\s*\w*\s*\(([^)]*)\)/g)].map((m) => m[1]),
    ...[...source.matchAll(/\(([^)]*)\)\s*=>/g)].map((m) => m[1]),
    ...[...source.matchAll(/(?:^|[^\w.])(\w+)\s*=>/g)].map((m) => m[1]),
    ...[...source.matchAll(/catch\s*\((\w+)\)/g)].map((m) => m[1]),
  ];

  for (const list of signatures) {
    for (const raw of list.split(",")) {
      // Parens included: the arrow regex can capture a leading "(" from a
      // nested call like new Promise((resolve) => ...).
      const name = raw.trim().split(/[=:\s]/)[0].replace(/[{}[\]().]/g, "");
      if (name) names.add(name);
    }
  }
  return names;
}

const declared = new Set([
  ...[...background.matchAll(/(?:async\s+)?function\s+(\w+)/g)].map((m) => m[1]),
  ...[...background.matchAll(/import\s+\{([^}]+)\}/g)].flatMap((m) =>
    m[1].split(",").map((n) => n.trim()),
  ),
  ...[...background.matchAll(/(?:const|let)\s+(\w+)\s*=/g)].map((m) => m[1]),
  ...parameterNames(background),
]);

const KEYWORDS = new Set([
  "if", "for", "while", "switch", "catch", "return", "typeof", "await", "async",
  "function", "new", "delete", "void", "yield", "of", "in",
]);

const BUILTINS = new Set([
  "fetch", "setTimeout", "setInterval", "clearInterval", "clearTimeout",
]);

const called = new Set(
  [...background.matchAll(/(?<![.\w])([a-z][A-Za-z0-9_]*)\s*\(/g)].map((m) => m[1]),
);

const undefinedCalls = [...called].filter(
  (name) => !declared.has(name) && !BUILTINS.has(name) && !KEYWORDS.has(name),
);

report(
  "every function background.js calls is defined or imported",
  undefinedCalls.length === 0,
  undefinedCalls.length ? undefinedCalls.join(", ") : "",
);

// ---- The modules actually evaluate ----
// A service worker that throws while loading is silently dead — no error
// surfaces anywhere in the app. The globals below are stubbed just far enough
// for top-level registration to run.
function everything() {
  return new Proxy(function () {}, {
    get: (_t, key) => (key === "then" ? undefined : everything()),
    apply: () => everything(),
    set: () => true,
  });
}

globalThis.chrome = everything();
globalThis.window = globalThis;
globalThis.document = everything();
globalThis.location = { origin: "https://recall.test", href: "https://recall.test/" };
globalThis.addEventListener = () => {};
globalThis.postMessage = () => {};

for (const file of files) {
  try {
    await import(pathToFileURL(`extension/${file}`).href);
    report(`${file} evaluates`, true);
  } catch (err) {
    report(`${file} evaluates`, false, err.message.slice(0, 100));
  }
}

// ---- The manifest lists what the code relies on ----
const manifest = JSON.parse(readFileSync("extension/manifest.json", "utf8"));
const permissions = manifest.permissions ?? [];

for (const api of ["alarms", "storage", "scripting", "idle"]) {
  const used = new RegExp(`chrome\\.${api}\\.`).test(background);
  if (used) report(`manifest declares "${api}" (code uses it)`, permissions.includes(api));
}

report(
  "background.js is listed as the service worker",
  manifest.background?.service_worker === "background.js",
);

console.log(failures === 0 ? "\nAll passed.\n" : `\n${failures} FAILED.\n`);
process.exitCode = failures === 0 ? 0 : 1;
