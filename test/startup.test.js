import assert from "node:assert/strict";
import test from "node:test";
import {
  STARTUP_SPLASH_KEY,
  getStartupPath,
  shouldShowStartupSplash,
} from "../src/ui/startup.js";

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    value: (key) => values.get(key),
  };
}

test("앱을 처음 실행할 때만 시작 화면을 표시한다", () => {
  const storage = memoryStorage();
  assert.equal(shouldShowStartupSplash(storage), true);
  assert.equal(shouldShowStartupSplash(storage), false);
  assert.equal(storage.value(STARTUP_SPLASH_KEY), "shown");
});

test("첫 실행은 메인 집사 화면에서 시작한다", () => {
  assert.equal(getStartupPath("/"), "/");
  assert.equal(getStartupPath("/register"), "/");
  assert.equal(getStartupPath("/manage"), "/");
});

test("Push 알림으로 연 집안일 상세 주소는 유지한다", () => {
  assert.equal(getStartupPath("/chores/washing-machine"), "/chores/washing-machine");
});

test("브라우저 저장소가 차단되어도 앱 실행은 중단되지 않는다", () => {
  const blockedStorage = {
    getItem: () => { throw new Error("blocked"); },
    setItem: () => { throw new Error("blocked"); },
  };
  assert.equal(shouldShowStartupSplash(blockedStorage), true);
});
