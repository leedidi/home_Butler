import assert from "node:assert/strict";
import test from "node:test";
import { loadChores, saveChores, updateChore } from "../src/data/choreRepository.js";
import {
  calculateNextDueDate,
  completeChore,
  createChore,
} from "../src/domain/chore.js";
import { buildChorePushPayload, getReminderKind } from "../server/pushSchedule.js";

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
}

test("P0 등록부터 Push 대상, 완료, 다음 일정 저장까지 한 바퀴 동작한다", () => {
  const storage = memoryStorage();
  const nextDueDate = calculateNextDueDate("2026-06-20", 2, "month");
  const registered = createChore({
    id: "washer-clean",
    name: "세탁조 청소",
    intervalValue: 2,
    intervalUnit: "month",
    lastCompletedDate: "2026-06-20",
    nextDueDate,
    reminderSnoozedUntil: null,
    isActive: true,
    createdAt: "2026-06-20T09:00:00.000Z",
  });
  saveChores([registered], storage);

  const [calendarChore] = loadChores(storage);
  assert.equal(calendarChore.nextDueDate, "2026-08-20");
  assert.equal(getReminderKind(calendarChore, "2026-08-20"), "due-today");
  const payload = buildChorePushPayload(calendarChore, "due-today", "client-1");
  assert.equal(payload.url, "/chores/washer-clean");

  const completed = completeChore(calendarChore, "2026-08-20");
  updateChore(completed, storage);
  const [reloaded] = loadChores(storage);
  assert.equal(reloaded.lastCompletedDate, "2026-08-20");
  assert.equal(reloaded.nextDueDate, "2026-10-20");
  assert.equal(reloaded.reminderSnoozedUntil, null);
});

test("최근 완료일을 모르면 선택한 첫 예정일을 그대로 저장한다", () => {
  const storage = memoryStorage();
  const registered = createChore({
    id: "aircon-filter",
    name: "에어컨 필터 청소",
    intervalValue: 1,
    intervalUnit: "month",
    lastCompletedDate: null,
    nextDueDate: "2026-08-25",
    createdAt: "2026-08-20T09:00:00.000Z",
  });
  saveChores([registered], storage);

  const [reloaded] = loadChores(storage);
  assert.equal(reloaded.lastCompletedDate, null);
  assert.equal(reloaded.nextDueDate, "2026-08-25");
});

test("예정일보다 늦게 완료하면 실제 완료일을 기준으로 다음 일정을 만든다", () => {
  const chore = createChore({
    id: "washer-clean",
    name: "세탁조 청소",
    intervalValue: 2,
    intervalUnit: "month",
    lastCompletedDate: "2026-06-20",
    nextDueDate: "2026-08-20",
    createdAt: "2026-06-20T09:00:00.000Z",
  });

  const completedLate = completeChore(chore, "2026-08-25");
  assert.equal(completedLate.lastCompletedDate, "2026-08-25");
  assert.equal(completedLate.nextDueDate, "2026-10-25");
});
