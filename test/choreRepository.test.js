import assert from "node:assert/strict";
import test from "node:test";
import { completeChore, createChore } from "../src/domain/chore.js";
import {
  CHORE_STORAGE_KEY,
  loadChores,
  saveChores,
  updateChore,
} from "../src/data/choreRepository.js";

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

test("완료 처리한 집안일을 같은 id의 기존 일정에 반영한다", () => {
  const storage = memoryStorage();
  saveChores([
    { id: "washer-clean", name: "세탁조 청소", nextDueDate: "2026-08-20" },
    { id: "aircon-filter", name: "에어컨 필터 청소", nextDueDate: "2026-08-22" },
  ], storage);

  const completed = {
    id: "washer-clean",
    name: "세탁조 청소",
    lastCompletedDate: "2026-08-20",
    nextDueDate: "2026-10-20",
  };
  updateChore(completed, storage);

  assert.deepEqual(loadChores(storage), [
    completed,
    { id: "aircon-filter", name: "에어컨 필터 청소", nextDueDate: "2026-08-22" },
  ]);
});

test("등록한 일정을 오늘 완료하면 완료일과 다음 예정일이 저장된다", () => {
  const storage = memoryStorage();
  const registered = createChore({
    id: "washer-clean",
    name: "세탁조 청소",
    intervalValue: 2,
    intervalUnit: "month",
    lastCompletedDate: "2026-06-20",
    nextDueDate: "2026-08-20",
    reminderSnoozedUntil: "2026-08-21",
    createdAt: "2026-06-20T09:00:00.000Z",
  });
  saveChores([registered], storage);

  const completed = completeChore(loadChores(storage)[0], "2026-08-20");
  updateChore(completed, storage);

  const [saved] = loadChores(storage);
  assert.equal(saved.lastCompletedDate, "2026-08-20");
  assert.equal(saved.nextDueDate, "2026-10-20");
  assert.equal(saved.reminderSnoozedUntil, null);
  assert.equal(saved.intervalValue, 2);
  assert.equal(saved.intervalUnit, "month");
});
