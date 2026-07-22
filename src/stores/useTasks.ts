import { create } from "zustand";
import * as db from "../lib/db";
import { newId, nowIso } from "../lib/id";
import { addDaysISO, todayISO } from "../lib/dates";
import { occurrencesForWindow } from "../lib/recurrence";
import { cancelReminder, syncTaskReminder } from "../lib/reminders";
import { useSync } from "./useSync";
import type { Occurrence, Recurrence, Status, Task } from "../lib/types";

interface TasksState {
  tasks: Task[];
  recurrences: Recurrence[];
  setAll: (tasks: Task[], recurrences: Recurrence[]) => void;

  addTask: (patch: Partial<Task>) => Task;
  updateTask: (id: string, patch: Partial<Task>) => void;
  deleteTask: (id: string) => void;
  toggleComplete: (id: string) => void;
  /** Persists a Calendar sync result without re-triggering reminder sync (avoids a loop). */
  setCalendarEventId: (id: string, eventId: string) => void;

  addRecurrence: (patch: Partial<Recurrence>) => Recurrence;
  updateRecurrence: (id: string, patch: Partial<Recurrence>) => void;
  deleteRecurrence: (id: string, mode: "all" | "future") => void;

  /** Materialize a virtual occurrence into a real Task row (per-occurrence identity). */
  materialize: (recurrenceId: string, date: string, patch?: Partial<Task>) => Task;
  toggleOccurrence: (occ: Occurrence) => void;

  /** Set a task/occurrence status (materializes virtual occurrences first). */
  setStatus: (
    ref: { taskId?: string; recurrenceId?: string; date?: string },
    status: Status
  ) => void;

  /** Merged occurrences (virtual + materialized) for a date window. */
  occurrences: (windowStart: string, windowEnd: string) => Occurrence[];
}

function touch(collection?: "tasks" | "recurrences") {
  useSync.getState().touch(collection);
}

/** Fire-and-forget: sync the Calendar event, then persist the id via the
    loop-safe setter above (never through updateTask/addTask again). */
function fireReminderSync(task: Task, titleChanged: boolean) {
  void syncTaskReminder(task, titleChanged).then((patch) => {
    if (!patch || patch.calendarEventId === undefined) return;
    const current = useTasks.getState().tasks.find((t) => t.id === task.id);
    if (!current || patch.calendarEventId === current.calendarEventId) return;
    useTasks.getState().setCalendarEventId(task.id, patch.calendarEventId);
  });
}

