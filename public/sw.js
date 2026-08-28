/**
 * Service worker for Recall's reminders.
 *
 * This runs even when no Recall tab is open, which is what lets a push reach
 * a phone's lock screen.
 */

/**
 * Where a notification click is allowed to take you.
 *
 * The URL arrives inside the push payload, and only Recall's server holds the
 * VAPID private key — so today nobody else can put one there. But that is one
 * leaked key away from being an open redirect launched from a notification on
 * a lock screen, which is a far more convincing place to be phished from than
 * a link in a page. It costs four lines to not depend on that.
 *
 * Duplicated from lib/safe-next.ts rather than imported: a service worker is a
 * standalone script with no build step, so it cannot share the module.
 */
function safeTarget(raw) {
  if (typeof raw !== "string") return "/dashboard";
  if (!raw.startsWith("/")) return "/dashboard";        // absolute URLs, schemes, "@evil.com"
  if (raw.startsWith("//") || raw.includes("\\")) return "/dashboard"; // protocol-relative
  return raw;
}

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: "Recall", body: event.data ? event.data.text() : "" };
  }

  const title = payload.title || "Recall";
  const options = {
    body: payload.body || "",
    // No icon/badge files exist yet; passing a 404 path can make some
    // platforms drop the notification entirely.
    tag: payload.tag || undefined, // replaces an earlier notification for the same thing
    data: { url: safeTarget(payload.url) },
    vibrate: [80, 40, 80],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  // Re-checked on the way out as well as on the way in: the payload was
  // validated when stored, but this is the line that actually navigates.
  const target = safeTarget(event.notification.data?.url);

  // Focus an existing Recall tab rather than piling up new ones. Compared by
  // pathname rather than substring — "/ask" should not match a tab that merely
  // happens to contain those characters somewhere in its URL.
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        try {
          if (new URL(client.url).pathname === target.split("?")[0] && "focus" in client) {
            return client.focus();
          }
        } catch {
          // A client URL we cannot parse is simply not a match.
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
