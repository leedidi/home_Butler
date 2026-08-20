import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import webpush from "web-push";

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);
const dataDirectory = path.join(dirname, "..", ".data");
const vapidKeysPath = path.join(dataDirectory, "vapid-keys.json");
const subscriptionsPath = path.join(dataDirectory, "push-subscriptions.json");

fs.mkdirSync(dataDirectory, { recursive: true });

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

const vapidKeys = readJson(vapidKeysPath, null) ?? webpush.generateVAPIDKeys();
if (!fs.existsSync(vapidKeysPath)) writeJson(vapidKeysPath, vapidKeys);
webpush.setVapidDetails("mailto:developer@example.com", vapidKeys.publicKey, vapidKeys.privateKey);

const app = express();
app.use(express.json());

app.get("/api/push/public-key", (_request, response) => {
  response.json({ publicKey: vapidKeys.publicKey });
});

app.post("/api/push/subscribe", (request, response) => {
  const subscription = request.body?.subscription;
  if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
    return response.status(400).json({ message: "유효한 Push 구독 정보가 아닙니다." });
  }

  const subscriptions = readJson(subscriptionsPath, []);
  const nextSubscriptions = [
    ...subscriptions.filter((item) => item.endpoint !== subscription.endpoint),
    subscription,
  ];
  writeJson(subscriptionsPath, nextSubscriptions);
  return response.status(201).json({ message: "기기가 등록되었습니다." });
});

app.post("/api/push/test", async (_request, response) => {
  const subscriptions = readJson(subscriptionsPath, []);
  if (subscriptions.length === 0) {
    return response.status(400).json({ message: "등록된 기기가 없습니다. 먼저 알림 권한을 허용하세요." });
  }

  const payload = JSON.stringify({
    title: "우리집 집사 테스트 알림",
    body: "알림 클릭과 액션 버튼을 확인해 보세요.",
    url: "/",
    id: crypto.randomUUID(),
  });
  const results = await Promise.allSettled(subscriptions.map((subscription) => webpush.sendNotification(subscription, payload)));
  const expiredEndpoints = new Set(
    results.flatMap((result, index) => result.status === "rejected" && [404, 410].includes(result.reason?.statusCode)
      ? [subscriptions[index].endpoint]
      : []),
  );
  if (expiredEndpoints.size > 0) {
    writeJson(subscriptionsPath, subscriptions.filter((subscription) => !expiredEndpoints.has(subscription.endpoint)));
  }

  const sent = results.filter((result) => result.status === "fulfilled").length;
  return response.status(sent > 0 ? 200 : 502).json({
    sent,
    message: sent > 0 ? "테스트 Push 발송 요청을 완료했습니다." : "Push 서비스가 알림을 수락하지 않았습니다.",
  });
});

app.listen(3001, () => {
  console.log("Push PoC server running at http://localhost:3001");
});
