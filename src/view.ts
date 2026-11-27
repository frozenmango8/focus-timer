import type { Settings, Theme } from "./settings";

export interface TaskRow {
  id: string;
  title: string;
  count: number;
  selected: boolean;
}

export interface HistoryDay {
  label: string;
  detail: string;
  spent: string;
  sessions: number;
  /** Share of the busiest day, from 0 to 1. */
  ratio: number;
  today: boolean;
}

export interface Handlers {
  onToggle: () => void;
  onSkip: () => void;
  onReset: () => void;
  onTheme: (theme: Theme) => void;
  onDurations: (patch: Partial<Settings>) => void;
  onAddTask: (title: string) => void;
  onSelectTask: (id: string | null) => void;
  onRemoveTask: (id: string) => void;
  onNotify: (enabled: boolean) => void;
}

export interface View {
  paintClock: (text: string, ratio: number) => void;
  paintPhase: (phase: string, cycle: string, running: boolean) => void;
  paintSettings: (settings: Settings, theme: Theme) => void;
  paintTasks: (rows: TaskRow[]) => void;
  paintHistory: (days: HistoryDay[], todaySpent: string) => void;
  setTaskHint: (text: string) => void;
  setNotifyHint: (text: string) => void;
  announce: (text: string) => void;
  clearTaskTitle: () => void;
}

export function createView(root: HTMLElement, handlers: Handlers): View {
  root.innerHTML = markup();

  const time = byId<HTMLElement>(root, "time");
  const phase = byId<HTMLElement>(root, "phase");
  const cycle = byId<HTMLElement>(root, "cycle");
  const track = byId<HTMLElement>(root, "track");
  const fill = byId<HTMLElement>(root, "fill");
  const toggle = byId<HTMLButtonElement>(root, "toggle");
  const theme = byId<HTMLSelectElement>(root, "theme");
  const focusMin = byId<HTMLInputElement>(root, "focus-min");
  const shortMin = byId<HTMLInputElement>(root, "short-min");
  const longMin = byId<HTMLInputElement>(root, "long-min");
  const cycleLength = byId<HTMLInputElement>(root, "cycle-length");
  const taskForm = byId<HTMLFormElement>(root, "add-task");
  const taskTitle = byId<HTMLInputElement>(root, "task-title");
  const taskList = byId<HTMLUListElement>(root, "tasks");
  const taskHint = byId<HTMLElement>(root, "task-hint");
  const notify = byId<HTMLInputElement>(root, "notify");
  const notifyHint = byId<HTMLElement>(root, "notify-hint");
  const todayTotal = byId<HTMLElement>(root, "today-total");
  const chart = byId<HTMLElement>(root, "chart");
  const weekBody = byId<HTMLElement>(root, "week-body");
  const live = byId<HTMLElement>(root, "live");

  toggle.addEventListener("click", handlers.onToggle);
  byId<HTMLButtonElement>(root, "skip").addEventListener("click", handlers.onSkip);
  byId<HTMLButtonElement>(root, "reset").addEventListener("click", handlers.onReset);

  theme.addEventListener("change", () => {
    const value = theme.value;
    if (value === "light" || value === "dark" || value === "system") handlers.onTheme(value);
  });

  bindDuration(focusMin, "focusMin");
  bindDuration(shortMin, "shortBreakMin");
  bindDuration(longMin, "longBreakMin");
  bindDuration(cycleLength, "sessionsBeforeLongBreak");
  notify.addEventListener("change", () => handlers.onNotify(notify.checked));

  taskForm.addEventListener("submit", (event) => {
    event.preventDefault();
    handlers.onAddTask(taskTitle.value);
  });

  taskList.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || target.name !== "task") return;
    handlers.onSelectTask(target.value.length > 0 ? target.value : null);
  });

  taskList.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLButtonElement)) return;
    const id = target.dataset.remove;
    if (!id) return;
    handlers.onRemoveTask(id);
  });

  return {
    paintClock(text, ratio) {
      const clamped = Math.min(1, Math.max(0, ratio));
      time.textContent = text;
      fill.style.transform = `scaleX(${clamped})`;
      track.setAttribute("aria-valuenow", String(Math.round(clamped * 100)));
      track.setAttribute("aria-valuetext", text);
    },
    paintPhase(nextPhase, nextCycle, running) {
      phase.textContent = nextPhase;
      cycle.textContent = nextCycle;
      toggle.textContent = running ? "Pause" : "Start";
      toggle.setAttribute("aria-pressed", running ? "true" : "false");
    },
    paintSettings(settings, nextTheme) {
      setNumber(focusMin, settings.focusMin);
      setNumber(shortMin, settings.shortBreakMin);
      setNumber(longMin, settings.longBreakMin);
      setNumber(cycleLength, settings.sessionsBeforeLongBreak);
      if (theme.value !== nextTheme) theme.value = nextTheme;
      notify.checked = settings.notify;
    },
    paintTasks(rows) {
      const focusKey = focusedKey(taskList);
      taskList.replaceChildren();
      if (rows.length === 0) {
        const empty = document.createElement("li");
        empty.className = "empty";
        empty.textContent = "No tasks yet.";
        taskList.append(empty);
        if (focusKey?.startsWith("remove:")) {
          document.querySelector<HTMLElement>("#task-title")?.focus();
        }
        return;
      }

      taskList.append(taskRow(null, "No task", null, rows.every((row) => !row.selected)));
      for (const row of rows) taskList.append(taskRow(row.id, row.title, row.count, row.selected));
      restoreFocus(taskList, focusKey);
    },
    paintHistory(days, todaySpent) {
      todayTotal.textContent = todaySpent;
      chart.replaceChildren();
      weekBody.replaceChildren();
      for (const day of days) {
        chart.append(bar(day));
        weekBody.append(weekRow(day));
      }
    },
    setTaskHint(text) {
      taskHint.textContent = text;
    },
    setNotifyHint(text) {
      notifyHint.textContent = text;
    },
    announce(text) {
      live.textContent = "";
      window.setTimeout(() => {
        live.textContent = text;
      }, 30);
    },
    clearTaskTitle() {
      taskTitle.value = "";
    },
  };

  function bindDuration(
    input: HTMLInputElement,
    key: "focusMin" | "shortBreakMin" | "longBreakMin" | "sessionsBeforeLongBreak",
  ) {
    input.addEventListener("change", () => {
      handlers.onDurations({ [key]: input.valueAsNumber });
    });
    input.addEventListener(
      "wheel",
      (event) => {
        if (document.activeElement === input) event.preventDefault();
      },
      { passive: false },
    );
  }
}

