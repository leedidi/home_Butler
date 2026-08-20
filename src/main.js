import "./style.css";
import {
  calculateNextDueDate,
  completeChore,
  createChore,
  rescheduleChore,
  snoozeReminder,
} from "./domain/chore.js";
import { CHORE_CATALOG } from "./domain/choreCatalog.js";
import { loadChores, saveChores, updateChore } from "./data/choreRepository.js";
import { getStartupPath } from "./ui/startup.js";
import {
  enablePushNotifications,
  getPushEnabled,
  loadChoresFromPushServer,
  registerPushServiceWorker,
  restorePushRegistration,
  syncChoresToPushServer,
} from "./pushClient.js";

const butlerImage = new URL("../assets/butler-variants/main_default_pose.png", import.meta.url).href;
const app = document.querySelector("#app");
const UNIT_LABELS = { day: "일", week: "주", month: "개월" };
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
let calendarMonth = startOfMonth(new Date());

function syncCurrentChores() {
  syncChoresToPushServer(loadChores()).catch((error) => {
    console.warn("Push 일정 동기화 실패:", error.message);
  });
}

function persistChores(chores) {
  saveChores(chores);
  syncCurrentChores();
  return chores;
}

function persistChore(chore) {
  updateChore(chore);
  syncCurrentChores();
  return chore;
}

