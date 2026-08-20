const REMINDER_OFFSETS = new Set([-1, 0, 1, 3, 7]);

function parseDateOnly(dateOnly) {
  const [year, month, day] = dateOnly.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

export function differenceInDays(fromDate, toDate) {
  return Math.round((parseDateOnly(toDate) - parseDateOnly(fromDate)) / 86_400_000);
}

export function getReminderKind(chore, today) {
  if (!chore?.isActive || chore.isExample) return null;

  if (chore.reminderSnoozedUntil) {
    if (today < chore.reminderSnoozedUntil) return null;
    if (today === chore.reminderSnoozedUntil) return "snoozed";
  }

  const offset = differenceInDays(chore.nextDueDate, today);
  if (REMINDER_OFFSETS.has(offset)) return offset === -1 ? "day-before" : offset === 0 ? "due-today" : `overdue-${offset}`;
  if (offset > 7 && (offset - 7) % 7 === 0) return `overdue-${offset}`;
  return null;
}

export function getZonedDateTime(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date).reduce((result, part) => {
    if (part.type !== "literal") result[part.type] = part.value;
    return result;
  }, {});

  return {
    dateOnly: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour),
    minute: Number(parts.minute),
  };
}

export function buildChorePushPayload(chore, kind, clientId) {
  let body = `${chore.name}할 때예요.\n오늘 챙겨볼까요?`;
  if (kind === "day-before") body = `내일은 ${chore.name}하는 날이에요.\n미리 알려드릴게요.`;
  if (kind === "snoozed") body = `${chore.name}, 다시 알려드리기로 한 날이에요.\n오늘 챙겨볼까요?`;
  if (kind.startsWith("overdue-")) {
    const days = kind.slice("overdue-".length);
    body = `${chore.name} 예정일이 ${days}일 지났어요.\n오늘 챙겨볼까요?`;
  }
  if (kind === "test") body = `${chore.name} 실제 일정 연결 테스트예요.\n알림 액션을 확인해 보세요.`;

  return {
    title: "🏠 우리집 집사",
    body,
    url: `/chores/${encodeURIComponent(chore.id)}`,
    choreId: chore.id,
    clientId,
    kind,
  };
}
