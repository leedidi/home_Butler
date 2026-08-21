import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import webpush from "web-push";
import { completeChore, createChore, snoozeReminder } from "../src/domain/chore.js";
import {
  buildChorePushPayload,
  getReminderKind,
  getZonedDateTime,
} from "./pushSchedule.js";

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);
const dataDirectory = path.join(dirname, "..", ".data");
const vapidKeysPath = path.join(dataDirectory, "vapid-keys.json");
const subscriptionsPath = path.join(dataDirectory, "push-subscriptions.json");
const choresPath = path.join(dataDirectory, "push-chores.json");
const deliveriesPath = path.join(dataDirectory, "push-deliveries.json");
const port = Number(process.env.PUSH_SERVER_PORT ?? 3001);
const checkIntervalMs = Number(process.env.PUSH_CHECK_INTERVAL_MS ?? 60_000);

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

const storedVapidKeys = readJson(vapidKeysPath, null);
const vapidKeys = process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY
  ? { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY }
  : storedVapidKeys ?? webpush.generateVAPIDKeys();
if (!storedVapidKeys && !process.env.VAPID_PUBLIC_KEY) writeJson(vapidKeysPath, vapidKeys);
webpush.setVapidDetails(
  process.env.VAPID_SUBJECT ?? "mailto:developer@example.com",
  vapidKeys.publicKey,
  vapidKeys.privateKey,
);

function getSubscriptionRecords() {
  return readJson(subscriptionsPath, []).map((item) => (
    item.subscription ? item : { clientId: "legacy-poc", subscription: item }
  ));
}

function getChoreRecords() {
  return readJson(choresPath, []);
}

function findChoreRecord(clientId) {
  return getChoreRecords().find((record) => record.clientId === clientId);
}

function saveChoreRecord(clientId, chores, timeZone = "Asia/Seoul") {
  const records = getChoreRecords();
  const nextRecord = {
    clientId,
    chores: chores.map((chore) => createChore(chore)),
    timeZone,
    updatedAt: new Date().toISOString(),
  };
  writeJson(choresPath, [...records.filter((record) => record.clientId !== clientId), nextRecord]);
  return nextRecord;
}

function updateStoredChore(clientId, updatedChore) {
  const records = getChoreRecords();
  const record = records.find((item) => item.clientId === clientId);
  if (!record) return null;
  const nextRecord = {
    ...record,
    chores: record.chores.map((chore) => chore.id === updatedChore.id ? updatedChore : chore),
    updatedAt: new Date().toISOString(),
  };
  writeJson(choresPath, [...records.filter((item) => item.clientId !== clientId), nextRecord]);
  return updatedChore;
}

async function sendPayloadToClient(clientId, payload) {
  const subscriptionRecords = getSubscriptionRecords().filter((record) => record.clientId === clientId);
  if (subscriptionRecords.length === 0) return { sent: 0, message: "등록된 기기가 없습니다." };

  const results = await Promise.allSettled(subscriptionRecords.map((record) => (
    webpush.sendNotification(record.subscription, JSON.stringify(payload), {
      TTL: 86_400,
      urgency: "high",
      topic: `chore-${crypto.createHash("sha256").update(payload.choreId).digest("hex").slice(0, 20)}`,
    })
  )));
  const expiredEndpoints = new Set(results.flatMap((result, index) => (
    result.status === "rejected" && [404, 410].includes(result.reason?.statusCode)
      ? [subscriptionRecords[index].subscription.endpoint]
      : []
  )));
  if (expiredEndpoints.size > 0) {
    writeJson(subscriptionsPath, getSubscriptionRecords().filter((record) => (
      !expiredEndpoints.has(record.subscription.endpoint)
    )));
  }

  const sent = results.filter((result) => result.status === "fulfilled").length;
  return { sent, message: sent > 0 ? "Push 발송 요청을 완료했습니다." : "Push 서비스가 알림을 수락하지 않았습니다." };
}

let schedulerRunning = false;
export async function processScheduledPushes(now = new Date()) {
  if (schedulerRunning) return { sent: 0 };
  schedulerRunning = true;
  let sent = 0;
  try {
    const deliveries = readJson(deliveriesPath, {});
    for (const record of getChoreRecords()) {
      const zoned = getZonedDateTime(now, record.timeZone ?? "Asia/Seoul");
      if (zoned.hour < 19) continue;

      for (const chore of record.chores) {
        const kind = getReminderKind(chore, zoned.dateOnly);
        if (!kind) continue;
        const deliveryKey = `${record.clientId}:${chore.id}:${zoned.dateOnly}:${kind}`;
        if (deliveries[deliveryKey]) continue;
        const result = await sendPayloadToClient(
          record.clientId,
          buildChorePushPayload(chore, kind, record.clientId),
        );
        if (result.sent > 0) {
          deliveries[deliveryKey] = new Date().toISOString();
          sent += result.sent;
        }
      }
    }
    writeJson(deliveriesPath, deliveries);
    return { sent };
  } finally {
    schedulerRunning = false;
  }
}