function toDateOnly(date) {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addLocalDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function formatKoreanDate(dateOnly) {
  if (!dateOnly) return "기록 없음";
  const [year, month, day] = dateOnly.split("-").map(Number);
  return `${year}년 ${month}월 ${day}일`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function navigate(path) {
  window.history.pushState({}, "", path);
  renderRoute();
  window.scrollTo({ top: 0, behavior: "auto" });
}

function renderCalendar(chores) {
  const year = calendarMonth.getFullYear();
  const month = calendarMonth.getMonth();
  const gridStart = addLocalDays(calendarMonth, -calendarMonth.getDay());
  const today = toDateOnly(new Date());
  const choresByDate = chores.reduce((grouped, chore) => {
    if (!chore.isActive) return grouped;
    grouped[chore.nextDueDate] ??= [];
    grouped[chore.nextDueDate].push(chore);
    return grouped;
  }, {});

  const cells = Array.from({ length: 42 }, (_, index) => {
    const cellDate = addLocalDays(gridStart, index);
    const dateOnly = toDateOnly(cellDate);
    const events = choresByDate[dateOnly] ?? [];
    const outsideMonth = cellDate.getMonth() !== month;
    return `
      <div class="calendar-cell${outsideMonth ? " is-outside" : ""}" data-date="${dateOnly}">
        <span class="calendar-day${dateOnly === today ? " is-today" : ""}">${cellDate.getDate()}</span>
        <div class="calendar-events">
          ${events.slice(0, 2).map((chore) => `<button class="calendar-event" type="button" data-chore-id="${escapeHtml(chore.id)}" title="${escapeHtml(chore.name)}">${escapeHtml(chore.name)}</button>`).join("")}
          ${events.length > 2 ? `<span class="calendar-more">+${events.length - 2}</span>` : ""}
        </div>
      </div>`;
  }).join("");

  return `
    <section class="calendar-card" aria-labelledby="calendar-title">
      <div class="calendar-header">
        <button class="icon-button" type="button" data-action="previous-month" aria-label="이전 달">‹</button>
        <div class="calendar-heading">
          <h2 id="calendar-title">${year}년 ${month + 1}월</h2>
          <button class="today-button" type="button" data-action="today">오늘</button>
        </div>
        <button class="icon-button" type="button" data-action="next-month" aria-label="다음 달">›</button>
      </div>
      <div class="weekday-row">${WEEKDAYS.map((day) => `<span>${day}</span>`).join("")}</div>
      <div class="calendar-grid">${cells}</div>
    </section>`;
}

function renderHome() {
  const chores = loadChores();
  const upcoming = [...chores]
    .filter((chore) => chore.isActive)
    .sort((a, b) => a.nextDueDate.localeCompare(b.nextDueDate))
    .slice(0, 3);

  app.innerHTML = `
    <main class="app-shell home-page">
      <header class="home-header">
        <div>
          <h1>우리집 집사</h1>
          <p>한 번 맡겨두면, 제가 기억하고 챙겨드릴게요.</p>
        </div>
        <button class="guide-button" type="button" aria-label="사용 방법"><span aria-hidden="true">ⓘ</span> 사용 방법</button>
      </header>
      <section class="butler-card">
        <img src="${butlerImage}" alt="우리집 집사 캐릭터" />
        ${chores.length === 0 ? `
          <p class="butler-message">현재 관리 중인 집안일이 없어요.</p>
        ` : `
          <p class="butler-message"><strong>${chores.length}개</strong>의 집안일을 제가 챙기고 있어요.</p>
          <ul class="upcoming-list">
            ${upcoming.map((chore) => `<li><span>${escapeHtml(chore.name)}</span><time datetime="${chore.nextDueDate}">${chore.nextDueDate.slice(5).replace("-", ".")}</time></li>`).join("")}
          </ul>
        `}
        <button class="primary-button compact" type="button" data-route="/manage">집안일 관리 목록</button>
        <div class="notification-control">
          <button class="notification-button" type="button" data-action="enable-notifications">🔔 알림 받기</button>
          <p class="notification-status" role="status"></p>
        </div>
      </section>
      ${renderCalendar(chores)}
      <button class="bottom-cta" type="button" data-route="/register">+ 우리 집 집사에게 맡길 일을 등록해볼까요?</button>
    </main>`;

  app.querySelector("[data-action='previous-month']").addEventListener("click", () => {
    calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1);
    renderHome();
  });
  app.querySelector("[data-action='next-month']").addEventListener("click", () => {
    calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1);
    renderHome();
  });
  app.querySelector("[data-action='today']").addEventListener("click", () => {
    calendarMonth = startOfMonth(new Date());
    renderHome();
  });
  app.querySelectorAll("[data-route]").forEach((element) => {
    element.addEventListener("click", () => navigate(element.dataset.route));
  });
  app.querySelectorAll(".calendar-event[data-chore-id]").forEach((eventButton) => {
    eventButton.addEventListener("click", () => {
      navigate(`/chores/${encodeURIComponent(eventButton.dataset.choreId)}`);
    });
  });
  const notificationButton = app.querySelector("[data-action='enable-notifications']");
  const notificationStatus = app.querySelector(".notification-status");
  getPushEnabled().then((enabled) => {
    if (!notificationButton.isConnected) return;
    notificationButton.textContent = enabled ? "🔔 알림 켜짐" : "🔔 알림 받기";
    notificationButton.classList.toggle("is-enabled", enabled);
  });
  notificationButton.addEventListener("click", async () => {
    notificationButton.disabled = true;
    notificationStatus.textContent = "기기 알림을 연결하고 있어요…";
    try {
      await enablePushNotifications(loadChores());
      notificationButton.textContent = "🔔 알림 켜짐";
      notificationButton.classList.add("is-enabled");
      notificationStatus.textContent = "매일 오후 7시에 필요한 알림을 보내드릴게요.";
    } catch (error) {
      notificationStatus.textContent = error.message;
    } finally {
      notificationButton.disabled = false;
    }
  });
}

