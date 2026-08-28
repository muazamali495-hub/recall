import Link from "next/link";
import { connection } from "next/server";

/**
 * A 404 that renders per request, not at build time.
 *
 * This exists for a security reason before a cosmetic one. The CSP carries a
 * per-request nonce, and a page prerendered at build time has no request to
 * take a nonce from — so Next's default 404 shipped with thirteen scripts,
 * none of them nonced, every one blocked. The page still showed its text
 * (that part is server HTML) but had no JavaScript at all, and filled the
 * console with violations.
 *
 * `connection()` waits for an actual request, which opts this page into
 * dynamic rendering and lets the nonce reach it.
 */
export default async function NotFound() {
  await connection();

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center px-6 py-24 text-center">
      <p className="mb-2.5 text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-mint">
        404
      </p>
      <h1 className="mb-3 text-[2rem] font-bold leading-none tracking-tight">
        That page isn&apos;t here.
      </h1>
      <p className="mb-8 text-sm text-muted">
        The link may be old, or it may never have existed. Your deadlines are
        where you left them.
      </p>

      <Link
        href="/dashboard"
        className="rounded-xl bg-mint px-5 py-2.5 text-sm font-semibold text-[#04231d] transition hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
      >
        Back to today
      </Link>
    </main>
  );
}
