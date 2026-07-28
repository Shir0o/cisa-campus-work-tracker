// Service Worker for Web Push Notifications & Background Notification handling
self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  if (!event.data) return;

  try {
    const data = event.data.json();
    const title = data.title || "CISA Campus Work Tracker";
    const options = {
      body: data.message || data.body || "",
      icon: "/logo.svg",
      badge: "/logo.svg",
      data: {
        link: data.link || "/",
        targetId: data.targetId,
      },
    };

    event.waitUntil(self.registration.showNotification(title, options));
  } catch (err) {
    console.error("Error showing push notification in service worker:", err);
  }
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const link = event.notification.data?.link || "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.origin) && "focus" in client) {
          client.focus();
          if (client.navigate) {
            client.navigate(link);
          }
          return;
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(link);
      }
    }),
  );
});