function renderChoreDetail(choreId) {
  const chore = loadChores().find((item) => item.id === choreId);

  if (!chore) {
    navigate("/");
    return;
  }

  const catalogItem = CHORE_CATALOG.find((item) => item.id === chore.id);
  app.innerHTML = `
    <main class="app-shell detail-page">
      <header class="detail-header">
        <button class="back-button" type="button" data-route="/" aria-label="캘린더로 돌아가기">‹</button>
        <h1>일정 상세</h1>
      </header>
      <section class="detail-card" aria-labelledby="chore-detail-title">
        <div class="detail-title-row">
          <span class="detail-icon" aria-hidden="true">${catalogItem?.icon ?? "✓"}</span>
          <h2 id="chore-detail-title">${escapeHtml(chore.name)}</h2>
        </div>
        <dl class="detail-list">
          <div>
            <dt>최근 완료일</dt>
            <dd>${formatKoreanDate(chore.lastCompletedDate)}</dd>
          </div>
          <div>
            <dt>주기</dt>
            <dd>${chore.intervalValue}${UNIT_LABELS[chore.intervalUnit]}</dd>
          </div>
          <div>
            <dt>현재 예정일</dt>
            <dd>${formatKoreanDate(chore.nextDueDate)}</dd>
          </div>
          ${chore.reminderSnoozedUntil ? `
            <div>
              <dt>다시 알림 받을 날</dt>
              <dd>${formatKoreanDate(chore.reminderSnoozedUntil)}</dd>
            </div>
          ` : ""}
        </dl>
        <p class="detail-help">완료한 날을 기준으로 다음 일정을 자동으로 계산해드려요.</p>
        <div class="detail-actions">
          <button class="primary-button complete-button" type="button" data-action="complete-today">오늘 완료했어</button>
          <button class="secondary-button" type="button" data-action="snooze-tomorrow">내일 알려줘</button>
          <button class="text-button" type="button" data-action="show-reschedule">다른 날로 미룰게</button>
        </div>
        <form class="reschedule-panel" data-reschedule-form hidden>
          <label for="reschedule-date">새로운 예정일</label>
          <div class="reschedule-row">
            <input id="reschedule-date" name="rescheduleDate" type="date" min="${toDateOnly(new Date())}" required />
            <button class="primary-button reschedule-submit" type="submit">변경하기</button>
          </div>
        </form>
      </section>
    </main>`;

  app.querySelector("[data-route]").addEventListener("click", () => navigate("/"));
  app.querySelector("[data-action='complete-today']").addEventListener("click", () => {
    const completed = completeChore(chore, toDateOnly(new Date()));
    persistChore(completed);
    const [year, month] = completed.nextDueDate.split("-").map(Number);
    calendarMonth = new Date(year, month - 1, 1);
    navigate("/");
  });
  app.querySelector("[data-action='snooze-tomorrow']").addEventListener("click", () => {
    persistChore(snoozeReminder(chore, toDateOnly(new Date())));
    const [year, month] = chore.nextDueDate.split("-").map(Number);
    calendarMonth = new Date(year, month - 1, 1);
    navigate("/");
  });

  const reschedulePanel = app.querySelector("[data-reschedule-form]");
  app.querySelector("[data-action='show-reschedule']").addEventListener("click", () => {
    reschedulePanel.hidden = !reschedulePanel.hidden;
    if (!reschedulePanel.hidden) app.querySelector("#reschedule-date").focus();
  });
  reschedulePanel.addEventListener("submit", (event) => {
    event.preventDefault();
    const selectedDate = new FormData(reschedulePanel).get("rescheduleDate");
    const rescheduled = rescheduleChore(chore, selectedDate);
    persistChore(rescheduled);
    const [year, month] = rescheduled.nextDueDate.split("-").map(Number);
    calendarMonth = new Date(year, month - 1, 1);
    navigate("/");
  });
  if (new URLSearchParams(window.location.search).get("reschedule") === "1") {
    reschedulePanel.hidden = false;
    app.querySelector("#reschedule-date").focus();
  }
}

function createManagementState() {
  const existingById = new Map(loadChores().map((chore) => [chore.id, chore]));
  return CHORE_CATALOG.map((item) => {
    const existing = existingById.get(item.id);
    if (!existing) return null;
    return {
      ...item,
      selected: true,
      registered: true,
      expanded: false,
      intervalValue: existing?.intervalValue ?? item.recommendedIntervalValue,
      intervalUnit: existing?.intervalUnit ?? item.recommendedIntervalUnit,
      lastCompletedDate: existing?.lastCompletedDate ?? "",
      unknownLastCompletedDate: existing ? !existing.lastCompletedDate : false,
      firstDueDate: existing && !existing.lastCompletedDate ? existing.nextDueDate : "",
      createdAt: existing?.createdAt,
      reminderSnoozedUntil: existing?.reminderSnoozedUntil ?? null,
      isExample: existing?.isExample ?? false,
    };
  }).filter(Boolean);
}

