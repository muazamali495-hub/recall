/**
 * Who is allowed to sign in.
 *
 * Recall is for University of Lahore students, so a Google account from any
 * other domain is rejected. The check is on the DOMAIN, not the shape of the
 * name in front of it: student IDs vary in length (70146316 is eight digits,
 * older or transfer IDs may differ), and locking people out over a digit count
 * would be a support problem with no security benefit.
 *
 * Override with NEXT_PUBLIC_ALLOWED_EMAIL_DOMAINS (comma-separated) — for
 * example to add `uol.edu.pk` for staff, or another university later.
 */
export const ALLOWED_DOMAINS = (
  process.env.NEXT_PUBLIC_ALLOWED_EMAIL_DOMAINS ?? "student.uol.edu.pk"
)
  .split(",")
  .map((d) => d.trim().toLowerCase())
  .filter(Boolean);

/** The domain Google's account picker is asked to prefer. */
export const PRIMARY_DOMAIN = ALLOWED_DOMAINS[0] ?? "student.uol.edu.pk";

export function isAllowedEmail(email: string | null | undefined): boolean {
  if (!email) return false;

  const at = email.lastIndexOf("@");
  if (at < 0) return false;

  const domain = email.slice(at + 1).toLowerCase();

  // Exact match only. Suffix matching would let `notstudent.uol.edu.pk`
  // and `student.uol.edu.pk.evil.com` through.
  return ALLOWED_DOMAINS.includes(domain);
}

/** Shown to someone who signed in with the wrong account. */
export function wrongDomainMessage(): string {
  const list = ALLOWED_DOMAINS.map((d) => `@${d}`).join(" or ");
  return `Recall is only for University of Lahore students. Sign in with your ${list} account.`;
}
