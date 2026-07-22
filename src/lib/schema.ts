// Single source of truth for the Google Sheet layout (spec §4).
// Row 1 of every tab is a header written by the app. Records are keyed by `id`
// (column A) — NEVER by row position. Serializers here roundtrip a domain
// object <-> a flat string[] row so the Sheets sync layer stays trivial.

import type { Priority, Recurrence, Status, Task } from "./types";

export const SPREADSHEET_TITLE = "Task Tracker";
export const SCHEMA_VERSION = 1;

// Tab names shown to the user in their actual Google Sheet — kept matching
// nav.tsx's sidebar labels so a buyer who opens the raw Sheet recognizes it
// as the same app, not a wall of internal camelCase collection names.
export const TAB = {
  Meta: "Settings",
  Tasks: "Tasks",
  Recurrences: "Recurring Tasks",
} as const;

// Old internal tab names an already-connected user's Sheet may still have,
// mapped to the current friendly name above. `ensureTabs()` (sheets.ts) uses
// this to RENAME an existing tab in place (preserving its data) instead of
// silently creating a brand-new, empty tab under the new name and leaving
// all previously-synced data stranded, invisible, under the old one.
export const LEGACY_TAB_RENAMES: Record<string, string> = {
  Meta: TAB.Meta,
  Recurrences: TAB.Recurrences,
};

// Reserved tabs still created empty (headers only) but not yet surfaced in UI.
export const V2_TABS = [TAB.Meta] as const;

export const HEADERS: Record<string, string[]> = {
  // A generic key/value tab — currently used to carry the buyer's Etsy access
  // code across devices, so connecting to the same Sheet elsewhere skips
  // re-entering it. Not part of the normal per-collection sync loop.
  [TAB.Meta]: ["key", "value"],
  [TAB.Tasks]: [
    "id", "title", "notes", "category", "priority", "status", "dueDate",
    "recurrenceId", "occurrenceDate", "remind", "calendarEventId",
    "completedAt", "createdAt", "updatedAt", "assignee",
  ],
  [TAB.Recurrences]: [
    "id", "title", "notes", "category", "priority", "frequency", "anchorDate",
    "endDate", "remind", "active", "createdAt", "updatedAt", "assignee",
  ],
};

// ---- primitive (de)serializers ----
const b = (v: boolean): string => (v ? "TRUE" : "FALSE");
const pb = (s: string | undefined): boolean => String(s).toUpperCase() === "TRUE";
const s = (v: string | undefined): string => (v ?? "").toString();

// ---- Tasks ----
export function taskToRow(t: Task): string[] {
  return [
    t.id, t.title, t.notes, t.category, t.priority, t.status, t.dueDate,
    t.recurrenceId, t.occurrenceDate, b(t.remind), t.calendarEventId,
    t.completedAt, t.createdAt, t.updatedAt, s(t.assignee),
  ];
}
export function rowToTask(r: string[]): Task {
  return {
    id: s(r[0]), title: s(r[1]), notes: s(r[2]), category: s(r[3]),
    priority: (s(r[4]) || "Medium") as Priority,
    status: (s(r[5]) || "NotStarted") as Status,
    dueDate: s(r[6]), recurrenceId: s(r[7]), occurrenceDate: s(r[8]),
    remind: pb(r[9]), calendarEventId: s(r[10]), completedAt: s(r[11]),
    createdAt: s(r[12]), updatedAt: s(r[13]), assignee: s(r[14]),
  };
}

// ---- Recurrences ----
export function recurrenceToRow(x: Recurrence): string[] {
  return [
    x.id, x.title, x.notes, x.category, x.priority, x.frequency, x.anchorDate,
    x.endDate, b(x.remind), b(x.active), x.createdAt, x.updatedAt, s(x.assignee),
  ];
}
export function rowToRecurrence(r: string[]): Recurrence {
  return {
    id: s(r[0]), title: s(r[1]), notes: s(r[2]), category: s(r[3]),
    priority: (s(r[4]) || "Medium") as Priority,
    frequency: (s(r[5]) || "weekly") as Recurrence["frequency"],
    anchorDate: s(r[6]), endDate: s(r[7]), remind: pb(r[8]), active: pb(r[9]),
    createdAt: s(r[10]), updatedAt: s(r[11]), assignee: s(r[12]),
  };
}
