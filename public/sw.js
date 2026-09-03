self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? JSON.parse(event.data.text()) : {};
  } catch {
    payload = { title: "FMG System", body: event.data?.text() || "You have a new update." };
  }
  event.waitUntil(self.registration.showNotification(payload.title || "FMG System", {
    body: payload.body || "You have a new update.",
    icon: "/fmg-logo-dark.png",
    badge: "/favicon.svg",
    tag: payload.tag || "fmg-system-update",
    renotify: true,
    data: { url: payload.url || "/", id: payload.id || null },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windows) {
      if (new URL(client.url).origin === self.location.origin) {
        await client.navigate(url);
        return client.focus();
      }
    }
    return self.clients.openWindow(url);
  })());
});
