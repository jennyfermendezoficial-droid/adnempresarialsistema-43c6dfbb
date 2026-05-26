/* ADN Empresarial Service Worker
 * Minimal SW for installability + foreground notifications.
 * No precaching, no navigation interception (to avoid stale shells in Lovable preview).
 */
self.addEventListener("install", (e) => {
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(self.clients.claim());
});

// Pass-through fetch (no caching, no navigateFallback)
self.addEventListener("fetch", () => {});

// Listen to messages from the page to show notifications even when in background tab.
self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type === "SHOW_NOTIFICATION") {
    const { title, body, tag, url } = data.payload || {};
    self.registration.showNotification(title || "ADN Empresarial", {
      body: body || "",
      tag: tag || "adn",
      icon: "/icon-512.png",
      badge: "/icon-512.png",
      data: { url: url || "/inicio" },
      vibrate: [120, 60, 120],
    });
  }
});

// Web Push handler (works when VAPID server-side push is configured).
self.addEventListener("push", (event) => {
  let payload = { title: "ADN Empresarial", body: "Tienes una nueva notificación", url: "/inicio" };
  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch (e) {
    if (event.data) payload.body = event.data.text();
  }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      tag: payload.tag || "adn-push",
      icon: "/icon-512.png",
      badge: "/icon-512.png",
      data: { url: payload.url || "/inicio" },
      vibrate: [120, 60, 120],
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/inicio";
  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const c of allClients) {
        try {
          await c.focus();
          c.postMessage({ type: "NAVIGATE", url });
          return;
        } catch (e) {
          // ignore
        }
      }
      await self.clients.openWindow(url);
    })()
  );
});