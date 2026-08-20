import assert from "node:assert/strict";
import test from "node:test";
import { CHORE_STORAGE_KEY, loadChores, saveChores } from "../src/data/choreRepository.js";

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
}

test("집안일 목록을 저장하고 다시 불러온다", () => {
  const storage = memoryStorage();
  const chores = [{ id: "washer-clean", name: "세탁조 청소", nextDueDate: "2026-08-20" }];
  saveChores(chores, storage);
  assert.deepEqual(loadChores(storage), chores);
  assert.equal(typeof storage.getItem(CHORE_STORAGE_KEY), "string");
});

test("손상된 저장 데이터는 빈 목록으로 안전하게 처리한다", () => {
  const storage = memoryStorage();
  storage.setItem(CHORE_STORAGE_KEY, "not-json");
  assert.deepEqual(loadChores(storage), []);
});
