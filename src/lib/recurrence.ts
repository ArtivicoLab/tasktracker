// THE recurrence engine (spec §5). Lazy materialization:
// - Recurrences are templates; occurrences are computed, not stored.
// - expandOccurrences() is a PURE function of (recurrence, window).
// - An occurrence becomes a real Tasks row only when it needs identity
//   (completed / edited / reminder toggled / overdue) — handled by the store.

import type { Frequency, Occurrence, Recurrence, Task } from "./types";
import {
  addDaysISO,
  addMonthsISO,
  addYearsISO,
  daysBetween,
  fromISO,
  getDaysInMonth,
  todayISO,
  toISO,
} from "./dates";
import { addMonths, addYears } from "date-fns";

interface ParsedFreq {
  kind: "days" | "months" | "years";
  step: number; // interval in the kind's unit
}

export function parseFrequency(freq: Frequency): ParsedFreq {
  switch (freq) {
    case "daily":
      return { kind: "days", step: 1 };
    case "weekly":
      return { kind: "days", step: 7 };
    case "biweekly":
      return { kind: "days", step: 14 };
    case "monthly":
      return { kind: "months", step: 1 };
    case "yearly":
      return { kind: "years", step: 1 };
    default: {
      const [name, nRaw] = freq.split(":");
      const n = Math.max(1, parseInt(nRaw ?? "1", 10) || 1);
      if (name === "every_n_weeks") return { kind: "days", step: n * 7 };
      if (name === "every_n_months") return { kind: "months", step: n };
      return { kind: "days", step: 1 };
    }
  }
}

/** The k-th occurrence date (k >= 0) of a recurrence, clamping month/year ends. */
function occurrenceAt(rec: Recurrence, k: number): string {
  const { kind, step } = parseFrequency(rec.frequency);
  if (kind === "days") return addDaysISO(rec.anchorDate, k * step);

  // months / years: date-fns clamps day-of-month to the target month's length,
  // which is exactly the spec's "31st -> last day; Feb 29 -> Feb 28" behavior.
  if (kind === "months") return addMonthsISO(rec.anchorDate, k * step);
  return addYearsISO(rec.anchorDate, k * step);
}

/**
 * Compute occurrence dates (ISO) for `rec` within [windowStart, windowEnd] inclusive.
 * Pure; respects anchorDate, endDate, and `active`.
 */
export function expandOccurrences(
  rec: Recurrence,
  windowStart: string,
  windowEnd: string
): string[] {
  if (!rec.active) return [];
  if (!rec.anchorDate) return [];
  // Effective upper bound = min(windowEnd, endDate)
  const hardEnd =
    rec.endDate && daysBetween(rec.endDate, windowEnd) > 0
      ? rec.endDate
      : windowEnd;
  if (daysBetween(rec.anchorDate, hardEnd) < 0) return []; // window before anchor

  const { kind, step } = parseFrequency(rec.frequency);
  const out: string[] = [];

  // Jump close to windowStart instead of iterating from anchor (perf for old series).
  let k = 0;
  if (daysBetween(rec.anchorDate, windowStart) > 0) {
    if (kind === "days") {
      k = Math.floor(daysBetween(rec.anchorDate, windowStart) / step);
    } else if (kind === "months") {
      const a = fromISO(rec.anchorDate);
      const s = fromISO(windowStart);
      const months =
        (s.getFullYear() - a.getFullYear()) * 12 + (s.getMonth() - a.getMonth());
      k = Math.max(0, Math.floor(months / step) - 1);
    } else {
      const yrs = fromISO(windowStart).getFullYear() - fromISO(rec.anchorDate).getFullYear();
      k = Math.max(0, Math.floor(yrs / step) - 1);
    }
  }

  // Walk forward collecting dates in the window. Guard against runaway loops.
  const MAX = 4000;
  for (let i = 0; i < MAX; i++) {
    const date = occurrenceAt(rec, k);
    k++;
    if (daysBetween(date, hardEnd) < 0) break; // passed the end
    if (daysBetween(windowStart, date) < 0) continue; // before window start
    if (rec.endDate && daysBetween(date, rec.endDate) < 0) break;
    out.push(date);
  }
  return out;
}

/** Next occurrence on/after `fromIso` (default today), or "" if none. */
export function nextOccurrence(rec: Recurrence, fromIso = todayISO()): string {
  const horizon = toISO(
    parseFrequency(rec.frequency).kind === "years"
      ? addYears(fromISO(fromIso), 5)
      : addMonths(fromISO(fromIso), 24)
  );
  const list = expandOccurrences(rec, fromIso, horizon);
  return list[0] ?? "";
}

/**
 * Merge computed occurrences with materialized Task rows for a window.
 * Materialized rows (matched by recurrenceId + occurrenceDate) override the
 * virtual ones so per-occurrence edits/completions win.
 */
export function occurrencesForWindow(
  recurrences: Recurrence[],
  tasks: Task[],
  windowStart: string,
  windowEnd: string
): Occurrence[] {
  const out: Occurrence[] = [];
  const materialized = new Map<string, Task>();
  for (const t of tasks) {
    if (t.recurrenceId && t.occurrenceDate) {
      materialized.set(`${t.recurrenceId}:${t.occurrenceDate}`, t);
    }
  }

  for (const rec of recurrences) {
    const dates = expandOccurrences(rec, windowStart, windowEnd);
    for (const date of dates) {
      const key = `${rec.id}:${date}`;
      const real = materialized.get(key);
      if (real) {
        out.push({
          key,
          date,
          title: real.title,
          category: real.category,
          priority: real.priority,
          assignee: real.assignee,
          recurrenceId: rec.id,
          taskId: real.id,
          status: real.status,
          remind: real.remind,
          virtual: false,
        });
      } else {
        out.push({
          key,
          date,
          title: rec.title,
          category: rec.category,
          priority: rec.priority,
          assignee: rec.assignee,
          recurrenceId: rec.id,
          status: "NotStarted",
          remind: rec.remind,
          virtual: true,
        });
      }
    }
  }
  return out;
}

/** Does `iso` land exactly on a shorter-month clamp? (used only in tests/debug) */
export function isClampedDay(anchorIso: string, targetIso: string): boolean {
  const anchorDay = fromISO(anchorIso).getDate();
  const target = fromISO(targetIso);
  return target.getDate() < anchorDay && target.getDate() === getDaysInMonth(target);
}