function firstScheduleDate(action) {
  const today = new Date();
  if (action === "today") return toDateOnly(today);
  if (action === "weekend") {
    const daysUntilSaturday = (6 - today.getDay() + 7) % 7;
    return toDateOnly(addLocalDays(today, daysUntilSaturday));
  }
  return toDateOnly(addLocalDays(today, 7));
}

function draftNextDueDate(item) {
  if (item.unknownLastCompletedDate) return item.firstDueDate;
  if (!item.lastCompletedDate || !Number.isInteger(item.intervalValue) || item.intervalValue < 1) return "";
  try {
    return calculateNextDueDate(item.lastCompletedDate, item.intervalValue, item.intervalUnit);
  } catch {
    return "";
  }
}

function renderInlineScheduleFields(item) {
  const nextDueDate = draftNextDueDate(item);
  return `
    <div class="registration-inline-fields" aria-label="${item.name} 일정 입력">
      <section class="registration-inline-field">
        <div class="registration-inline-label">주기 <span>권장 ${item.recommendedIntervalValue}${UNIT_LABELS[item.recommendedIntervalUnit]}</span></div>
        <div class="registration-period-row">
          <input type="number" min="1" inputmode="numeric" value="${item.intervalValue}" data-field="intervalValue" aria-label="${item.name} 주기 숫자" />
          <select data-field="intervalUnit" aria-label="${item.name} 주기 단위">
            ${Object.entries(UNIT_LABELS).map(([value, label]) => `<option value="${value}"${item.intervalUnit === value ? " selected" : ""}>${label}</option>`).join("")}
          </select>
        </div>
      </section>
      <section class="registration-inline-field">
        <div class="registration-inline-label">최근 완료일
          <button class="registration-mode-toggle" type="button" data-action="${item.unknownLastCompletedDate ? "known-date" : "unknown-date"}">${item.unknownLastCompletedDate ? "날짜 입력" : "모름"}</button>
        </div>
        ${item.unknownLastCompletedDate
          ? `<input class="registration-date-input is-readonly" type="text" value="기억 안 남" aria-label="최근 완료일 기억 안 남" readonly />`
          : `<input class="registration-date-input" type="date" max="${toDateOnly(new Date())}" value="${item.lastCompletedDate}" data-field="lastCompletedDate" aria-label="${item.name} 최근 완료일" />`}
      </section>
      <section class="registration-inline-field">
        <div class="registration-inline-label">다음 예정일</div>
        ${item.unknownLastCompletedDate
          ? `<input class="registration-date-input" type="date" value="${item.firstDueDate}" data-field="firstDueDate" aria-label="${item.name} 첫 예정일" />`
          : `<input class="registration-date-input is-readonly" type="text" value="${nextDueDate}" placeholder="자동 계산" aria-label="${item.name} 자동 계산된 다음 예정일" readonly />`}
      </section>
    </div>`;
}

function renderManagementCard(item) {
  const marker = item.registered ? (item.expanded ? "⌃" : "⌄") : (item.selected ? "−" : "+");
  return `
    <article class="chore-card theme-${item.theme}${item.selected ? " is-selected" : ""}${item.registered ? " is-registered" : ""}" data-chore-id="${item.id}">
      <button class="chore-selector" type="button" data-action="toggle-chore" aria-expanded="${item.expanded}">
        <span class="selection-circle" aria-hidden="true">${marker}</span>
        <span class="chore-icon" aria-hidden="true">${item.icon}</span>
        <span class="chore-name">${item.name}</span>
        ${item.registered ? `<span class="registered-badge">관리 중</span>` : ""}
      </button>
      ${item.selected && item.expanded ? `
        <div class="chore-settings">
          ${renderInlineScheduleFields(item)}
          ${item.registered ? `<button class="delete-chore-button" type="button" data-action="delete-chore">이 목록에서 삭제</button>` : ""}
        </div>
      ` : ""}
    </article>`;
}

