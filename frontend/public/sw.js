self.addEventListener("push", (event) => {
  let data = { title: "JobRadar", body: "New jobs available", data: { url: "/" } };

  try {
    data = event.data.json();
  } catch (e) {
    // Use defaults
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: data.data,
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? "/";

  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windowClients) => {
        for (const client of windowClients) {
          if (client.url.includes(self.location.origin)) {
            client.focus();
            client.navigate(self.location.origin + "/#" + url);
            return;
          }
        }
        return clients.openWindow(self.location.origin + "/#" + url);
      })
  );
});
