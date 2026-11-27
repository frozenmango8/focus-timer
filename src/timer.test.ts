import { describe, expect, test } from "vitest";
import {
  applyDurations,
  completeIfDue,
  createTimer,
  formatClock,
  pause,
  reset,
  skip,
  start,
  timeLeft,
  toggle,
  type Durations,
  type TimerState,
} from "./timer";

const durations: Durations = {
  focusMs: 25 * 60_000,
  shortBreakMs: 5 * 60_000,
  longBreakMs: 15 * 60_000,
  sessionsBeforeLongBreak: 4,
};

function finish(state: TimerState, durations: Durations) {
  const end = state.endsAt ?? 0;
  return completeIfDue(state, end, durations);
}

describe("timer", () => {
  test("starts idle on a full focus", () => {
    const state = createTimer(durations);
    expect(state).toMatchObject({
      status: "idle",
      phase: "focus",
      remainingMs: durations.focusMs,
      plannedMs: durations.focusMs,
      endsAt: null,
      completedInCycle: 0,
    });
  });

  test("running time is the distance to endsAt", () => {
    const started = start(createTimer(durations), 1_000);
    expect(started.status).toBe("running");
    expect(started.endsAt).toBe(1_000 + durations.focusMs);
    expect(timeLeft(started, 1_000 + 90_000)).toBe(durations.focusMs - 90_000);
    expect(start(started, 2_000)).toBe(started);
  });

  test("pause freezes the remaining time and resume continues it", () => {
    const started = start(createTimer(durations), 1_000);
    const paused = pause(started, 1_000 + 90_000);
    expect(paused.status).toBe("paused");
    expect(paused.endsAt).toBeNull();
    expect(paused.remainingMs).toBe(durations.focusMs - 90_000);
    expect(pause(paused, 2_000)).toBe(paused);

    const resumed = start(paused, 500_000);
    expect(resumed.endsAt).toBe(500_000 + paused.remainingMs);
    expect(timeLeft(resumed, 500_000 + 1_000)).toBe(paused.remainingMs - 1_000);
  });

  test("a late check still completes once, at the original end time", () => {
    const started = start(createTimer(durations), 0);
    const early = completeIfDue(started, started.endsAt! - 1, durations);
    expect(early.done).toBeNull();
    expect(early.state).toBe(started);

    const late = completeIfDue(started, started.endsAt! + 3 * 60_000, durations);
    expect(late.done).toEqual({
      phase: "focus",
      endedAt: durations.focusMs,
      focusMs: durations.focusMs,
    });
    expect(late.state).toMatchObject({
      status: "idle",
      phase: "shortBreak",
      remainingMs: durations.shortBreakMs,
      completedInCycle: 1,
    });

    const again = completeIfDue(late.state, started.endsAt! + 10 * 60_000, durations);
    expect(again.done).toBeNull();
    expect(again.state).toBe(late.state);
  });

  test("the fourth finished focus opens a long break and resets the cycle", () => {
    let state = createTimer(durations);
    const phases: string[] = [];

    for (let i = 0; i < 4; i += 1) {
      state = start(state, i * 1_000_000);
      const step = finish(state, durations);
      expect(step.done?.focusMs).toBe(durations.focusMs);
      state = step.state;
      phases.push(state.phase);
      if (state.phase !== "focus") {
        state = start(state, i * 1_000_000 + 10);
        state = finish(state, durations).state;
      }
    }

    expect(phases).toEqual(["shortBreak", "shortBreak", "shortBreak", "longBreak"]);
    expect(state.phase).toBe("focus");
    expect(state.completedInCycle).toBe(0);
  });

  test("one session before a long break skips the short break", () => {
    const single: Durations = { ...durations, sessionsBeforeLongBreak: 1 };
    const started = start(createTimer(single), 0);
    const step = finish(started, single);
    expect(step.state.phase).toBe("longBreak");
    expect(step.state.completedInCycle).toBe(0);
  });

  test("skip moves on without crediting the focus", () => {
    let state = createTimer({ ...durations, sessionsBeforeLongBreak: 2 });
    state = start(state, 0);
    state = finish(state, durations).state;
    expect(state.completedInCycle).toBe(1);

    state = skip(state, durations);
    expect(state).toMatchObject({ phase: "focus", completedInCycle: 1, status: "idle" });

    state = skip(start(state, 50), durations);
    expect(state).toMatchObject({
      phase: "shortBreak",
      completedInCycle: 1,
      remainingMs: durations.shortBreakMs,
    });
  });

  test("a new short-break length is used when the next phase begins", () => {
    const started = start(createTimer(durations), 0);
    const next = { ...durations, shortBreakMs: 1_234, focusMs: 99_000 };
    expect(applyDurations(started, next)).toBe(started);

    const step = completeIfDue(started, started.endsAt!, next);
    expect(step.done?.focusMs).toBe(durations.focusMs);
    expect(step.state.remainingMs).toBe(1_234);
    expect(step.state.plannedMs).toBe(1_234);
  });

  test("editing the current phase updates an idle timer only", () => {
    const idle = applyDurations(createTimer(durations), { ...durations, focusMs: 1_000 });
    expect(idle.remainingMs).toBe(1_000);
    expect(idle.plannedMs).toBe(1_000);

    const paused = pause(start(createTimer(durations), 0), 5_000);
    expect(applyDurations(paused, { ...durations, focusMs: 1_000 })).toBe(paused);
  });

  test("reset restores the current phase and leaves the cycle count", () => {
    let state = start(createTimer(durations), 0);
    state = finish(state, durations).state;
    state = start(state, 10);
    const resetState = reset(state, durations);
    expect(resetState).toMatchObject({
      status: "idle",
      phase: "shortBreak",
      remainingMs: durations.shortBreakMs,
      endsAt: null,
      completedInCycle: 1,
    });
  });

  test("toggle starts and pauses", () => {
    const running = toggle(createTimer(durations), 40);
    expect(running.status).toBe("running");
    const paused = toggle(running, 40 + 2_000);
    expect(paused.status).toBe("paused");
    expect(paused.remainingMs).toBe(durations.focusMs - 2_000);
  });

  test("formats the clock by rounding partial seconds up", () => {
    expect(formatClock(0)).toBe("00:00");
    expect(formatClock(1)).toBe("00:01");
    expect(formatClock(1_000)).toBe("00:01");
    expect(formatClock(1_001)).toBe("00:02");
    expect(formatClock(25 * 60_000)).toBe("25:00");
    expect(formatClock(25 * 60_000 - 1)).toBe("25:00");
    expect(formatClock(25 * 60_000 - 1_000)).toBe("24:59");
    expect(formatClock(60 * 60_000)).toBe("1:00:00");
    expect(formatClock(90 * 60_000)).toBe("1:30:00");
  });
});