function markup(): string {
  return `
    <div class="layout">
      <header class="top">
        <h1 class="mark">Focus <span>timer</span></h1>
        <label class="theme">Theme
          <select id="theme">
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </label>
      </header>
      <section class="timer" aria-labelledby="phase">
        <div class="phase-row">
          <p class="phase" id="phase">Focus</p>
          <p class="cycle" id="cycle">1 of 4</p>
        </div>
        <p class="time" id="time" role="timer">25:00</p>
        <div class="track" id="track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="100" aria-label="Time remaining">
          <span id="fill"></span>
        </div>
        <div class="controls" role="group" aria-label="Timer controls" aria-describedby="shortcuts">
          <button type="button" class="primary" id="toggle" aria-pressed="false" aria-keyshortcuts="Space">Start</button>
          <button type="button" id="skip" aria-keyshortcuts="S">Skip</button>
          <button type="button" id="reset" aria-keyshortcuts="R">Reset</button>
        </div>
        <p class="keys" id="shortcuts">Space starts or pauses. S skips. R resets.</p>
        <div class="settings">
          <label class="field" for="focus-min"><span>Focus</span>
            <span class="entry"><input id="focus-min" type="number" min="1" max="180" step="1" inputmode="numeric" autocomplete="off" value="25"><span>min</span></span>
          </label>
          <label class="field" for="short-min"><span>Short break</span>
            <span class="entry"><input id="short-min" type="number" min="1" max="60" step="1" inputmode="numeric" autocomplete="off" value="5"><span>min</span></span>
          </label>
          <label class="field" for="long-min"><span>Long break</span>
            <span class="entry"><input id="long-min" type="number" min="1" max="60" step="1" inputmode="numeric" autocomplete="off" value="15"><span>min</span></span>
          </label>
          <label class="field span" for="cycle-length"><span>Long break after</span>
            <span class="entry"><input id="cycle-length" type="number" min="1" max="12" step="1" inputmode="numeric" autocomplete="off" value="4"><span>focus sessions</span></span>
          </label>
        </div>
        <label class="check">
          <input id="notify" type="checkbox">
          Notify when a phase ends
        </label>
        <p class="note" id="notify-hint" role="status"></p>
        <p class="sr" id="live" aria-live="polite"></p>
      </section>
      <div class="side">
        <section aria-labelledby="tasks-heading">
          <h2 id="tasks-heading">Tasks</h2>
          <p class="lede">Select a task to credit finished focus sessions to it.</p>
          <form id="add-task" class="add" autocomplete="off">
            <label class="sr" for="task-title">New task</label>
            <input id="task-title" type="text" maxlength="80" placeholder="Add a task" spellcheck="false">
            <button type="submit">Add</button>
          </form>
          <ul class="task-list" id="tasks"></ul>
          <p class="note" id="task-hint" role="status"></p>
        </section>
        <section aria-labelledby="history-heading">
          <h2 id="history-heading">History</h2>
          <p class="today"><span>Today</span> <strong id="today-total">0m</strong></p>
          <h3 id="week-heading">Last 7 days</h3>
          <div class="chart" id="chart" aria-hidden="true"></div>
          <table class="sr">
            <caption>Focus time for the last 7 days</caption>
            <thead><tr><th>Day</th><th>Time</th><th>Sessions</th></tr></thead>
            <tbody id="week-body"></tbody>
          </table>
        </section>
      </div>
    </div>
  `;
}

