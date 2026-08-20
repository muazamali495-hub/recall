import { createHash, randomBytes } from "node:crypto";

/**
 * Device tokens identify an installed extension.
 *
 * We store only the SHA-256 hash, never the token itself — so a leak of the
 * database can't be used to sync as someone else. The token is high-entropy
 * random (not a human password), so a plain fast hash is the right choice
 * here; bcrypt/argon2 exist to slow down guessing of low-entropy secrets.
 */
export function generateDeviceToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashDeviceToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Reads "Authorization: Bearer <token>". */
export function bearerFrom(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header?.toLowerCase().startsWith("bearer ")) return null;
  const token = header.slice(7).trim();
  return token.length ? token : null;
}

/** The extension calls these routes from chrome-extension://, so CORS is required. */
export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Max-Age": "86400",
};
