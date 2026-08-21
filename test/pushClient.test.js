import assert from "node:assert/strict";
import test from "node:test";
import { readJsonResponse } from "../src/pushClient.js";

test("알림 서버의 JSON 응답을 읽는다", async () => {
  const response = new Response(JSON.stringify({ publicKey: "test-key" }), {
    headers: { "Content-Type": "application/json" },
  });
  assert.deepEqual(await readJsonResponse(response), { publicKey: "test-key" });
});

test("알림 API가 웹페이지를 반환하면 이해하기 쉬운 오류를 표시한다", async () => {
  const response = new Response("<!doctype html><title>우리집 집사</title>", {
    headers: { "Content-Type": "text/html" },
  });
  await assert.rejects(
    readJsonResponse(response),
    /알림 서버에 연결할 수 없습니다/,
  );
});
