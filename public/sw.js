/**
 * Service worker for Recall's reminders.
 *
 * This runs even when no Recall tab is open, which is what lets a push reach
 * a phone's lock screen.
 */

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
    data: { url: payload.url || "/dashboard" },
    vibrate: [80, 40, 80],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = event.notification.data?.url || "/dashboard";

  // Focus an existing Recall tab rather than piling up new ones.
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes(target) && "focus" in client) return client.focus();
      }
      return self.clients.openWindow(target);
    }),
  );
});
