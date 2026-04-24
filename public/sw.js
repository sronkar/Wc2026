self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "WC2026", body: event.data.text() };
  }

  event.waitUntil(
    self.registration.showNotification(payload.title ?? "WC2026 Predictions", {
      body: payload.body ?? "",
      // Generated dynamically by Next.js from src/app/icon.tsx (192×192 PNG)
      icon: "/icon",
      badge: "/icon",
      tag: payload.tag ?? "wc2026",
      data: { url: payload.url ?? "/" },
      requireInteraction: false,
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? "/";
  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && "focus" in client) {
            client.navigate(url);
            return client.focus();
          }
        }
        return clients.openWindow(url);
      })
  );
});
