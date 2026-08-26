/**
 * Packages the extension into public/recall-extension.zip so /connect can
 * offer a one-click download.
 *
 * Run this after ANY change to the extension, or students download a stale
 * copy and the symptoms look like bugs in the site.
 *
 * Run:  node scripts/package-extension.mjs
 *
 * Why a hand-rolled zip writer rather than a tool:
 *   - PowerShell's Compress-Archive writes backslash path separators. Windows
 *     tolerates that; macOS and Linux extract a single flat file literally
 *     named "recall-extension\manifest.json", which is useless.
 *   - GNU tar (what Git Bash provides here) cannot write zip at all, and given
 *     only -a it silently produced a POSIX tar archive under a .zip name — a
 *     download that would have failed for every student.
 * Fifty lines of spec is cheaper than a dependency or a broken download.
 */
import { deflateRawSync } from "node:zlib";
import { readdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = join(root, "extension");
const target = join(root, "public", "recall-extension.zip");

// Everything lives under one folder so "Extract All" always yields a directory
// Chrome's "Load unpacked" can be pointed at.
const PREFIX = "recall-extension/";

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

// Walk subdirectories too: the icons live in extension/icons/, and a
// top-level-only listing shipped a zip Chrome refused to load.
function walk(dir, prefix = "") {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    const rel = prefix ? `${prefix}/${name}` : name;
    return statSync(full).isDirectory() ? walk(full, rel) : [rel];
  });
}

const files = walk(sourceDir);

const locals = [];
const central = [];
let offset = 0;

for (const name of files) {
  const raw = readFileSync(join(sourceDir, ...name.split("/")));
  const compressed = deflateRawSync(raw);
  const nameBytes = Buffer.from(PREFIX + name, "utf8"); // forward slash, always
  const sum = crc32(raw);

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0); // local file header
  local.writeUInt16LE(20, 4); // version needed
  local.writeUInt16LE(0, 6); // flags
  local.writeUInt16LE(8, 8); // method: deflate
  local.writeUInt16LE(0, 10); // modified time
  local.writeUInt16LE(0x21, 12); // modified date — fixed, so builds are stable
  local.writeUInt32LE(sum, 14);
  local.writeUInt32LE(compressed.length, 18);
  local.writeUInt32LE(raw.length, 22);
  local.writeUInt16LE(nameBytes.length, 26);
  local.writeUInt16LE(0, 28); // extra field length

  locals.push(local, nameBytes, compressed);

  const dir = Buffer.alloc(46);
  dir.writeUInt32LE(0x02014b50, 0); // central directory header
  dir.writeUInt16LE(20, 4); // version made by
  dir.writeUInt16LE(20, 6); // version needed
  dir.writeUInt16LE(0, 8);
  dir.writeUInt16LE(8, 10);
  dir.writeUInt16LE(0, 12);
  dir.writeUInt16LE(0x21, 14);
  dir.writeUInt32LE(sum, 16);
  dir.writeUInt32LE(compressed.length, 20);
  dir.writeUInt32LE(raw.length, 24);
  dir.writeUInt16LE(nameBytes.length, 28);
  dir.writeUInt16LE(0, 30); // extra
  dir.writeUInt16LE(0, 32); // comment
  dir.writeUInt16LE(0, 34); // disk number
  dir.writeUInt16LE(0, 36); // internal attributes
  dir.writeUInt32LE(0, 38); // external attributes
  dir.writeUInt32LE(offset, 42); // offset of local header

  central.push(dir, nameBytes);
  offset += local.length + nameBytes.length + compressed.length;
}

const centralBuf = Buffer.concat(central);

const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0); // end of central directory
end.writeUInt16LE(0, 4); // this disk
end.writeUInt16LE(0, 6); // disk with central directory
end.writeUInt16LE(files.length, 8);
end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(centralBuf.length, 12);
end.writeUInt32LE(offset, 16);
end.writeUInt16LE(0, 20); // comment length

writeFileSync(target, Buffer.concat([...locals, centralBuf, end]));

console.log(
  `Packaged ${files.length} files → public/recall-extension.zip ` +
    `(${Math.round(statSync(target).size / 1024)} KB, extracts to ${PREFIX})`,
);
