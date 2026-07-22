// Sync decision layer for Calendar reminders (TODO.md #2). The decision fn is
// pure so it's cheap to unit test; the wrappers around it are the only bit
// that touches the network, and only when the decision actually calls for it.
// This keeps the calendar.events scope truly lazy: nothing here requests a
// token unless a create/update/delete is really about to happen.

import * as calendar from "./google/calendar";
import type { Task } from "./types";

// Dynamic, not static: sync.ts pulls in every store (tasks/budget/settings/...),
// which is exactly what imports this module — a static `import ... from
// "./sync"` here would close a fresh cycle back through sync.ts and shuffle
// module-eval order enough to break other stores' own top-level init. A
// dynamic import settles after the initial module graph does, so it can't.
async function connected(): Promise<boolean> {
  const { isConnected } = await import("./sync");
  return isConnected();
}

export type ReminderAction =
  | { kind: "create" }
  | { kind: "update"; eventId: string }
  | { kind: "delete"; eventId: string }
  | { kind: "none" };

/**
 * `titleChanged` really means "title or date changed" — the one thing an
 * existing event needs re-pushed for. Without it, every unrelated field edit
 * (status, notes, paid, priority...) would otherwise re-PATCH the calendar
 * event on every save.
 */
export function decideReminderAction(
  remind: boolean,
  dueDate: string,
  calendarEventId: string,
  titleChanged: boolean
): ReminderAction {
  if (remind && dueDate && !calendarEventId) return { kind: "create" };
  if (remind && dueDate && calendarEventId) {
    return titleChanged ? { kind: "update", eventId: calendarEventId } : { kind: "none" };
  }
  if (!remind && calendarEventId) return { kind: "delete", eventId: calendarEventId };
  return { kind: "none" };
}

/** Swallow anything that goes wrong — a reminder is a nice-to-have, never a
    reason to fail the task save that triggered it. */
async function guard<T>(fn: () => Promise<T>): Promise<T | undefined> {
  try {
    return await fn();
  } catch {
    return undefined;
  }
}

/**
 * Fire-and-forget sync for a task. Returns the patch to persist back onto the
 * task (only ever touches `calendarEventId`), or undefined if nothing needs
 * to change (not connected, no-op decision, or the call failed).
 */
export async function syncTaskReminder(
  task: Task,
  titleChanged: boolean
): Promise<Partial<Task> | undefined> {
  if (!(await connected())) return undefined;
  const action = decideReminderAction(task.remind, task.dueDate, task.calendarEventId, titleChanged);
  return guard(async () => {
    switch (action.kind) {
      case "create": {
        const id = await calendar.createEvent(task.title || "Untitled task", task.dueDate, task.notes || undefined);
        return { calendarEventId: id };
      }
      case "update":
        await calendar.updateEvent(action.eventId, task.title || "Untitled task", task.dueDate, task.notes || undefined);
        return undefined;
      case "delete":
        await calendar.deleteEvent(action.eventId);
        return { calendarEventId: "" };
      case "none":
        return undefined;
    }
  });
}

/**
 * Create/move/delete the single recurring daily-digest event. Returns the
 * event id to persist (`""` after a delete), or undefined if nothing needs
 * to change (not connected, or the call failed).
 */
/**
 * Best-effort delete of a lingering Calendar event for something that's being
 * deleted outright (task/materialized occurrence) — not a reminder
 * turn-off, just cleanup so it doesn't outlive the row it belonged to.
 */
export async function cancelReminder(calendarEventId: string): Promise<void> {
  if (!calendarEventId) return;
  if (!(await connected())) return;
  await guard(() => calendar.deleteEvent(calendarEventId));
}

export async function syncDailyDigest(
  time: string,
  existingEventId: string
): Promise<string | undefined> {
  if (!(await connected())) return undefined;
  return guard(async () => {
    if (!time) {
      if (!existingEventId) return undefined;
      await calendar.deleteEvent(existingEventId);
      return "";
    }
    return calendar.createOrUpdateDailyDigest(existingEventId, time, "Daily planning digest");
  });
}
