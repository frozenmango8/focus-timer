import type { Durations } from "./timer";

export interface Settings {
  focusMin: number;
  shortBreakMin: number;
  longBreakMin: number;
  sessionsBeforeLongBreak: number;
}

export type Theme = "system" | "light" | "dark";

export const DEFAULT_SETTINGS: Settings = {
  focusMin: 25,
  shortBreakMin: 5,
  longBreakMin: 15,
  sessionsBeforeLongBreak: 4,
};

const LIMITS = {
  focusMin: [1, 180],
  shortBreakMin: [1, 60],
  longBreakMin: [1, 60],
  sessionsBeforeLongBreak: [1, 12],
} as const;

export function durationsOf(settings: Settings): Durations {
  return {
    focusMs: settings.focusMin * 60_000,
    shortBreakMs: settings.shortBreakMin * 60_000,
    longBreakMs: settings.longBreakMin * 60_000,
    sessionsBeforeLongBreak: settings.sessionsBeforeLongBreak,
  };
}

/** Reject out-of-range edits so a field can be restored instead of clamped. */
export function cleanSettings(value: Settings): Settings | null {
  if (!valid(value.focusMin, LIMITS.focusMin)) return null;
  if (!valid(value.shortBreakMin, LIMITS.shortBreakMin)) return null;
  if (!valid(value.longBreakMin, LIMITS.longBreakMin)) return null;
  if (!valid(value.sessionsBeforeLongBreak, LIMITS.sessionsBeforeLongBreak)) return null;
  return { ...value };
}

export function settingsFromUnknown(value: unknown): Settings {
  const record = asRecord(value);
  return {
    focusMin: clamp(record.focusMin, LIMITS.focusMin, DEFAULT_SETTINGS.focusMin),
    shortBreakMin: clamp(record.shortBreakMin, LIMITS.shortBreakMin, DEFAULT_SETTINGS.shortBreakMin),
    longBreakMin: clamp(record.longBreakMin, LIMITS.longBreakMin, DEFAULT_SETTINGS.longBreakMin),
    sessionsBeforeLongBreak: clamp(
      record.sessionsBeforeLongBreak,
      LIMITS.sessionsBeforeLongBreak,
      DEFAULT_SETTINGS.sessionsBeforeLongBreak,
    ),
  };
}

export function themeFromUnknown(value: unknown): Theme {
  if (value === "light" || value === "dark" || value === "system") return value;
  return "system";
}

function valid(value: number, [min, max]: readonly [number, number]): boolean {
  return Number.isInteger(value) && value >= min && value <= max;
}

function clamp(value: unknown, [min, max]: readonly [number, number], fallback: number): number {
  if (typeof value !== "number" || !Number.isInteger(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") return {};
  return value as Record<string, unknown>;
}
