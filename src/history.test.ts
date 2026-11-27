import { describe, expect, test } from "vitest";
import {
  countByTask,
  dateKey,
  dayLabel,
  formatSpent,
  todayTotalMs,
  weekTotals,
  weekdayShort,
  type FocusSession,
} from "./history";

function session(partial: Partial<FocusSession> & Pick<FocusSession, "endedAt" | "durationMs">): FocusSession {
  return {
    id: partial.id ?? String(partial.endedAt),
    endedAt: partial.endedAt,
    durationMs: partial.durationMs,
    taskId: partial.taskId ?? null,
  };
}

describe("history", () => {
  test("date keys follow the requested time zone", () => {
    const instant = Date.parse("2026-03-15T03:30:00Z");
    expect(dateKey(instant, "UTC")).toBe("2026-03-15");
    expect(dateKey(instant, "America/New_York")).toBe("2026-03-14");
  });

  test("today's total includes only the local day", () => {
    const now = Date.parse("2026-03-15T03:30:00Z");
    const sessions = [
      session({ endedAt: Date.parse("2026-03-15T02:00:00Z"), durationMs: 25 * 60_000, taskId: "write" }),
      session({ endedAt: Date.parse("2026-03-15T04:30:00Z"), durationMs: 60_000, taskId: "write" }),
    ];

    expect(todayTotalMs(sessions, now, "America/New_York")).toBe(25 * 60_000);
    expect(todayTotalMs(sessions, now, "UTC")).toBe(25 * 60_000 + 60_000);
    expect(todayTotalMs([], now, "UTC")).toBe(0);
  });

  test("week totals cover seven calendar days, including a leap day", () => {
    const now = Date.parse("2024-03-01T12:00:00Z");
    const sessions = [
      session({ endedAt: Date.parse("2024-02-23T12:00:00Z"), durationMs: 60_000 }),
      session({ endedAt: Date.parse("2024-02-29T10:00:00Z"), durationMs: 25 * 60_000, taskId: "read" }),
      session({ endedAt: Date.parse("2024-02-29T18:00:00Z"), durationMs: 5 * 60_000, taskId: "read" }),
      session({ endedAt: Date.parse("2024-03-01T11:00:00Z"), durationMs: 15 * 60_000 }),
    ];

    const days = weekTotals(sessions, now, "UTC");
    expect(days.map((day) => day.date)).toEqual([
      "2024-02-24",
      "2024-02-25",
      "2024-02-26",
      "2024-02-27",
      "2024-02-28",
      "2024-02-29",
      "2024-03-01",
    ]);
    expect(days[0]).toMatchObject({ durationMs: 0, sessions: 0 });
    expect(days[5]).toMatchObject({ durationMs: 30 * 60_000, sessions: 2 });
    expect(days[6]).toMatchObject({ durationMs: 15 * 60_000, sessions: 1 });
    expect(todayTotalMs(sessions, now, "UTC")).toBe(15 * 60_000);
  });

  test("days stay on the calendar across a daylight-saving change", () => {
    const now = Date.parse("2026-03-10T15:00:00Z");
    const sessions = [
      session({ endedAt: Date.parse("2026-03-07T15:00:00Z"), durationMs: 60_000 }),
      session({ endedAt: Date.parse("2026-03-09T15:00:00Z"), durationMs: 2 * 60_000 }),
    ];
    const days = weekTotals(sessions, now, "America/New_York");
    expect(days.map((day) => day.date)).toEqual([
      "2026-03-04",
      "2026-03-05",
      "2026-03-06",
      "2026-03-07",
      "2026-03-08",
      "2026-03-09",
      "2026-03-10",
    ]);
    expect(days[3].durationMs).toBe(60_000);
    expect(days[5].durationMs).toBe(2 * 60_000);
  });

  test("task counts ignore sessions with no task", () => {
    const sessions = [
      session({ endedAt: 1, durationMs: 1, taskId: "a" }),
      session({ endedAt: 2, durationMs: 1, taskId: "a" }),
      session({ endedAt: 3, durationMs: 1, taskId: null }),
      session({ endedAt: 4, durationMs: 1, taskId: "b" }),
    ];
    const counts = countByTask(sessions);
    expect(counts.get("a")).toBe(2);
    expect(counts.get("b")).toBe(1);
    expect(counts.size).toBe(2);
  });

  test("formats totals and day labels", () => {
    expect(formatSpent(0)).toBe("0m");
    expect(formatSpent(59_999)).toBe("0m");
    expect(formatSpent(60_000)).toBe("1m");
    expect(formatSpent(25 * 60_000)).toBe("25m");
    expect(formatSpent(60 * 60_000)).toBe("1h");
    expect(formatSpent(90 * 60_000)).toBe("1h 30m");
    expect(weekdayShort("2024-02-29")).toBe("Thu");
    expect(dayLabel("2024-02-29")).toBe("Thu, Feb 29");
  });
});
