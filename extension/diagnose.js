/**
 * Working out what a failed Slate fetch actually means.
 *
 * Kept apart from background.js so it can be tested without a browser: this is
 * the code that decides what the student is told to do, and telling someone to
 * log in when their calendar token has been reset wastes their afternoon.
 */

/**
 * Turns a failed Slate fetch into something worth acting on.
 *
 * A 403 here has at least three causes and each needs a different fix: the
 * student is signed out, Cloudflare is showing an interstitial, or the
 * calendar link's token has been reset. Telling everyone to "make sure you're
 * logged in" is right about a third of the time.
 */
export function explainFailure(result) {
  const body = (result.detail ?? "").toLowerCase();
  const where = (result.finalUrl ?? "").toLowerCase();

  if (result.status === 0) {
    return "Couldn't reach Slate at all. Check your internet connection, then try again.";
  }

  // Moodle bounces an expired session to the login page.
  if (where.includes("/login/") || body.includes("you are not logged in")) {
    return "You're signed out of Slate. Open Slate, log in, then try again.";
  }

  // Cloudflare's own page, not Moodle's — no amount of logging in fixes this
  // one; the browser has to complete the check first.
  if (
    body.includes("just a moment") ||
    body.includes("cf-browser-verification") ||
    body.includes("challenge-platform") ||
    body.includes("cloudflare")
  ) {
    return "Cloudflare is challenging the request. Open Slate in a tab, wait until it loads fully, then try again.";
  }

  // Moodle's wording when the calendar token no longer matches.
  if (body.includes("invalid token") || body.includes("invalidtoken")) {
    return "Slate rejected your calendar link — its token has been reset. Copy a fresh calendar link from Slate and paste it into Recall.";
  }

  if (result.status === 403) {
    return "Slate refused the request (403). Open Slate and check you're logged in. If you are, copy a fresh calendar link — the old link's token may have been reset.";
  }

  if (result.status === 404) {
    return "That calendar link no longer exists (404). Copy a fresh one from Slate.";
  }

  // Nothing on this side is wrong, so asking the student to go fetch a new
  // link would send them off to fix something that isn't broken.
  if (result.status >= 500) {
    return `Slate is having trouble right now (${result.status}). Nothing to fix on your side — Recall will try again on its own.`;
  }

  return `Slate returned ${result.status}. Copy a fresh calendar link from Slate.`;
}

/**
 * A short, pasteable summary of what actually came back.
 *
 * The advice above is a best guess from patterns we have seen. When it guesses
 * wrong the student has nothing to report but "it still says refused", and we
 * are back to speculating. This is the line that ends that: status, where the
 * request landed, and the first words of the body.
 */
export function technicalTail(result) {
  const bits = [`HTTP ${result.status ?? "?"}`];

  if (result.finalUrl) {
    try {
      bits.push(new URL(result.finalUrl).pathname);
    } catch {
      bits.push(result.finalUrl.slice(0, 60));
    }
  }

  const body = (result.detail ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (body) bits.push(`"${body.slice(0, 90)}"`);
  else if (result.error) bits.push(result.error.slice(0, 60));
  else bits.push("empty body");

  return ` [${bits.join(" · ")}]`;
}
