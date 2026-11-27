import type { FocusSession } from "./history";
import { durationsOf, settingsFromUnknown, themeFromUnknown, type Settings, type Theme } from "./settings";
import { createTimer, type Phase, type Status, type TimerState } from "./timer";

export interface Task {
  id: string;
  title: string;
  createdAt: number;
}

export interface Snapshot {
  version: 1;
  theme: Theme;
  settings: Settings;
  timer: TimerState;
  tasks: Task[];
  currentTaskId: string | null;
  sessions: FocusSession[];
}

const KEY = "focus-timer";
export const TASK_LIMIT = 50;
const SESSION_LIMIT = 1000;

const PHASES: readonly Phase[] = ["focus", "shortBreak", "longBreak"];
const STATUSES: readonly Status[] = ["idle", "running", "paused"];

export function loadSnapshot(storage: Pick<Storage, "getItem">): Snapshot | null {
  try {
    return parseSnapshot(storage.getItem(KEY));
  } catch {
    return null;
  }
}

export function saveSnapshot(storage: Pick<Storage, "setItem">, snapshot: Snapshot): void {
  const trimmed: Snapshot = {
    ...snapshot,
    tasks: snapshot.tasks.slice(0, TASK_LIMIT),
    sessions: snapshot.sessions.slice(-SESSION_LIMIT),
  };
  try {
    storage.setItem(KEY, JSON.stringify(trimmed));
  } catch {
    // Private mode and a full disk both throw. The timer still runs.
  }
}

export function parseSnapshot(raw: string | null): Snapshot | null {
  if (!raw) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!value || typeof value !== "object") return null;
  const data = value as Record<string, unknown>;
  if (data.version !== 1) return null;

  const settings = settingsFromUnknown(data.settings);
  const tasks = parseTasks(data.tasks);
  const requestedTask = typeof data.currentTaskId === "string" ? data.currentTaskId : null;
  return {
    version: 1,
    theme: themeFromUnknown(data.theme),
    settings,
    timer: parseTimer(data.timer, settings),
    tasks,
    currentTaskId: tasks.some((task) => task.id === requestedTask) ? requestedTask : null,
    sessions: parseSessions(data.sessions).slice(-SESSION_LIMIT),
  };
}

function parseTimer(value: unknown, settings: Settings): TimerState {
  const fallback = createTimer(durationsOf(settings));
  if (!value || typeof value !== "object") return fallback;
  const record = value as Record<string, unknown>;
  if (!PHASES.includes(record.phase as Phase) || !STATUSES.includes(record.status as Status)) {
    return fallback;
  }
  const plannedMs = finite(record.plannedMs);
  const remainingMs = finite(record.remainingMs);
  if (plannedMs === null || remainingMs === null) return fallback;
  if (typeof record.completedInCycle !== "number" || !Number.isInteger(record.completedInCycle)) {
    return fallback;
  }

  const status = record.status as Status;
  const running = status === "running" && typeof record.endsAt === "number" && Number.isFinite(record.endsAt);
  return {
    status: status === "running" && !running ? "paused" : status,
    phase: record.phase as Phase,
    plannedMs,
    remainingMs,
    endsAt: running ? (record.endsAt as number) : null,
    completedInCycle: Math.max(0, record.completedInCycle),
  };
}

function parseTasks(value: unknown): Task[] {
  if (!Array.isArray(value)) return [];
  const tasks: Task[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    if (typeof record.id !== "string" || record.id.length === 0) continue;
    if (typeof record.title !== "string") continue;
    const title = record.title.trim().replace(/\s+/g, " ").slice(0, 80);
    if (!title) continue;
    const createdAt = typeof record.createdAt === "number" && Number.isFinite(record.createdAt) ? record.createdAt : 0;
    tasks.push({ id: record.id, title, createdAt });
    if (tasks.length >= TASK_LIMIT) break;
  }
  return tasks;
}

function parseSessions(value: unknown): FocusSession[] {
  if (!Array.isArray(value)) return [];
  const sessions: FocusSession[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    if (typeof record.id !== "string" || record.id.length === 0) continue;
    if (typeof record.endedAt !== "number" || !Number.isFinite(record.endedAt)) continue;
    if (typeof record.durationMs !== "number" || !Number.isFinite(record.durationMs) || record.durationMs <= 0) {
      continue;
    }
    sessions.push({
      id: record.id,
      endedAt: record.endedAt,
      durationMs: record.durationMs,
      taskId: typeof record.taskId === "string" ? record.taskId : null,
    });
  }
  return sessions;
}

function finite(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
  return value;
}
