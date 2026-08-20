const PUSH_CLIENT_ID_KEY = "home-butler:push-client-id:v1";

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((character) => character.charCodeAt(0)));
}

export function getPushClientId(storage = window.localStorage) {
  const existing = storage.getItem(PUSH_CLIENT_ID_KEY);
  if (existing) return existing;
  const clientId = globalThis.crypto.randomUUID();
  storage.setItem(PUSH_CLIENT_ID_KEY, clientId);
  return clientId;
}

export function getClientTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Seoul";
}

export async function registerPushServiceWorker() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    throw new Error("이 브라우저는 Web Push를 지원하지 않습니다.");
  }
  await navigator.serviceWorker.register("/service-worker.js");
  return navigator.serviceWorker.ready;
}

async function saveSubscription(subscription) {
  const subscribeResponse = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientId: getPushClientId(), subscription }),
  });
  if (!subscribeResponse.ok) throw new Error("기기 알림 정보를 저장하지 못했습니다.");
}

export async function restorePushRegistration(chores) {
  if (!("Notification" in window) || Notification.permission !== "granted") return false;
  try {
    const registration = await registerPushServiceWorker();
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return false;
    await saveSubscription(subscription);
    await syncChoresToPushServer(chores);
    return true;
  } catch {
    return false;
  }
}

export async function getPushEnabled() {
  if (!("Notification" in window) || Notification.permission !== "granted") return false;
  try {
    const registration = await registerPushServiceWorker();
    return Boolean(await registration.pushManager.getSubscription());
  } catch {
    return false;
  }
}

export async function syncChoresToPushServer(chores) {
  const response = await fetch("/api/chores/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      clientId: getPushClientId(),
      chores,
      timeZone: getClientTimeZone(),
    }),
  });
  if (!response.ok) throw new Error("알림 서버에 집안일을 저장하지 못했습니다.");
  return response.json();
}

export async function loadChoresFromPushServer() {
  const response = await fetch(`/api/chores/${encodeURIComponent(getPushClientId())}`);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error("알림 서버의 집안일을 불러오지 못했습니다.");
  const result = await response.json();
  return result.chores;
}

export async function enablePushNotifications(chores) {
  if (!("Notification" in window)) throw new Error("이 브라우저는 알림을 지원하지 않습니다.");
  const registration = await registerPushServiceWorker();
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("알림 권한이 허용되지 않았습니다.");

  const keyResponse = await fetch("/api/push/public-key");
  if (!keyResponse.ok) throw new Error("알림 서버 공개 키를 가져오지 못했습니다.");
  const { publicKey } = await keyResponse.json();
  const existingSubscription = await registration.pushManager.getSubscription();
  const subscription = existingSubscription ?? await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  });

  await saveSubscription(subscription);
  await syncChoresToPushServer(chores);
  return subscription;
}
