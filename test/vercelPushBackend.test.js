import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("Vercel은 매일 한국시간 오후 7시에 Push 예약 함수를 호출한다", () => {
  const config = JSON.parse(fs.readFileSync(path.join(root, "vercel.json"), "utf8"));
  assert.deepEqual(config.crons, [{ path: "/api/cron/push", schedule: "0 10 * * *" }]);
});

test("공개 배포에 필요한 Push API 함수가 모두 존재한다", () => {
  const routes = [
    "api/push/public-key.js",
    "api/push/subscribe.js",
    "api/push/test.js",
    "api/chores/sync.js",
    "api/chores/get.js",
    "api/chore-actions/run.js",
    "api/cron/push.js",
  ];
  for (const route of routes) assert.equal(fs.existsSync(path.join(root, route)), true, route);
});

test("비밀값은 저장소에 넣지 않고 환경변수 이름만 문서화한다", () => {
  const template = fs.readFileSync(path.join(root, ".env.example"), "utf8");
  for (const name of [
    "VAPID_PUBLIC_KEY",
    "VAPID_PRIVATE_KEY",
    "KV_REST_API_URL",
    "KV_REST_API_TOKEN",
    "CRON_SECRET",
  ]) {
    assert.match(template, new RegExp(`^${name}=$`, "m"));
  }
  assert.match(template, /^VAPID_SUBJECT=mailto:/m);
});
