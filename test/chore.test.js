import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateNextDueDate,
  completeChore,
  createChore,
  rescheduleChore,
  snoozeReminder,
} from "../src/domain/chore.js";

function sampleChore(overrides = {}) {
  return createChore({
    id: "chore-1",
    name: "침구 세탁",
    intervalValue: 2,
    intervalUnit: "month",
    lastCompletedDate: "2026-04-18",
    nextDueDate: "2026-06-18",
    reminderSnoozedUntil: "2026-06-20",
    isActive: true,
    createdAt: "2026-04-18T09:00:00.000Z",
    ...overrides,
  });
}

test("2026-06-18에서 2개월 뒤는 2026-08-18이다", () => {
  assert.equal(calculateNextDueDate("2026-06-18", 2, "month"), "2026-08-18");
});

test("월말에 같은 날짜가 없으면 마지막 날짜를 사용한다", () => {
  assert.equal(calculateNextDueDate("2026-01-31", 1, "month"), "2026-02-28");
});

test("윤년 2월의 마지막 날짜를 고려한다", () => {
  assert.equal(calculateNextDueDate("2028-01-31", 1, "month"), "2028-02-29");
});

test("완료하면 실제 완료일 기준으로 다음 일정을 다시 계산하고 snooze를 초기화한다", () => {
  const original = sampleChore();
  const completed = completeChore(original, "2026-06-21");

  assert.equal(completed.lastCompletedDate, "2026-06-21");
  assert.equal(completed.nextDueDate, "2026-08-21");
  assert.equal(completed.reminderSnoozedUntil, null);
  assert.equal(original.lastCompletedDate, "2026-04-18");
});

test("내일 알림으로 미루면 완료일과 예정일은 유지한다", () => {
  const snoozed = snoozeReminder(sampleChore(), "2026-06-18");

  assert.equal(snoozed.lastCompletedDate, "2026-04-18");
  assert.equal(snoozed.nextDueDate, "2026-06-18");
  assert.equal(snoozed.reminderSnoozedUntil, "2026-06-19");
});

test("다른 날로 미루면 완료일은 유지하고 예정일만 변경한다", () => {
  const rescheduled = rescheduleChore(sampleChore(), "2026-06-25");

  assert.equal(rescheduled.lastCompletedDate, "2026-04-18");
  assert.equal(rescheduled.nextDueDate, "2026-06-25");
  assert.equal(rescheduled.reminderSnoozedUntil, null);
});

test("일과 주 단위 주기를 지원한다", () => {
  assert.equal(calculateNextDueDate("2026-06-18", 3, "일"), "2026-06-21");
  assert.equal(calculateNextDueDate("2026-06-18", 2, "주"), "2026-07-02");
});
