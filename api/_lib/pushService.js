import crypto from "node:crypto";
import webpush from "web-push";
import { completeChore, createChore, snoozeReminder } from "../../src/domain/chore.js";
import { buildChorePushPayload, getReminderKind, getZonedDateTime } from "../../server/pushSchedule.js";
import {
  claimDelivery,
  claimTestRequest,
  configurationError,
  getChoreRecord,
  getSubscriptions,
  listChoreRecords,
  releaseDelivery,
  removeSubscription,
  saveChoreRecord,
  saveSubscription,
} from "./redisStore.js";

let vapidConfigured = false;

function getVapidPublicKey() {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) {
    throw configurationError("VAPID 환경변수가 없습니다.");
  }
  if (!vapidConfigured) {
    webpush.setVapidDetails(subject, publicKey, privateKey);
    vapidConfigured = true;
  }
  return publicKey;
}

function validateClientId(clientId) {
  return typeof clientId === "string" && clientId.length >= 8 && clientId.length <= 128;
}

export function publicKey() {
  return getVapidPublicKey();
}

export async function subscribe(clientId, subscription) {
  getVapidPublicKey();
  if (!validateClientId(clientId) || !subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
    const error = new Error("유효한 기기 및 Push 구독 정보가 아닙니다.");
    error.statusCode = 400;
    throw error;
  }
  await saveSubscription(clientId, subscription);
}

export async function syncChores(clientId, chores, timeZone = "Asia/Seoul") {
  if (!validateClientId(clientId) || !Array.isArray(chores)) {
    const error = new Error("유효한 집안일 동기화 정보가 아닙니다.");
    error.statusCode = 400;
    throw error;
  }
  const record = {
    clientId,
    chores: chores.map((chore) => createChore(chore)),
    timeZone,
    updatedAt: new Date().toISOString(),
  };
  return saveChoreRecord(record);
}

export function loadChores(clientId) {
  if (!validateClientId(clientId)) return null;
  return getChoreRecord(clientId);
}

export async function runChoreAction(clientId, choreId, action, now = new Date()) {
  const record = await getChoreRecord(clientId);
  const chore = record?.chores.find((item) => item.id === choreId);
  if (!record || !chore) return null;
  if (!["complete", "snooze"].includes(action)) {
    const error = new Error("지원하지 않는 알림 액션입니다.");
    error.statusCode = 400;
    throw error;
  }
  const today = getZonedDateTime(now, record.timeZone ?? "Asia/Seoul").dateOnly;
  const updatedChore = action === "complete" ? completeChore(chore, today) : snoozeReminder(chore, today);
  await saveChoreRecord({
    ...record,
    chores: record.chores.map((item) => item.id === choreId ? updatedChore : item),
    updatedAt: new Date().toISOString(),
  });
  return updatedChore;
}

async function sendPayloadToClient(clientId, payload) {
  getVapidPublicKey();
  const records = await getSubscriptions(clientId);
  if (records.length === 0) return { sent: 0, message: "등록된 기기가 없습니다." };

  const results = await Promise.allSettled(records.map((record) => webpush.sendNotification(
    record.subscription,
    JSON.stringify(payload),
    {
      TTL: 86_400,
      urgency: "high",
      topic: `chore-${crypto.createHash("sha256").update(payload.choreId).digest("hex").slice(0, 20)}`,
    },
  )));
  await Promise.all(results.flatMap((result, index) => (
    result.status === "rejected" && [404, 410].includes(result.reason?.statusCode)
      ? [removeSubscription(clientId, records[index].subscription.endpoint)]
      : []
  )));
  const sent = results.filter((result) => result.status === "fulfilled").length;
  return { sent, message: sent > 0 ? "Push 발송 요청을 완료했습니다." : "Push 서비스가 알림을 수락하지 않았습니다." };
}

export async function sendTestPush(clientId, choreId) {
  if (!await claimTestRequest(clientId)) {
    const error = new Error("테스트 알림은 10초 뒤 다시 보낼 수 있습니다.");
    error.statusCode = 429;
    throw error;
  }
  const record = await getChoreRecord(clientId);
  const chore = record?.chores.find((item) => item.id === choreId) ?? record?.chores[0];
  if (!chore) return { sent: 0, message: "테스트할 실제 집안일이 없습니다. 먼저 집안일을 등록하세요." };
  return sendPayloadToClient(clientId, buildChorePushPayload(chore, "test", clientId));
}

export async function processScheduledPushes(now = new Date()) {
  let sent = 0;
  const records = await listChoreRecords();
  for (const record of records) {
    const zoned = getZonedDateTime(now, record.timeZone ?? "Asia/Seoul");
    for (const chore of record.chores) {
      const kind = getReminderKind(chore, zoned.dateOnly);
      if (!kind) continue;
      const deliveryId = `${record.clientId}:${chore.id}:${zoned.dateOnly}:${kind}`;
      const claimKey = await claimDelivery(deliveryId);
      if (!claimKey) continue;
      const result = await sendPayloadToClient(record.clientId, buildChorePushPayload(chore, kind, record.clientId));
      if (result.sent > 0) sent += result.sent;
      else await releaseDelivery(claimKey);
    }
  }
  return { sent, clients: records.length };
}
