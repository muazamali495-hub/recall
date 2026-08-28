// Where Recall lives. Point this at localhost while developing.
export const RECALL_ORIGIN = "https://recall-kohl-mu.vercel.app";

// How often to check Slate. Chrome only fires alarms while the browser runs,
// so this is "about every 6 hours that you're using your computer".
export const SYNC_PERIOD_MINUTES = 360;

// How often to ask Recall whether a reminder is due. Chrome enforces a
// 1-minute floor on alarms. 5 keeps a 30-minute warning from arriving late.
export const REMINDER_PERIOD_MINUTES = 5;

// The only host a calendar link may point at.
//
// This lives here rather than in background.js because it is now enforced, not
// merely referenced: the extension fetches whatever URL it is handed, from
// inside a logged-in Slate page, and posts the response body to Recall. With
// only a "starts with https://" check that made it a general-purpose fetcher
// for anything a caller could name — including addresses on the student's own
// home network, which a server-side check could never have reached.
//
// A real calendar link is always Moodle's export endpoint on this host, so
// there is nothing legitimate to lose by requiring it.
export const SLATE_ORIGIN = "https://slate.uol.edu.pk";

/** True only for a calendar link on Slate itself. */
export function isSlateCalendarUrl(raw) {
  let url;
  try {
    url = new URL(String(raw).trim());
  } catch {
    return false;
  }

  return url.protocol === "https:" && url.origin === SLATE_ORIGIN;
}