function renderManage() {
  const state = createManagementState();

  function paint() {
    app.innerHTML = `
      <main class="app-shell register-page">
        <header class="register-header">
          <button class="back-button" type="button" data-route="/" aria-label="메인 화면으로 돌아가기">‹</button>
          <h1>집안일 관리 목록</h1>
        </header>
        <p class="management-intro">관리할 항목을 누르면 일정 정보를 확인하고 수정할 수 있어요.</p>
        <form id="chore-form" novalidate>
          ${state.length > 0
            ? `<div class="chore-list">${state.map(renderManagementCard).join("")}</div>`
            : `<div class="empty-management"><span aria-hidden="true">📝</span><p>아직 관리 중인 집안일이 없어요.</p></div>`}
          <div class="register-footer-copy">
            <img src="${butlerImage}" alt="우리집 집사 캐릭터" />
            <p>현재 등록한 내용은 이 기기에 저장돼요.</p>
          </div>
          <p id="form-error" class="form-error" role="alert"></p>
          <div class="register-actions management-actions">
            <button class="primary-button submit-button" type="submit" ${state.length > 0 ? "" : "disabled"}>변경 내용 저장</button>
            <button class="manage-register-button" type="button" data-route="/register">+ 새 집안일 등록</button>
          </div>
        </form>
      </main>`;

    app.querySelectorAll("[data-route]").forEach((button) => {
      button.addEventListener("click", () => navigate(button.dataset.route));
    });
    app.querySelectorAll("[data-chore-id]").forEach((card) => {
      const item = state.find((candidate) => candidate.id === card.dataset.choreId);
      card.querySelector("[data-action='toggle-chore']").addEventListener("click", () => {
        if (item.registered) item.expanded = !item.expanded;
        else {
          item.selected = !item.selected;
          item.expanded = item.selected;
        }
        paint();
      });
      if (!item.selected || !item.expanded) return;

      card.querySelectorAll("[data-field]").forEach((field) => {
        field.addEventListener("change", () => {
          item[field.dataset.field] = field.dataset.field === "intervalValue" ? Number(field.value) : field.value;
          paint();
        });
      });
      card.querySelectorAll("[data-action='quick-interval']").forEach((button) => {
        button.addEventListener("click", () => {
          item.intervalValue = Number(button.dataset.value);
          paint();
        });
      });
      card.querySelector("[data-action='known-date']")?.addEventListener("click", () => {
        item.unknownLastCompletedDate = false;
        item.firstDueDate = "";
        paint();
      });
      card.querySelector("[data-action='unknown-date']")?.addEventListener("click", () => {
        item.unknownLastCompletedDate = true;
        item.lastCompletedDate = "";
        paint();
      });
      card.querySelectorAll("[data-action='first-date']").forEach((button) => {
        button.addEventListener("click", () => {
          item.firstDueDate = firstScheduleDate(button.dataset.value);
          paint();
        });
      });
      card.querySelector("[data-action='delete-chore']")?.addEventListener("click", () => {
        if (!window.confirm(`${item.name}을(를) 관리 목록에서 삭제할까요?`)) return;
        persistChores(loadChores().filter((chore) => chore.id !== item.id));
        state.splice(state.indexOf(item), 1);
        paint();
      });
    });

    app.querySelector("#chore-form").addEventListener("submit", (event) => {
      event.preventDefault();
      const selected = state.filter((item) => item.selected);
      const incomplete = selected.find((item) => (
        !Number.isInteger(item.intervalValue)
        || item.intervalValue < 1
        || (item.unknownLastCompletedDate ? !item.firstDueDate : !item.lastCompletedDate)
      ));
      if (incomplete) {
        app.querySelector("#form-error").textContent = `${incomplete.name}의 ${incomplete.unknownLastCompletedDate ? "첫 예정일" : "최근 완료일"}을 입력해 주세요.`;
        return;
      }

      const existing = loadChores();
      const existingById = new Map(existing.map((chore) => [chore.id, chore]));
      const created = selected.map((item) => {
        const lastCompletedDate = item.unknownLastCompletedDate ? null : item.lastCompletedDate;
        const nextDueDate = item.unknownLastCompletedDate ? item.firstDueDate : calculateNextDueDate(lastCompletedDate, item.intervalValue, item.intervalUnit);
        const existingChore = existingById.get(item.id);
        const scheduleUnchanged = existingChore
          && existingChore.intervalValue === item.intervalValue
          && existingChore.intervalUnit === item.intervalUnit
          && existingChore.lastCompletedDate === lastCompletedDate
          && existingChore.nextDueDate === nextDueDate;
        return createChore({
          id: item.id,
          name: item.name,
          intervalValue: item.intervalValue,
          intervalUnit: item.intervalUnit,
          lastCompletedDate,
          nextDueDate,
          reminderSnoozedUntil: scheduleUnchanged ? existingChore.reminderSnoozedUntil : null,
          isActive: true,
          isExample: item.isExample,
          createdAt: item.createdAt,
        });
      });
      const selectedIds = new Set(created.map((chore) => chore.id));
      persistChores([...existing.filter((chore) => !selectedIds.has(chore.id)), ...created]);
      const earliestDueDate = created.map((chore) => chore.nextDueDate).sort()[0];
      if (earliestDueDate) {
        const [year, month] = earliestDueDate.split("-").map(Number);
        calendarMonth = new Date(year, month - 1, 1);
      }
      navigate("/");
    });
  }

  paint();
}

