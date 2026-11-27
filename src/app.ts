import { playChime, primeAudio } from "./audio";
import {
  countByTask,
  dayLabel,
  formatSpent,
  localZone,
  todayTotalMs,
  weekTotals,
  weekdayShort,
  type FocusSession,
} from "./history";
import {
  cleanSettings,
  DEFAULT_SETTINGS,
  durationsOf,
  type Settings,
  type Theme,
} from "./settings";
import { allowNotifications, notificationsGranted, notificationsSupported, sendNotice } from "./notify";
import { loadSnapshot, saveSnapshot, TASK_LIMIT, type Snapshot, type Task } from "./storage";
import {
  applyDurations,
  completeIfDue,
  createTimer,
  formatClock,
  phaseName,
  reset,
  skip,
  timeLeft,
  toggle,
  type Completion,
  type TimerState,
} from "./timer";
import { createView, type HistoryDay } from "./view";

export function mount(root: HTMLElement, storage: Storage = localStorage): void {
  const saved = loadSnapshot(storage);
  let theme: Theme = saved?.theme ?? "system";
  let settings: Settings = saved?.settings ?? { ...DEFAULT_SETTINGS };
  let timer: TimerState = saved?.timer ?? createTimer(durationsOf(settings));
  let tasks: Task[] = saved?.tasks ?? [];
  let currentTaskId = saved?.currentTaskId ?? null;
  let sessions: FocusSession[] = saved?.sessions ?? [];
  let intervalId = 0;
  let timeoutId = 0;
  let notifyRequest = 0;
  let chimeWhenVisible = false;

  const view = createView(root, {
    onToggle: viewToggle,
    onSkip: viewSkip,
    onReset: viewReset,
    onTheme(next) {
      theme = next;
      applyTheme(theme);
      persist();
    },
    onDurations(patch) {
      const next = cleanSettings({ ...settings, ...patch });
      if (!next) {
        view.paintSettings(settings, theme);
        return;
      }
      settings = next;
      timer = applyDurations(timer, durationsOf(settings));
      paintAll();
      persist();
    },
    onAddTask(title) {
      const name = title.trim().replace(/\s+/g, " ").slice(0, 80);
      if (!name) return;
      if (tasks.length >= TASK_LIMIT) {
        view.setTaskHint("Remove a task to add another.");
        return;
      }
      const task: Task = { id: crypto.randomUUID(), title: name, createdAt: Date.now() };
      tasks = [...tasks, task];
      currentTaskId = task.id;
      view.clearTaskTitle();
      view.setTaskHint("");
      paintTasks();
      persist();
    },
    onSelectTask(id) {
      currentTaskId = id;
      paintTasks();
      persist();
    },
    onRemoveTask(id) {
      tasks = tasks.filter((task) => task.id !== id);
      if (currentTaskId === id) currentTaskId = null;
      view.setTaskHint("");
      paintTasks();
      persist();
    },
    onNotify(enabled) {
      void setNotify(enabled);
    },
  });

  applyTheme(theme);
  const notifyHint = reconcileNotify();
  const caughtUp = completeIfDue(timer, Date.now(), durationsOf(settings));
  if (caughtUp.done) {
    timer = caughtUp.state;
    record(caughtUp.done);
  }
  paintAll();
  if (notifyHint) {
    view.setNotifyHint(notifyHint);
    persist();
  }
  if (caughtUp.done) signal(caughtUp.done);

  arm();
  window.addEventListener("pointerdown", () => primeAudio());
  window.addEventListener("keydown", () => primeAudio());
  window.addEventListener("keydown", onKey);
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("pagehide", persist);
  window.addEventListener("pageshow", onReturn);
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (theme === "system") applyTheme("system");
  });

  function settle(now: number): boolean {
    const result = completeIfDue(timer, now, durationsOf(settings));
    if (!result.done) return false;
    timer = result.state;
    record(result.done);
    paintAll();
    signal(result.done);
    return true;
  }

  function record(done: Completion) {
    if (!done.focusMs) return;
    sessions = [
      ...sessions,
      {
        id: crypto.randomUUID(),
        endedAt: done.endedAt,
        durationMs: done.focusMs,
        taskId: currentTaskId,
      },
    ];
  }

  function afterControl(message: string) {
    paintAll();
    view.announce(message);
    persist();
    arm();
  }

  function paintAll() {
    paintClock();
    view.paintPhase(phaseName(timer.phase), cycleText(), timer.status === "running");
    view.paintSettings(settings, theme);
    paintTasks();
    paintHistory(Date.now());
  }

  function paintClock() {
    const left = timeLeft(timer, Date.now());
    const text = formatClock(left);
    document.title = `${text} · ${phaseName(timer.phase)}`;
    view.paintClock(text, timer.plannedMs > 0 ? left / timer.plannedMs : 0);
  }

  function paintTasks() {
    const counts = countByTask(sessions);
    view.paintTasks(
      tasks.map((task) => ({
        id: task.id,
        title: task.title,
        count: counts.get(task.id) ?? 0,
        selected: task.id === currentTaskId,
      })),
    );
  }

  function paintHistory(now: number) {
    const zone = localZone();
    const days = weekTotals(sessions, now, zone);
    const max = days.reduce((peak, day) => Math.max(peak, day.durationMs), 0);
    const bars: HistoryDay[] = days.map((day) => ({
      label: weekdayShort(day.date),
      detail: dayLabel(day.date),
      spent: formatSpent(day.durationMs),
      sessions: day.sessions,
      ratio: max > 0 ? day.durationMs / max : 0,
      today: day.date === days[days.length - 1]?.date,
    }));
    view.paintHistory(bars, formatSpent(todayTotalMs(sessions, now, zone)));
  }

  function cycleText(): string {
    const every = settings.sessionsBeforeLongBreak;
    const next = timer.completedInCycle + 1;
    if (timer.phase === "focus") return `${next} of ${every}`;
    return `Next focus, ${next} of ${every}`;
  }

  function persist() {
    const snapshot: Snapshot = {
      version: 1,
      theme,
      settings,
      timer,
      tasks,
      currentTaskId,
      sessions,
    };
    saveSnapshot(storage, snapshot);
  }

  function arm() {
    window.clearInterval(intervalId);
    window.clearTimeout(timeoutId);
    intervalId = window.setInterval(tick, 250);
    if (timer.status === "running" && timer.endsAt !== null) {
      timeoutId = window.setTimeout(tick, Math.max(0, timer.endsAt - Date.now()));
    }
  }

  function tick() {
    if (!settle(Date.now())) paintClock();
  }

  function onReturn() {
    if (!settle(Date.now())) paintClock();
  }

  function onVisibility() {
    if (document.visibilityState === "hidden") {
      persist();
      return;
    }
    onReturn();
    if (chimeWhenVisible) {
      chimeWhenVisible = false;
      playChime();
    }
  }

  function signal(done: Completion) {
    view.announce(completionText(done, timer));
    try {
      // A hidden tab often cannot play audio until it is visible again.
      if (document.visibilityState === "visible") playChime();
      else chimeWhenVisible = true;
      if (settings.notify) {
        const note = noticeCopy(done, timer);
        sendNotice(note.title, note.body);
      }
    } finally {
      persist();
      arm();
    }
  }

  async function setNotify(enabled: boolean) {
    const request = ++notifyRequest;
    if (!enabled) {
      settings = { ...settings, notify: false };
      view.setNotifyHint("");
      persist();
      return;
    }
    if (!notificationsSupported()) {
      settings = { ...settings, notify: false };
      view.paintSettings(settings, theme);
      view.setNotifyHint("This browser doesn't support notifications.");
      persist();
      return;
    }
    const allowed = await allowNotifications();
    if (request !== notifyRequest) return;
    settings = { ...settings, notify: allowed };
    view.paintSettings(settings, theme);
    view.setNotifyHint(allowed ? "" : "Notifications are blocked for this site.");
    persist();
  }

  function reconcileNotify(): string {
    if (!settings.notify) return "";
    if (!notificationsSupported()) {
      settings = { ...settings, notify: false };
      return "This browser doesn't support notifications.";
    }
    if (!notificationsGranted()) {
      settings = { ...settings, notify: false };
      return Notification.permission === "denied"
        ? "Notifications are blocked for this site."
        : "Turn notifications on again to allow them.";
    }
    return "";
  }

  function onKey(event: KeyboardEvent) {
    if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
    if (isTextField(event.target)) return;
    if (event.key === " " || event.code === "Space") {
      if (isCheckable(event.target)) return;
      event.preventDefault();
      viewToggle();
      return;
    }
    if (event.key === "s" || event.key === "S") {
      event.preventDefault();
      viewSkip();
      return;
    }
    if (event.key === "r" || event.key === "R") {
      event.preventDefault();
      viewReset();
    }
  }

  function viewToggle() {
    const now = Date.now();
    if (settle(now)) return;
    timer = toggle(timer, now);
    afterControl(timer.status === "running" ? "Started." : "Paused.");
  }

  function viewSkip() {
    const now = Date.now();
    if (settle(now)) return;
    timer = skip(timer, durationsOf(settings));
    afterControl(`${phaseName(timer.phase)}. ${formatClock(timeLeft(timer, now))}.`);
  }

  function viewReset() {
    const now = Date.now();
    if (settle(now)) return;
    timer = reset(timer, durationsOf(settings));
    afterControl("Reset.");
  }
}

function noticeCopy(done: Completion, next: TimerState): { title: string; body: string } {
  if (done.phase === "focus") {
    return {
      title: "Focus complete",
      body: next.phase === "longBreak" ? "Time for a long break." : "Time for a short break.",
    };
  }
  if (done.phase === "shortBreak") return { title: "Break over", body: "Ready for the next focus." };
  return { title: "Long break over", body: "Ready for the next focus." };
}

function completionText(done: Completion, next: TimerState): string {
  if (done.phase === "focus") {
    return next.phase === "longBreak" ? "Focus complete. Long break." : "Focus complete. Short break.";
  }
  if (done.phase === "shortBreak") return "Short break over.";
  return "Long break over.";
}

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  const dark =
    theme === "dark" ||
    (theme !== "light" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  // Keep in step with the background tokens in style.css.
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#191816" : "#f3f0e8");
}

function isCheckable(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement && (target.type === "checkbox" || target.type === "radio");
}

function isTextField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  if (!(target instanceof HTMLInputElement)) return false;
  return ["text", "search", "number", "email", "url", "password", "tel"].includes(target.type);
}
