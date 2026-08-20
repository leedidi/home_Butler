self.addEventListener("push", (event) => {
  const data = event.data?.json() ?? {};
  const options = {
    body: data.body ?? "테스트 알림입니다.",
    tag: "home-butler-push-poc",
    data: { url: data.url ?? "/push-poc.html" },
    actions: [
      { action: "complete", title: "완료했어" },
      { action: "snooze", title: "내일 알려줘" },
    ],
  };
  event.waitUntil(self.registration.showNotification(data.title ?? "우리집 집사", options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const action = event.action;
  const targetUrl = new URL(event.notification.data?.url ?? "/", self.location.origin);
  if (action) targetUrl.searchParams.set("pushAction", action);

  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const matchingClient = clients.find((client) => client.url.startsWith(self.location.origin));
    if (matchingClient) {
      matchingClient.postMessage({ type: "PUSH_ACTION", action });
      await matchingClient.focus();
      return;
    }
    await self.clients.openWindow(targetUrl.href);
  })());
});