function taskRow(id: string | null, title: string, count: number | null, selected: boolean): HTMLLIElement {
  const item = document.createElement("li");
  item.className = "task";

  const label = document.createElement("label");
  label.className = "choice";
  const input = document.createElement("input");
  input.type = "radio";
  input.name = "task";
  input.value = id ?? "";
  input.checked = selected;
  input.dataset.focus = id ? `task:${id}` : "task:none";
  const name = document.createElement("span");
  name.className = "name";
  name.textContent = title;
  label.append(input, name);

  if (count !== null) {
    const sessions = document.createElement("span");
    sessions.className = "count";
    sessions.textContent = String(count);
    const unit = document.createElement("span");
    unit.className = "sr";
    unit.textContent = count === 1 ? " session" : " sessions";
    sessions.append(unit);
    label.append(sessions);
  }

  item.append(label);
  if (id) {
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "quiet";
    remove.dataset.remove = id;
    remove.dataset.focus = `remove:${id}`;
    remove.textContent = "Remove";
    remove.setAttribute("aria-label", `Remove ${title}`);
    item.append(remove);
  }
  return item;
}

function bar(day: HistoryDay): HTMLDivElement {
  const col = document.createElement("div");
  col.className = "col";
  if (day.today) col.dataset.today = "true";
  col.title = `${day.detail}, ${day.spent}`;

  const plot = document.createElement("div");
  plot.className = "plot";
  const level = document.createElement("span");
  level.className = "level";
  level.style.height = day.ratio > 0 ? `max(2px, ${day.ratio * 100}%)` : "0";
  plot.append(level);

  const label = document.createElement("span");
  label.className = "wd";
  label.textContent = day.label;
  col.append(plot, label);
  return col;
}

function weekRow(day: HistoryDay): HTMLTableRowElement {
  const row = document.createElement("tr");
  const head = document.createElement("th");
  head.scope = "row";
  head.textContent = day.today ? `${day.detail} (today)` : day.detail;
  const time = document.createElement("td");
  time.textContent = day.spent;
  const sessions = document.createElement("td");
  sessions.textContent = String(day.sessions);
  row.append(head, time, sessions);
  return row;
}

function focusedKey(list: HTMLElement): string | null {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement) || !list.contains(active)) return null;
  return active.dataset.focus ?? null;
}

function restoreFocus(list: HTMLElement, key: string | null) {
  if (!key) return;
  const next = list.querySelector<HTMLElement>(`[data-focus="${CSS.escape(key)}"]`);
  if (next) {
    next.focus();
    return;
  }
  if (key.startsWith("remove:")) {
    document.querySelector<HTMLElement>("#task-title")?.focus();
  }
}

function setNumber(input: HTMLInputElement, value: number) {
  const text = String(value);
  if (input.value !== text) input.value = text;
}

function byId<T extends HTMLElement>(root: ParentNode, id: string): T {
  const found = root.querySelector(`#${id}`);
  if (!(found instanceof HTMLElement)) throw new Error(`Missing #${id}`);
  return found as T;
}