const app = express();
app.use(express.json({ limit: "256kb" }));

app.get("/api/push/public-key", (_request, response) => {
  response.json({ publicKey: vapidKeys.publicKey });
});

app.post("/api/push/subscribe", (request, response) => {
  const { clientId, subscription } = request.body ?? {};
  if (typeof clientId !== "string" || !subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
    return response.status(400).json({ message: "유효한 기기 및 Push 구독 정보가 아닙니다." });
  }

  const records = getSubscriptionRecords();
  const nextRecord = { clientId, subscription, createdAt: new Date().toISOString() };
  writeJson(subscriptionsPath, [
    ...records.filter((item) => item.subscription.endpoint !== subscription.endpoint),
    nextRecord,
  ]);
  return response.status(201).json({ message: "기기가 등록되었습니다." });
});

app.post("/api/chores/sync", (request, response) => {
  try {
    const { clientId, chores, timeZone } = request.body ?? {};
    if (typeof clientId !== "string" || !Array.isArray(chores)) {
      return response.status(400).json({ message: "유효한 집안일 동기화 정보가 아닙니다." });
    }
    const record = saveChoreRecord(clientId, chores, timeZone);
    return response.json({ chores: record.chores, updatedAt: record.updatedAt });
  } catch (error) {
    return response.status(400).json({ message: error.message });
  }
});

function handleLoadChores(request, response) {
  const clientId = request.params.clientId ?? request.query.clientId;
  const record = findChoreRecord(clientId);
  if (!record) return response.status(404).json({ message: "동기화된 집안일이 없습니다." });
  return response.json({ chores: record.chores, updatedAt: record.updatedAt });
}

app.get("/api/chores/get", handleLoadChores);
app.get("/api/chores/:clientId", handleLoadChores);

function handleChoreAction(request, response) {
  const { clientId, action, choreId: bodyChoreId } = request.body ?? {};
  const choreId = bodyChoreId ?? request.params.choreId;
  const record = findChoreRecord(clientId);
  const chore = record?.chores.find((item) => item.id === choreId);
  if (!record || !chore) return response.status(404).json({ message: "집안일을 찾을 수 없습니다." });
  if (!["complete", "snooze"].includes(action)) return response.status(400).json({ message: "지원하지 않는 알림 액션입니다." });

  const today = getZonedDateTime(new Date(), record.timeZone ?? "Asia/Seoul").dateOnly;
  const updatedChore = action === "complete"
    ? completeChore(chore, today)
    : snoozeReminder(chore, today);
  updateStoredChore(clientId, updatedChore);
  return response.json({ chore: updatedChore });
}

app.post("/api/chores/:choreId/actions", handleChoreAction);
app.post("/api/chore-actions/:choreId", handleChoreAction);
app.post("/api/chore-actions/run", handleChoreAction);

async function deliverTestChorePush(clientId, choreId) {
  const record = findChoreRecord(clientId);
  const chore = record?.chores.find((item) => item.id === choreId) ?? record?.chores[0];
  if (!chore) return { sent: 0, message: "테스트할 실제 집안일이 없습니다. 먼저 집안일을 등록하세요." };
  return sendPayloadToClient(clientId, buildChorePushPayload(chore, "test", clientId));
}

app.post("/api/push/test", async (request, response) => {
  const { clientId, choreId } = request.body ?? {};
  const requestedDelay = Number(request.body?.delaySeconds ?? 0);
  const delaySeconds = Number.isFinite(requestedDelay) ? Math.min(Math.max(requestedDelay, 0), 30) : 0;
  if (typeof clientId !== "string") return response.status(400).json({ message: "테스트 기기 식별자가 없습니다." });
  if (!findChoreRecord(clientId)?.chores.length) {
    return response.status(400).json({ message: "테스트할 실제 집안일이 없습니다. 먼저 집안일을 등록하세요." });
  }
  if (!getSubscriptionRecords().some((record) => record.clientId === clientId)) {
    return response.status(400).json({ message: "등록된 기기가 없습니다. 먼저 알림 권한을 허용하세요." });
  }

  if (delaySeconds > 0) {
    setTimeout(() => {
      deliverTestChorePush(clientId, choreId).catch((error) => console.error("Delayed test Push failed:", error));
    }, delaySeconds * 1000);
    return response.status(202).json({ message: `${delaySeconds}초 뒤 실제 집안일 테스트 Push를 보냅니다.` });
  }

  const result = await deliverTestChorePush(clientId, choreId);
  return response.status(result.sent > 0 ? 200 : 400).json(result);
});

const server = app.listen(port, () => {
  console.log(`Push schedule server running at http://localhost:${port}`);
});

const scheduler = setInterval(() => {
  processScheduledPushes().catch((error) => console.error("Scheduled Push failed:", error));
}, checkIntervalMs);
scheduler.unref();
processScheduledPushes().catch((error) => console.error("Initial Push check failed:", error));

export { app, server };
