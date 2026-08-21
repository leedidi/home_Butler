import crypto from "node:crypto";
import { Redis } from "@upstash/redis";

const PREFIX = "home-butler:v1";
const CLIENTS_KEY = `${PREFIX}:clients`;
let redis;

function configurationError(message) {
  const error = new Error(message);
  error.code = "PUSH_CONFIGURATION_ERROR";
  return error;
}

function getRedis() {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    throw configurationError("Upstash Redis 환경변수가 없습니다.");
  }
  redis ??= new Redis({ url, token });
  return redis;
}

function safeKey(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function choreKey(clientId) {
  return `${PREFIX}:chores:${safeKey(clientId)}`;
}

function subscriptionIndexKey(clientId) {
  return `${PREFIX}:subscription-index:${safeKey(clientId)}`;
}

function subscriptionKey(clientId, endpoint) {
  return `${PREFIX}:subscription:${safeKey(clientId)}:${safeKey(endpoint)}`;
}

export async function saveChoreRecord(record) {
  const clientHash = safeKey(record.clientId);
  await Promise.all([
    getRedis().set(choreKey(record.clientId), record),
    getRedis().hset(CLIENTS_KEY, { [clientHash]: record.clientId }),
  ]);
  return record;
}

export function getChoreRecord(clientId) {
  return getRedis().get(choreKey(clientId));
}

export async function listChoreRecords() {
  const clients = Object.values(await getRedis().hgetall(CLIENTS_KEY) ?? {});
  const records = await Promise.all(clients.map((clientId) => getChoreRecord(clientId)));
  return records.filter(Boolean);
}

export async function saveSubscription(clientId, subscription) {
  const key = subscriptionKey(clientId, subscription.endpoint);
  const record = { clientId, subscription, createdAt: new Date().toISOString() };
  await Promise.all([
    getRedis().set(key, record),
    getRedis().sadd(subscriptionIndexKey(clientId), key),
  ]);
  return record;
}

export async function getSubscriptions(clientId) {
  const keys = await getRedis().smembers(subscriptionIndexKey(clientId));
  if (keys.length === 0) return [];
  const records = await Promise.all(keys.map((key) => getRedis().get(key)));
  return records.filter(Boolean);
}

export async function removeSubscription(clientId, endpoint) {
  const key = subscriptionKey(clientId, endpoint);
  await Promise.all([
    getRedis().del(key),
    getRedis().srem(subscriptionIndexKey(clientId), key),
  ]);
}

export async function claimDelivery(deliveryId) {
  const key = `${PREFIX}:delivery:${safeKey(deliveryId)}`;
  const claimed = await getRedis().set(key, new Date().toISOString(), { nx: true, ex: 60 * 60 * 24 * 400 });
  return claimed === "OK" ? key : null;
}

export function releaseDelivery(key) {
  return getRedis().del(key);
}

export async function claimTestRequest(clientId) {
  const key = `${PREFIX}:test-rate:${safeKey(clientId)}`;
  return await getRedis().set(key, "1", { nx: true, ex: 10 }) === "OK";
}

export { configurationError };
