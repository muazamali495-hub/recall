/**
 * Packages the extension into public/recall-extension.zip so /connect can
 * offer a one-click download.
 *
 * The zip deliberately contains a single top-level `recall-extension/` folder.
 * Zipping the files loose at the root means some tools extract them into
 * whatever directory you happen to be in, and Chrome's "Load unpacked" needs a
 * folder that holds manifest.json — so a clean containing folder removes the
 * commonest way this goes wrong.
 *
 * Run this after ANY change to the extension, or students download a stale
 * copy and the symptoms look like bugs in the site.
 *
 * Run:  node scripts/package-extension.mjs
 */
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const target = join(root, "public", "recall-extension.zip");

const staging = mkdtempSync(join(tmpdir(), "recall-ext-"));
const folder = join(staging, "recall-extension");

try {
  cpSync(join(root, "extension"), folder, { recursive: true });

  if (existsSync(target)) rmSync(target);

  // PowerShell ships with Windows, which avoids a zip dependency for a script
  // that runs a handful of times a semester.
  execFileSync(
    "powershell",
    [
      "-NoProfile",
      "-Command",
      `Compress-Archive -Path '${folder}' -DestinationPath '${target}' -CompressionLevel Optimal`,
    ],
    { stdio: "inherit" },
  );

  console.log(
    `Packaged → public/recall-extension.zip (${Math.round(statSync(target).size / 1024)} KB, extracts to recall-extension/)`,
  );
} finally {
  rmSync(staging, { recursive: true, force: true });
}
