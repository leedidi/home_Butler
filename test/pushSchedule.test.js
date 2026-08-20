import assert from "node:assert/strict";
import test from "node:test";
import {
  buildChorePushPayload,
  getReminderKind,
  getZonedDateTime,
} from "../server/pushSchedule.js";

const chore = {
  id: "washer-clean",
  name: "세탁조 청소",
  nextDueDate: "2026-08-20",
  reminderSnoozedUntil: null,
  isActive: true,
};

test("전날·당일·1/3/7일 후와 이후 7일 간격만 알림 대상으로 고른다", () => {
  const expectedDates = [
    "2026-08-19",
    "2026-08-20",
    "2026-08-21",
    "2026-08-23",
    "2026-08-27",
    "2026-09-03",
    "2026-09-10",
  ];
  for (const date of expectedDates) assert.ok(getReminderKind(chore, date), date);
  for (const date of ["2026-08-18", "2026-08-22", "2026-08-24", "2026-08-28"]) {
    assert.equal(getReminderKind(chore, date), null, date);
  }
});

test("snooze 날짜 전에는 보내지 않고 해당 날짜에 다시 알린다", () => {
  const snoozed = { ...chore, reminderSnoozedUntil: "2026-08-21" };
  assert.equal(getReminderKind(snoozed, "2026-08-20"), null);
  assert.equal(getReminderKind(snoozed, "2026-08-21"), "snoozed");
});

test("비활성 일정은 알림 대상이 아니다", () => {
  assert.equal(getReminderKind({ ...chore, isActive: false }, "2026-08-20"), null);
});

test("첫 방문용 예시 일정은 알림 대상이 아니다", () => {
  assert.equal(getReminderKind({ ...chore, isExample: true }, "2026-08-20"), null);
});

test("사용자 시간대 기준 날짜와 오후 7시를 계산한다", () => {
  const zoned = getZonedDateTime(new Date("2026-08-20T10:00:00.000Z"), "Asia/Seoul");
  assert.deepEqual(zoned, { dateOnly: "2026-08-20", hour: 19, minute: 0 });
});

test("알림은 해당 집안일 상세 경로와 액션 식별자를 포함한다", () => {
  const payload = buildChorePushPayload(chore, "due-today", "client-1");
  assert.equal(payload.url, "/chores/washer-clean");
  assert.equal(payload.choreId, "washer-clean");
  assert.equal(payload.clientId, "client-1");
  assert.match(payload.body, /세탁조 청소/);
});
