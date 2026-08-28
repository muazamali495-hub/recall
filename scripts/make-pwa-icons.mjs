/**
 * Builds the home-screen icons from public/logo.png.
 *
 * The important part is that these come out **opaque**. iOS composites a
 * transparent apple-touch-icon onto black, so any softness at the edges of the
 * source shows up as a dirty grey fringe against the home screen wallpaper.
 * Flattening onto the app's own background (#0A0D15) makes the icon look
 * deliberate instead of cut out.
 *
 * iOS also applies its own squircle mask, so these are full-bleed squares with
 * no rounding baked in — pre-rounding would give a rounded corner inside a
 * rounded corner.
 *
 * Run:  node scripts/make-pwa-icons.mjs
 */
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const GROUND = "#0A0D15";
const SOURCE = "public/logo.png";

const OUTPUTS = [
  // iOS home screen. 180 is the size current iPhones ask for.
  { path: "app/apple-icon.png", size: 180, inset: 0 },
  { path: "public/icons/icon-192.png", size: 192, inset: 0 },
  { path: "public/icons/icon-512.png", size: 512, inset: 0 },
  // Android crops icons to whatever shape the launcher uses, and can cut in as
  // far as 10% on each side. The logo is scaled to the safe zone so nothing of
  // it is ever clipped.
  { path: "public/icons/maskable-512.png", size: 512, inset: 0.1 },
];

const source = await loadImage(SOURCE);

for (const { path, size, inset } of OUTPUTS) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = GROUND;
  ctx.fillRect(0, 0, size, size);

  const pad = Math.round(size * inset);
  const box = size - pad * 2;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, pad, pad, box, box);

  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, canvas.toBuffer("image/png"));

  // Prove it, rather than trusting fillRect: a single non-opaque pixel is the
  // whole bug this script exists to prevent.
  const data = ctx.getImageData(0, 0, size, size).data;
  let translucent = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i] !== 255) translucent++;

  console.log(
    `  ${path.padEnd(32)} ${String(size).padStart(3)}px  ` +
      `${translucent === 0 ? "opaque" : `${translucent} TRANSLUCENT PIXELS`}`,
  );

  if (translucent > 0) process.exitCode = 1;
}
