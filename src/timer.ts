export type Phase = "focus" | "shortBreak" | "longBreak";

export type Status = "idle" | "running" | "paused";

export interface Durations {
  focusMs: number;
  shortBreakMs: number;
  longBreakMs: number;
  sessionsBeforeLongBreak: number;
}

export interface TimerState {
  status: Status;
  phase: Phase;
  /** Remaining milliseconds while idle or paused. */
  remainingMs: number;
  /** Length of the current phase, fixed when that phase begins. */
  plannedMs: number;
  /** Epoch milliseconds when the running phase ends. */
  endsAt: number | null;
  /** Focus sessions finished since the last long break. */
  completedInCycle: number;
}

export interface Completion {
  phase: Phase;
  /** When the phase actually ended, which may be before we noticed. */
  endedAt: number;
  /** Set for a finished focus session. Skip does not produce a completion. */
  focusMs: number | null;
}

export function phaseDuration(phase: Phase, durations: Durations): number {
  if (phase === "focus") return durations.focusMs;
  if (phase === "shortBreak") return durations.shortBreakMs;
  return durations.longBreakMs;
}

export function phaseName(phase: Phase): string {
  if (phase === "focus") return "Focus";
  if (phase === "shortBreak") return "Short break";
  return "Long break";
}

export function createTimer(durations: Durations): TimerState {
  const plannedMs = durations.focusMs;
  return {
    status: "idle",
    phase: "focus",
    remainingMs: plannedMs,
    plannedMs,
    endsAt: null,
    completedInCycle: 0,
  };
}

/**
 * Remaining time comes from endsAt, not from counting ticks, so a tab that
 * was throttled in the background is still right when it wakes up.
 */
export function timeLeft(state: TimerState, now: number): number {
  if (state.status === "running" && state.endsAt !== null) {
    return Math.max(0, state.endsAt - now);
  }
  return Math.max(0, state.remainingMs);
}

export function start(state: TimerState, now: number): TimerState {
  if (state.status === "running") return state;
  if (state.remainingMs <= 0) return state;
  return {
    ...state,
    status: "running",
    endsAt: now + state.remainingMs,
  };
}

export function pause(state: TimerState, now: number): TimerState {
  if (state.status !== "running" || state.endsAt === null) return state;
  return {
    ...state,
    status: "paused",
    remainingMs: Math.max(0, state.endsAt - now),
    endsAt: null,
  };
}

export function toggle(state: TimerState, now: number): TimerState {
  return state.status === "running" ? pause(state, now) : start(state, now);
}

export function reset(state: TimerState, durations: Durations): TimerState {
  const plannedMs = phaseDuration(state.phase, durations);
  return {
    ...state,
    status: "idle",
    remainingMs: plannedMs,
    plannedMs,
    endsAt: null,
  };
}

export function skip(state: TimerState, durations: Durations): TimerState {
  return advance(state, durations, false);
}

/**
 * Apply duration edits. A phase that is already running or paused keeps
 * its original length; the new values are used the next time a phase begins.
 */
export function applyDurations(state: TimerState, durations: Durations): TimerState {
  if (state.status !== "idle") return state;
  const plannedMs = phaseDuration(state.phase, durations);
  return { ...state, remainingMs: plannedMs, plannedMs };
}

export function completeIfDue(
  state: TimerState,
  now: number,
  durations: Durations,
): { state: TimerState; done: Completion | null } {
  if (state.status !== "running" || state.endsAt === null || now < state.endsAt) {
    return { state, done: null };
  }
  const done: Completion = {
    phase: state.phase,
    endedAt: state.endsAt,
    focusMs: state.phase === "focus" ? state.plannedMs : null,
  };
  return { state: advance(state, durations, true), done };
}

export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");
  if (hours > 0) return `${hours}:${mm}:${ss}`;
  return `${mm}:${ss}`;
}

function advance(state: TimerState, durations: Durations, creditFocus: boolean): TimerState {
  const every = Math.max(1, Math.floor(durations.sessionsBeforeLongBreak));
  let phase: Phase;
  let completedInCycle = state.completedInCycle;

  if (state.phase === "focus") {
    if (creditFocus) {
      completedInCycle += 1;
      if (completedInCycle >= every) {
        phase = "longBreak";
        completedInCycle = 0;
      } else {
        phase = "shortBreak";
      }
    } else {
      phase = "shortBreak";
    }
  } else {
    phase = "focus";
  }

  const plannedMs = phaseDuration(phase, durations);
  return {
    status: "idle",
    phase,
    remainingMs: plannedMs,
    plannedMs,
    endsAt: null,
    completedInCycle,
  };
}
