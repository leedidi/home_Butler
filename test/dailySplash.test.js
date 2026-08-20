import assert from "node:assert/strict";
import test from "node:test";
import { DAILY_SPLASH_KEY, shouldShowDailySplash } from "../src/ui/dailySplash.js";

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    value: (key) => values.get(key),
  };
}

test("시작 화면은 같은 날 한 번만 표시한다", () => {
  const storage = memoryStorage();
  assert.equal(shouldShowDailySplash("2026-08-20", storage), true);
  assert.equal(shouldShowDailySplash("2026-08-20", storage), false);
  assert.equal(storage.value(DAILY_SPLASH_KEY), "2026-08-20");
});

test("날짜가 바뀌면 시작 화면을 다시 표시한다", () => {
  const storage = memoryStorage();
  shouldShowDailySplash("2026-08-20", storage);
  assert.equal(shouldShowDailySplash("2026-08-21", storage), true);
});

test("브라우저 저장소가 차단되어도 시작 화면 때문에 앱이 중단되지 않는다", () => {
  const blockedStorage = {
    getItem: () => { throw new Error("blocked"); },
    setItem: () => { throw new Error("blocked"); },
  };
  assert.equal(shouldShowDailySplash("2026-08-20", blockedStorage), true);
});