function createRegistrationState() {
  return CHORE_CATALOG.map((item) => ({
    ...item,
    selected: false,
    intervalValue: item.recommendedIntervalValue,
    intervalUnit: item.recommendedIntervalUnit,
    lastCompletedDate: "",
    unknownLastCompletedDate: false,
    firstDueDate: "",
  }));
}

function renderChoreCard(item) {
  return `
    <article class="chore-card${item.selected ? " is-selected" : ""}" data-chore-id="${item.id}">
      <button class="chore-selector" type="button" data-action="toggle-chore" aria-pressed="${item.selected}">
        <span class="selection-circle" aria-hidden="true">${item.selected ? "✓" : ""}</span>
        <span class="chore-icon" aria-hidden="true">${item.icon}</span>
        <span>${item.name}</span>
      </button>
      ${item.selected ? `
        <div class="chore-settings">
          ${renderInlineScheduleFields(item)}
        </div>
      ` : ""}
    </article>`;
}

function renderRegister() {
  const state = createRegistrationState();

  function paint() {
    app.innerHTML = `
      <main class="app-shell register-page">
        <header class="register-header">
          <button class="back-button" type="button" data-route="/" aria-label="메인 화면으로 돌아가기">‹</button>
          <h1>집사가 기억해둘 일을 골라주세요.</h1>
        </header>
        <form id="chore-form" novalidate>
          <div class="chore-list registration-chore-list">${state.map(renderChoreCard).join("")}</div>
          <div class="register-footer-copy">
            <img src="${butlerImage}" alt="우리집 집사 캐릭터" />
            <p>현재 등록한 내용은 이 기기에 저장돼요.</p>
          </div>
          <p id="form-error" class="form-error" role="alert"></p>
          <div class="register-actions">
            <button class="primary-button submit-button" type="submit" ${state.some((item) => item.selected) ? "" : "disabled"}>집사에게 맡기기</button>
          </div>
        </form>
      </main>`;

    app.querySelector("[data-route]").addEventListener("click", () => navigate("/"));
    app.querySelectorAll("[data-chore-id]").forEach((card) => {
      const item = state.find((candidate) => candidate.id === card.dataset.choreId);
      card.querySelector("[data-action='toggle-chore']").addEventListener("click", () => {
        item.selected = !item.selected;
        paint();
      });
      if (!item.selected) return;

      card.querySelectorAll("[data-field]").forEach((field) => {
        field.addEventListener("change", () => {
          item[field.dataset.field] = field.dataset.field === "intervalValue" ? Number(field.value) : field.value;
          paint();
        });
      });
      card.querySelectorAll("[data-action='quick-interval']").forEach((button) => {
        button.addEventListener("click", () => {
          item.intervalValue = Number(button.dataset.value);
          paint();
        });
      });
      card.querySelector("[data-action='known-date']")?.addEventListener("click", () => {
        item.unknownLastCompletedDate = false;
        item.firstDueDate = "";
        paint();
      });
      card.querySelector("[data-action='unknown-date']")?.addEventListener("click", () => {
        item.unknownLastCompletedDate = true;
        item.lastCompletedDate = "";
        paint();
      });
      card.querySelectorAll("[data-action='first-date']").forEach((button) => {
        button.addEventListener("click", () => {
          item.firstDueDate = firstScheduleDate(button.dataset.value);
          paint();
        });
      });
    });

    app.querySelector("#chore-form").addEventListener("submit", (event) => {
      event.preventDefault();
      const selected = state.filter((item) => item.selected);
      const incomplete = selected.find((item) => (
        !Number.isInteger(item.intervalValue)
        || item.intervalValue < 1
        || (item.unknownLastCompletedDate ? !item.firstDueDate : !item.lastCompletedDate)
      ));
      if (incomplete) {
        app.querySelector("#form-error").textContent = `${incomplete.name}의 ${incomplete.unknownLastCompletedDate ? "첫 예정일" : "최근 완료일"}을 입력해 주세요.`;
        return;
      }

      const existing = loadChores();
      const existingById = new Map(existing.map((chore) => [chore.id, chore]));
      const created = selected.map((item) => {
        const lastCompletedDate = item.unknownLastCompletedDate ? null : item.lastCompletedDate;
        const nextDueDate = item.unknownLastCompletedDate ? item.firstDueDate : calculateNextDueDate(lastCompletedDate, item.intervalValue, item.intervalUnit);
        return createChore({
          id: item.id,
          name: item.name,
          intervalValue: item.intervalValue,
          intervalUnit: item.intervalUnit,
          lastCompletedDate,
          nextDueDate,
          reminderSnoozedUntil: null,
          isActive: true,
          createdAt: existingById.get(item.id)?.createdAt,
        });
      });
      const selectedIds = new Set(created.map((chore) => chore.id));
      persistChores([...existing.filter((chore) => !selectedIds.has(chore.id)), ...created]);
      const earliestDueDate = created.map((chore) => chore.nextDueDate).sort()[0];
      if (earliestDueDate) {
        const [year, month] = earliestDueDate.split("-").map(Number);
        calendarMonth = new Date(year, month - 1, 1);
      }
      navigate("/");
    });
  }

  paint();
}

