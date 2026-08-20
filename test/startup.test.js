import assert from "node:assert/strict";
import test from "node:test";
import { getStartupPath } from "../src/ui/startup.js";

test("일반 실행과 새로고침은 메인 집사 화면에서 시작한다", () => {
  assert.equal(getStartupPath("/"), "/");
  assert.equal(getStartupPath("/register"), "/");
  assert.equal(getStartupPath("/manage"), "/");
});

test("Push 알림으로 연 집안일 상세 주소는 유지한다", () => {
  assert.equal(getStartupPath("/chores/washing-machine"), "/chores/washing-machine");
});
