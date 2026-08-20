import "./style.css";

const status = {
  permission: document.querySelector("#permission-status"),
  worker: document.querySelector("#worker-status"),
  subscription: document.querySelector("#subscription-status"),
  result: document.querySelector("#result-message"),
};

const subscribeButton = document.querySelector("#subscribe-button");
const sendButton = document.querySelector("#send-button");
let registration;

function showResult(message, isError = false) {
  status.result.textContent = message;
  status.result.classList.toggle("error", isError);
}

function updatePermissionStatus() {
  if (!("Notification" in window)) {
    status.permission.textContent = "이 브라우저는 알림을 지원하지 않음";
    return false;
  }

  const labels = {
    default: "아직 선택하지 않음",
    granted: "허용됨",
    denied: "차단됨",
  };
  status.permission.textContent = labels[Notification.permission];
  return Notification.permission === "granted";
}

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((character) => character.charCodeAt(0)));
}

async function updateSubscriptionStatus() {
  if (!registration) return;
  const subscription = await registration.pushManager.getSubscription();
  const subscribed = Boolean(subscription);
  status.subscription.textContent = subscribed ? "이 기기에 등록됨" : "등록되지 않음";
  sendButton.disabled = !subscribed;
  return subscription;
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    status.worker.textContent = "이 브라우저는 Web Push를 지원하지 않음";
    showResult("이 브라우저에서는 Web Push 테스트를 할 수 없습니다.", true);
    return;
  }

  registration = await navigator.serviceWorker.register("/service-worker.js");
  await navigator.serviceWorker.ready;
  status.worker.textContent = "등록 완료";
  await updateSubscriptionStatus();
}

async function subscribeToPush() {
  try {
    if (!registration) throw new Error("Service Worker가 준비되지 않았습니다.");

    const permission = await Notification.requestPermission();
    updatePermissionStatus();
    if (permission !== "granted") {
      throw new Error("알림 권한이 허용되지 않았습니다. 브라우저 설정에서 알림을 허용한 뒤 다시 시도하세요.");
    }

    const response = await fetch("/api/push/public-key");
    if (!response.ok) throw new Error("푸시 공개 키를 가져오지 못했습니다.");
    const { publicKey } = await response.json();

    const existingSubscription = await registration.pushManager.getSubscription();
    const subscription = existingSubscription ?? await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });

    const saveResponse = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subscription }),
    });
    if (!saveResponse.ok) throw new Error("기기 등록 정보를 저장하지 못했습니다.");

    await updateSubscriptionStatus();
    showResult("기기 등록이 완료되었습니다. 이제 테스트 Push를 보낼 수 있습니다.");
  } catch (error) {
    showResult(error.message, true);
  }
}

async function sendTestPush() {
  try {
    sendButton.disabled = true;
    const response = await fetch("/api/push/test", { method: "POST" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message ?? "테스트 Push 발송에 실패했습니다.");
    showResult(`테스트 Push 발송 요청을 완료했습니다. (${result.sent}개 기기)`);
  } catch (error) {
    showResult(error.message, true);
  } finally {
    await updateSubscriptionStatus();
  }
}

navigator.serviceWorker?.addEventListener("message", (event) => {
  if (event.data?.type !== "PUSH_ACTION") return;
  const messages = {
    complete: "‘완료했어’ 액션을 받았습니다. 실제 일정은 변경하지 않았습니다.",
    snooze: "‘내일 알려줘’ 액션을 받았습니다. 실제 일정은 변경하지 않았습니다.",
  };
  showResult(messages[event.data.action] ?? "알림 클릭을 확인했습니다.");
});

const openedFromAction = new URLSearchParams(window.location.search).get("pushAction");
if (openedFromAction) {
  const messages = {
    complete: "‘완료했어’ 액션으로 웹앱을 열었습니다. 실제 일정은 변경하지 않았습니다.",
    snooze: "‘내일 알려줘’ 액션으로 웹앱을 열었습니다. 실제 일정은 변경하지 않았습니다.",
  };
  showResult(messages[openedFromAction] ?? "알림을 통해 웹앱을 열었습니다.");
}

subscribeButton.addEventListener("click", subscribeToPush);
sendButton.addEventListener("click", sendTestPush);

updatePermissionStatus();
registerServiceWorker().catch((error) => {
  status.worker.textContent = "등록 실패";
  showResult(`Service Worker 등록에 실패했습니다: ${error.message}`, true);
});