function renderRoute() {
  const detailMatch = window.location.pathname.match(/^\/chores\/([^/]+)$/);
  if (window.location.pathname === "/register") renderRegister();
  else if (window.location.pathname === "/manage") renderManage();
  else if (detailMatch) renderChoreDetail(decodeURIComponent(detailMatch[1]));
  else renderHome();
}

function showStartupSplash() {
  const splash = document.createElement("div");
  splash.className = "daily-splash";
  splash.setAttribute("role", "status");
  splash.setAttribute("aria-label", "우리집 집사 시작 화면");
  splash.innerHTML = `
    <div class="daily-splash-content">
      <img src="${butlerImage}" alt="" />
      <h1>우리집 집사</h1>
      <p>오늘도 제가 잘 챙겨드릴게요.</p>
    </div>`;
  document.body.append(splash);
  requestAnimationFrame(() => splash.classList.add("is-visible"));
  window.setTimeout(() => splash.classList.add("is-leaving"), 900);
  window.setTimeout(() => splash.remove(), 1_200);
}

window.addEventListener("popstate", renderRoute);
const startupPath = getStartupPath(window.location.pathname);
if (startupPath !== window.location.pathname) {
  window.history.replaceState({}, "", startupPath);
}
renderRoute();
showStartupSplash();

async function refreshChoresFromPushServer() {
  try {
    const serverChores = await loadChoresFromPushServer();
    if (!serverChores) {
      if (loadChores().length > 0) syncCurrentChores();
      return;
    }
    saveChores(serverChores);
    renderRoute();
  } catch (error) {
    console.warn("Push 서버 데이터 확인 실패:", error.message);
  }
}

async function initializePushIntegration() {
  await registerPushServiceWorker().catch(() => null);
  await refreshChoresFromPushServer();
  await restorePushRegistration(loadChores());
}

initializePushIntegration();
window.addEventListener("focus", refreshChoresFromPushServer);
navigator.serviceWorker?.addEventListener("message", (event) => {
  if (event.data?.type !== "PUSH_CHORE_UPDATED" || !event.data.chore) return;
  updateChore(event.data.chore);
  renderRoute();
});
