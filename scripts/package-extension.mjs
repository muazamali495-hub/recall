/**
 * Packages extension/ into public/recall-extension.zip so /connect can offer a
 * one-click download.
 *
 * Run this after ANY change to the extension, otherwise students download a
 * stale copy and the symptoms look like bugs in the site.
 *
 * Run:  node scripts/package-extension.mjs
 */
import { execFileSync } from "node:child_process";
import { existsSync, rmSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "extension", "*");
const target = join(root, "public", "recall-extension.zip");

if (existsSync(target)) rmSync(target);

// PowerShell ships with Windows, which avoids adding a zip dependency for a
// script that runs a handful of times a semester.
execFileSync(
  "powershell",
  [
    "-NoProfile",
    "-Command",
    `Compress-Archive -Path '${source}' -DestinationPath '${target}' -CompressionLevel Optimal`,
  ],
  { stdio: "inherit" },
);

console.log(`Packaged extension → public/recall-extension.zip (${Math.round(statSync(target).size / 1024)} KB)`);
