import { describe, expect, test } from "vitest";
import { parseSnapshot } from "./storage";
import { durationsOf } from "./settings";

describe("storage", () => {
  test("keeps a running timer and drops an unknown task selection", () => {
    const raw = JSON.stringify({
      version: 1,
      theme: "dark",
      settings: { focusMin: 50, shortBreakMin: 8, longBreakMin: 20, sessionsBeforeLongBreak: 3 },
      timer: {
        status: "running",
        phase: "focus",
        remainingMs: 50 * 60_000,
        plannedMs: 50 * 60_000,
        endsAt: 1_700_000_000_000,
        completedInCycle: 2,
      },
      tasks: [{ id: "write", title: "  Draft notes  ", createdAt: 10 }],
      currentTaskId: "missing",
      sessions: [{ id: "s1", endedAt: 20, durationMs: 60_000, taskId: "write" }],
    });

    const snapshot = parseSnapshot(raw);
    expect(snapshot?.theme).toBe("dark");
    expect(snapshot?.settings.focusMin).toBe(50);
    expect(snapshot?.timer).toMatchObject({ status: "running", endsAt: 1_700_000_000_000, completedInCycle: 2 });
    expect(snapshot?.tasks).toEqual([{ id: "write", title: "Draft notes", createdAt: 10 }]);
    expect(snapshot?.currentTaskId).toBeNull();
    expect(snapshot?.sessions).toHaveLength(1);
    expect(durationsOf(snapshot!.settings).focusMs).toBe(50 * 60_000);
  });

  test("ignores corrupt saves", () => {
    expect(parseSnapshot(null)).toBeNull();
    expect(parseSnapshot("{")).toBeNull();
    expect(parseSnapshot(JSON.stringify({ version: 2 }))).toBeNull();
    expect(parseSnapshot(JSON.stringify({ version: 1, timer: { status: "nope" } }))?.timer.status).toBe("idle");
  });
});