export const useTasks = create<TasksState>((set, get) => ({
  tasks: [],
  recurrences: [],
  setAll: (tasks, recurrences) => set({ tasks, recurrences }),

  addTask: (patch) => {
    const ts = nowIso();
    const t: Task = {
      id: newId(),
      title: "",
      notes: "",
      category: "Home",
      priority: "Medium",
      status: "NotStarted",
      assignee: "",
      dueDate: "",
      recurrenceId: "",
      occurrenceDate: "",
      remind: false,
      calendarEventId: "",
      completedAt: "",
      createdAt: ts,
      updatedAt: ts,
      ...patch,
    };
    set((s) => ({ tasks: [...s.tasks, t] }));
    void db.put("tasks", t);
    touch("tasks");
    fireReminderSync(t, true);
    return t;
  },

  updateTask: (id, patch) => {
    let prev: Task | undefined;
    let updated: Task | undefined;
    set((s) => ({
      tasks: s.tasks.map((t) => {
        if (t.id !== id) return t;
        prev = t;
        updated = { ...t, ...patch, updatedAt: nowIso() };
        return updated;
      }),
    }));
    if (updated) void db.put("tasks", updated);
    touch("tasks");
    // Only touch the Calendar API when a reminder-relevant field actually
    // changed — an incidental save (toggling done, changing priority/
    // assignee/category) must never re-request the calendar.events scope,
    // which can surface a real Google consent popup out of nowhere.
    const remindRelevant =
      patch.remind !== undefined || patch.dueDate !== undefined ||
      patch.title !== undefined || patch.notes !== undefined;
    if (updated && prev && remindRelevant) {
      const titleOrDateChanged =
        (patch.title !== undefined && patch.title !== prev.title) ||
        (patch.dueDate !== undefined && patch.dueDate !== prev.dueDate);
      fireReminderSync(updated, titleOrDateChanged);
    }
  },

  setCalendarEventId: (id, eventId) => {
    let updated: Task | undefined;
    set((s) => ({
      tasks: s.tasks.map((t) => {
        if (t.id !== id) return t;
        updated = { ...t, calendarEventId: eventId, updatedAt: nowIso() };
        return updated;
      }),
    }));
    if (updated) void db.put("tasks", updated);
    touch("tasks");
  },

  deleteTask: (id) => {
    const existing = get().tasks.find((t) => t.id === id);
    set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) }));
    void db.remove("tasks", id);
    touch("tasks");
    if (existing?.calendarEventId) void cancelReminder(existing.calendarEventId);
  },

  toggleComplete: (id) => {
    const t = get().tasks.find((x) => x.id === id);
    if (!t) return;
    const done = t.status === "Completed";
    get().updateTask(id, {
      status: done ? "NotStarted" : "Completed",
      completedAt: done ? "" : nowIso(),
    });
  },

  addRecurrence: (patch) => {
    const ts = nowIso();
    const r: Recurrence = {
      id: newId(),
      title: "",
      notes: "",
      category: "Home",
      priority: "Medium",
      assignee: "",
      frequency: "weekly",
      anchorDate: todayISO(),
      endDate: "",
      remind: false,
      active: true,
      createdAt: ts,
      updatedAt: ts,
      ...patch,
    };
    set((s) => ({ recurrences: [...s.recurrences, r] }));
    void db.put("recurrences", r);
    touch("recurrences");
    return r;
  },

  updateRecurrence: (id, patch) => {
    let updated: Recurrence | undefined;
    set((s) => ({
      recurrences: s.recurrences.map((r) => {
        if (r.id !== id) return r;
        updated = { ...r, ...patch, updatedAt: nowIso() };
        return updated;
      }),
    }));
    if (updated) void db.put("recurrences", updated);
    touch("recurrences");
  },

  deleteRecurrence: (id, mode) => {
    if (mode === "future") {
      // Keep already-materialized past rows; stop the series as of today.
      get().updateRecurrence(id, { endDate: addDaysISO(todayISO(), -1) });
      return;
    }
    // Delete everything: the series + its materialized rows.
    const materialized = get().tasks.filter((t) => t.recurrenceId === id);
    set((s) => ({
      recurrences: s.recurrences.filter((r) => r.id !== id),
      tasks: s.tasks.filter((t) => t.recurrenceId !== id),
    }));
    void db.remove("recurrences", id);
    for (const t of materialized) {
      void db.remove("tasks", t.id);
      if (t.calendarEventId) void cancelReminder(t.calendarEventId);
    }
    touch("recurrences");
    touch("tasks");
  },

  materialize: (recurrenceId, date, patch) => {
    const existing = get().tasks.find(
      (t) => t.recurrenceId === recurrenceId && t.occurrenceDate === date
    );
    if (existing) {
      if (patch) get().updateTask(existing.id, patch);
      return existing;
    }
    const rec = get().recurrences.find((r) => r.id === recurrenceId);
    return get().addTask({
      title: rec?.title ?? "",
      notes: rec?.notes ?? "",
      category: rec?.category ?? "Home",
      priority: rec?.priority ?? "Medium",
      assignee: rec?.assignee ?? "",
      recurrenceId,
      occurrenceDate: date,
      dueDate: date,
      remind: rec?.remind ?? false,
      ...patch,
    });
  },

  toggleOccurrence: (occ) => {
    if (occ.virtual) {
      // First interaction gives the occurrence identity, completed.
      get().materialize(occ.recurrenceId, occ.date, {
        status: "Completed",
        completedAt: nowIso(),
      });
    } else if (occ.taskId) {
      get().toggleComplete(occ.taskId);
    }
  },

  setStatus: (ref, status) => {
    const patch: Partial<Task> = {
      status,
      completedAt: status === "Completed" ? nowIso() : "",
    };
    if (ref.taskId) {
      get().updateTask(ref.taskId, patch);
    } else if (ref.recurrenceId && ref.date) {
      const t = get().materialize(ref.recurrenceId, ref.date);
      get().updateTask(t.id, patch);
    }
  },

  occurrences: (windowStart, windowEnd) =>
    occurrencesForWindow(
      get().recurrences,
      get().tasks,
      windowStart,
      windowEnd
    ),
}));
