self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  const data = event.data?.json() ?? {};
  const detailUrl = data.url ?? "/";
  const options = {
    body: data.body ?? "챙겨야 할 집안일이 있어요.",
    tag: data.choreId ? `home-butler-${data.choreId}` : "home-butler-push",
    renotify: true,
    data: {
      url: detailUrl,
      choreId: data.choreId,
      clientId: data.clientId,
    },
    actions: data.choreId ? [
      { action: "complete", title: "완료했어" },
      { action: "snooze", title: "내일 알려줘" },
      { action: "reschedule", title: "미룰게" },
    ] : [],
  };
  event.waitUntil(self.registration.showNotification(data.title ?? "🏠 우리집 집사", options));
});

async function openOrFocus(targetUrl) {
  const windowClients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  const appClient = windowClients.find((client) => client.url.startsWith(self.location.origin));
  if (appClient) {
    await appClient.navigate(targetUrl.href);
    await appClient.focus();
    return;
  }
  await self.clients.openWindow(targetUrl.href);
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const { action } = event;
  const notificationData = event.notification.data ?? {};
  const targetUrl = new URL(notificationData.url ?? "/", self.location.origin);

  event.waitUntil((async () => {
    if (action === "reschedule") {
      targetUrl.searchParams.set("reschedule", "1");
      await openOrFocus(targetUrl);
      return;
    }

    if (action === "complete" || action === "snooze") {
      try {
        const response = await fetch(`/api/chores/${encodeURIComponent(notificationData.choreId)}/actions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clientId: notificationData.clientId, action }),
        });
        if (!response.ok) throw new Error("알림 액션 처리 실패");
        const result = await response.json();
        const windowClients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
        for (const client of windowClients) {
          client.postMessage({ type: "PUSH_CHORE_UPDATED", chore: result.chore, action });
        }
        return;
      } catch {
        targetUrl.searchParams.set("pushActionError", action);
        await openOrFocus(targetUrl);
        return;
      }
    }

    await openOrFocus(targetUrl);
  })());
});
