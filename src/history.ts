export interface FocusSession {
  id: string;
  endedAt: number;
  durationMs: number;
  taskId: string | null;
}

export interface DayTotal {
  date: string;
  durationMs: number;
  sessions: number;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

export function localZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

export function dateKey(timestamp: number, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(timestamp));
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  if (!year || !month || !day) {
    throw new Error(`Could not format a date in ${timeZone}`);
  }
  return `${year}-${month}-${day}`;
}

export function weekTotals(sessions: readonly FocusSession[], now: number, timeZone: string): DayTotal[] {
  const today = dateKey(now, timeZone);
  const days: DayTotal[] = [];
  for (let offset = 6; offset >= 0; offset -= 1) {
    days.push({ date: shiftDate(today, -offset), durationMs: 0, sessions: 0 });
  }
  const index = new Map(days.map((day, i) => [day.date, i]));
  for (const session of sessions) {
    const slot = index.get(dateKey(session.endedAt, timeZone));
    if (slot === undefined) continue;
    days[slot].durationMs += session.durationMs;
    days[slot].sessions += 1;
  }
  return days;
}

export function todayTotalMs(sessions: readonly FocusSession[], now: number, timeZone: string): number {
  const days = weekTotals(sessions, now, timeZone);
  return days[days.length - 1]?.durationMs ?? 0;
}

export function countByTask(sessions: readonly FocusSession[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const session of sessions) {
    if (!session.taskId) continue;
    counts.set(session.taskId, (counts.get(session.taskId) ?? 0) + 1);
  }
  return counts;
}

export function formatSpent(ms: number): string {
  const minutes = Math.max(0, Math.floor(ms / 60_000));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest}m`;
  if (rest === 0) return `${hours}h`;
  return `${hours}h ${rest}m`;
}

export function weekdayShort(date: string): string {
  return WEEKDAYS[utcDay(date).getUTCDay()];
}

export function dayLabel(date: string): string {
  const [, month, day] = date.split("-").map(Number);
  return `${weekdayShort(date)}, ${MONTHS[month - 1]} ${day}`;
}

function shiftDate(date: string, days: number): string {
  const utc = utcDay(date);
  utc.setUTCDate(utc.getUTCDate() + days);
  const month = String(utc.getUTCMonth() + 1).padStart(2, "0");
  const day = String(utc.getUTCDate()).padStart(2, "0");
  return `${utc.getUTCFullYear()}-${month}-${day}`;
}

function utcDay(date: string): Date {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}
