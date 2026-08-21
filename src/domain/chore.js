export const INTERVAL_UNITS = Object.freeze({
  DAY: "day",
  WEEK: "week",
  MONTH: "month",
});

const UNIT_ALIASES = Object.freeze({
  day: INTERVAL_UNITS.DAY,
  days: INTERVAL_UNITS.DAY,
  일: INTERVAL_UNITS.DAY,
  week: INTERVAL_UNITS.WEEK,
  weeks: INTERVAL_UNITS.WEEK,
  주: INTERVAL_UNITS.WEEK,
  month: INTERVAL_UNITS.MONTH,
  months: INTERVAL_UNITS.MONTH,
  개월: INTERVAL_UNITS.MONTH,
});

/**
 * @typedef {object} Chore
 * @property {string} id
 * @property {string} name
 * @property {number} intervalValue
 * @property {'day'|'week'|'month'} intervalUnit
 * @property {string|null} lastCompletedDate 날짜만 포함한 YYYY-MM-DD 형식
 * @property {string} nextDueDate 날짜만 포함한 YYYY-MM-DD 형식
 * @property {string|null} reminderSnoozedUntil 날짜만 포함한 YYYY-MM-DD 형식
 * @property {boolean} isActive
 * @property {boolean} isExample 실제 알림에서 제외되는 첫 방문용 예시 여부
 * @property {boolean} [isCustom] 사용자가 직접 추가한 집안일 여부
 * @property {string} [icon] 사용자 집안일 표시 아이콘
 * @property {string} [theme] 사용자 집안일 표시 색상
 * @property {string} createdAt ISO 8601 날짜·시간 형식
 */

function normalizeIntervalUnit(intervalUnit) {
  const normalized = UNIT_ALIASES[intervalUnit];
  if (!normalized) {
    throw new TypeError("intervalUnit은 day(일), week(주), month(개월) 중 하나여야 합니다.");
  }
  return normalized;
}

function validateIntervalValue(intervalValue) {
  if (!Number.isInteger(intervalValue) || intervalValue <= 0) {
    throw new TypeError("intervalValue는 1 이상의 정수여야 합니다.");
  }
}

function parseDateOnly(date, fieldName = "date") {
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new TypeError(`${fieldName}는 YYYY-MM-DD 형식이어야 합니다.`);
  }

  const [year, month, day] = date.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year
    || parsed.getUTCMonth() !== month - 1
    || parsed.getUTCDate() !== day
  ) {
    throw new RangeError(`${fieldName}에 존재하지 않는 날짜가 입력되었습니다.`);
  }

  return { year, month, day, parsed };
}

function formatDateOnly(date) {
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function addDays(date, numberOfDays) {
  const { parsed } = parseDateOnly(date);
  parsed.setUTCDate(parsed.getUTCDate() + numberOfDays);
  return formatDateOnly(parsed);
}

function addMonths(date, numberOfMonths) {
  const { year, month, day } = parseDateOnly(date);
  const absoluteMonth = year * 12 + (month - 1) + numberOfMonths;
  const targetYear = Math.floor(absoluteMonth / 12);
  const targetMonthIndex = absoluteMonth % 12;
  const lastDayOfTargetMonth = new Date(Date.UTC(targetYear, targetMonthIndex + 1, 0)).getUTCDate();
  const targetDay = Math.min(day, lastDayOfTargetMonth);
  return formatDateOnly(new Date(Date.UTC(targetYear, targetMonthIndex, targetDay)));
}

function todayDateOnly(now = new Date()) {
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
}

/**
 * 기준일에 반복 주기를 더해 다음 예정일을 계산한다.
 * 월 단위 계산에서 같은 일자가 없으면 해당 월의 마지막 날을 사용한다.
 */
export function calculateNextDueDate(baseDate, intervalValue, intervalUnit) {
  parseDateOnly(baseDate, "baseDate");
  validateIntervalValue(intervalValue);
  const normalizedUnit = normalizeIntervalUnit(intervalUnit);

  if (normalizedUnit === INTERVAL_UNITS.DAY) {
    return addDays(baseDate, intervalValue);
  }
  if (normalizedUnit === INTERVAL_UNITS.WEEK) {
    return addDays(baseDate, intervalValue * 7);
  }
  return addMonths(baseDate, intervalValue);
}

/**
 * 모든 필드를 갖춘 집안일 데이터를 만든다.
 * @returns {Chore}
 */
export function createChore(input) {
  if (!input || typeof input !== "object") {
    throw new TypeError("집안일 입력값이 필요합니다.");
  }
  if (typeof input.name !== "string" || input.name.trim() === "") {
    throw new TypeError("name은 비어 있지 않은 문자열이어야 합니다.");
  }

  validateIntervalValue(input.intervalValue);
  const intervalUnit = normalizeIntervalUnit(input.intervalUnit);
  if (input.lastCompletedDate !== null && input.lastCompletedDate !== undefined) {
    parseDateOnly(input.lastCompletedDate, "lastCompletedDate");
  }
  parseDateOnly(input.nextDueDate, "nextDueDate");
  if (input.reminderSnoozedUntil !== null && input.reminderSnoozedUntil !== undefined) {
    parseDateOnly(input.reminderSnoozedUntil, "reminderSnoozedUntil");
  }

  const createdAt = input.createdAt ?? new Date().toISOString();
  if (Number.isNaN(Date.parse(createdAt))) {
    throw new TypeError("createdAt은 유효한 ISO 날짜·시간이어야 합니다.");
  }

  const chore = {
    id: input.id ?? globalThis.crypto.randomUUID(),
    name: input.name.trim(),
    intervalValue: input.intervalValue,
    intervalUnit,
    lastCompletedDate: input.lastCompletedDate ?? null,
    nextDueDate: input.nextDueDate,
    reminderSnoozedUntil: input.reminderSnoozedUntil ?? null,
    isActive: input.isActive ?? true,
    isExample: input.isExample ?? false,
    createdAt,
  };
  if (input.isCustom) chore.isCustom = true;
  if (typeof input.icon === "string" && input.icon) chore.icon = input.icon;
  if (typeof input.theme === "string" && input.theme) chore.theme = input.theme;
  return chore;
}

/** 완료일을 갱신하고 완료일 기준으로 다음 일정을 계산한다. */
export function completeChore(chore, completedDate = todayDateOnly()) {
  parseDateOnly(completedDate, "completedDate");
  return {
    ...chore,
    lastCompletedDate: completedDate,
    nextDueDate: calculateNextDueDate(completedDate, chore.intervalValue, chore.intervalUnit),
    reminderSnoozedUntil: null,
  };
}

/** 예정일과 완료일은 유지하고 알림만 실행일의 다음 날까지 미룬다. */
export function snoozeReminder(chore, snoozedOnDate = todayDateOnly()) {
  parseDateOnly(snoozedOnDate, "snoozedOnDate");
  return {
    ...chore,
    reminderSnoozedUntil: addDays(snoozedOnDate, 1),
  };
}

/** 완료일은 유지하고 예정일만 사용자가 선택한 날짜로 변경한다. */
export function rescheduleChore(chore, selectedDate) {
  parseDateOnly(selectedDate, "selectedDate");
  return {
    ...chore,
    nextDueDate: selectedDate,
    reminderSnoozedUntil: null,
  };
}
