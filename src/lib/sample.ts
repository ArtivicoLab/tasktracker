// Sample data: a mix of one-off and recurring tasks, assigned across a small
// team, with a wide spread of statuses/priorities/due dates. Dates are
// anchored relative to "today" so the demo always looks alive.

import { nowIso } from "./id";
import { addDaysISO, todayISO } from "./dates";
import type { Recurrence, Task } from "./types";

export interface Seed {
  tasks: Task[];
  recurrences: Recurrence[];
}

export function buildSample(): Seed {
  const ts = nowIso();
  const today = todayISO();

  // Deterministic, stable ids so re-seeding overwrites the same records instead of
  // creating duplicates (idempotent). Every buildSample() call yields identical ids.
  let idN = 0;
  const newId = () => `smpl-${++idN}`;

  const task = (p: Partial<Task>): Task => ({
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
    ...p,
  });

  const tasks: Task[] = [
    task({ title: "Review bank statement", category: "Finance", priority: "High", assignee: "Me", status: "InProgress", dueDate: today }),
    task({ title: "Organize closet", category: "Home", priority: "Low", assignee: "Alice", status: "Pending", dueDate: today }),
    task({ title: "Write blog post", category: "Growth", priority: "Medium", assignee: "Me", status: "NotStarted", dueDate: addDaysISO(today, 2) }),
    task({ title: "Reply to emails", category: "Work", priority: "Medium", assignee: "Sophie", status: "OnHold", dueDate: addDaysISO(today, -2) }),
    task({ title: "Take vitamins", category: "Health", priority: "Low", assignee: "David", status: "Completed", completedAt: ts, dueDate: addDaysISO(today, -1) }),
    task({ title: "Finish report", category: "Work", priority: "VeryHigh", assignee: "Michael", status: "Delayed", dueDate: addDaysISO(today, -3) }),
    task({ title: "Plan weekly tasks", category: "Home", priority: "Medium", assignee: "Emily", status: "InProgress", dueDate: addDaysISO(today, 1) }),
    task({ title: "Grocery run", category: "Home", priority: "High", assignee: "Alice", status: "Pending", dueDate: addDaysISO(today, 3) }),
    task({ title: "Update spreadsheet", category: "Finance", priority: "Medium", assignee: "Michael", status: "NotStarted", dueDate: addDaysISO(today, 4) }),
    task({ title: "Practice language", category: "Growth", priority: "Low", assignee: "Emily", status: "InProgress", dueDate: addDaysISO(today, 5) }),
    task({ title: "Set savings goal", category: "Finance", priority: "Medium", assignee: "David", status: "NotStarted", dueDate: addDaysISO(today, 6) }),
    task({ title: "Track subscriptions", category: "Finance", priority: "Low", assignee: "Sophie", status: "Cancelled", dueDate: addDaysISO(today, -5) }),
  ];

  // PAST fill: realistic one-off tasks scattered through the last ~6 months, all
  // marked done so they populate past Calendar months without piling up as
  // "overdue" on the dashboard. (Future dates are filled by the recurring
  // templates below — the recurrence engine expands those lazily out to 2030+,
  // so we never store a row per future day.)
  const TASK_POOL: Partial<Task>[] = [
    { title: "Dentist appointment", category: "Health", priority: "Medium", assignee: "Me" },
    { title: "Call mom", category: "Home", priority: "Low", assignee: "Me" },
    { title: "Team standup", category: "Work", priority: "Medium", assignee: "Sophie" },
    { title: "Pay credit card", category: "Finance", priority: "High", assignee: "Me" },
    { title: "Read a chapter", category: "Growth", priority: "Low", assignee: "Me" },
    { title: "Water the plants", category: "Home", priority: "Low", assignee: "Emily" },
    { title: "Submit expense report", category: "Work", priority: "High", assignee: "Michael" },
    { title: "Oil change", category: "Home", priority: "Medium", assignee: "Alice" },
    { title: "Plan weekend trip", category: "Growth", priority: "Low", assignee: "Sophie" },
    { title: "Doctor checkup", category: "Health", priority: "Medium", assignee: "David" },
    { title: "Update resume", category: "Growth", priority: "Medium", assignee: "Me" },
    { title: "Clean the garage", category: "Home", priority: "Low", assignee: "Michael" },
    { title: "Review the budget", category: "Finance", priority: "Medium", assignee: "Me" },
    { title: "Coffee with a friend", category: "Growth", priority: "Low", assignee: "Emily" },
    { title: "Deep clean bathroom", category: "Home", priority: "Medium", assignee: "Alice" },
    { title: "Organize garage shelves", category: "Home", priority: "Low", assignee: "Michael" },
    { title: "Fix leaky faucet", category: "Home", priority: "High", assignee: "David" },
    { title: "Change air filter", category: "Home", priority: "Low", assignee: "Me" },
    { title: "Donate old clothes", category: "Home", priority: "Low", assignee: "Emily" },
    { title: "Mow the lawn", category: "Home", priority: "Medium", assignee: "Alice" },
    { title: "File tax documents", category: "Finance", priority: "High", assignee: "Me" },
    { title: "Review insurance policy", category: "Finance", priority: "Medium", assignee: "Sophie" },
    { title: "Transfer to savings", category: "Finance", priority: "Medium", assignee: "Me" },
    { title: "Cancel unused subscription", category: "Finance", priority: "Low", assignee: "Michael" },
    { title: "Check credit score", category: "Finance", priority: "Low", assignee: "Me" },
    { title: "Finish online course module", category: "Growth", priority: "Medium", assignee: "Emily" },
    { title: "Journal reflection", category: "Growth", priority: "Low", assignee: "Me" },
    { title: "Listen to a podcast", category: "Growth", priority: "Low", assignee: "Sophie" },
    { title: "Practice guitar", category: "Growth", priority: "Low", assignee: "David" },
    { title: "Research a new skill", category: "Growth", priority: "Medium", assignee: "Alice" },
    { title: "Prep presentation slides", category: "Work", priority: "High", assignee: "Sophie" },
    { title: "1:1 with manager", category: "Work", priority: "Medium", assignee: "Michael" },
    { title: "Code review", category: "Work", priority: "Medium", assignee: "Me" },
    { title: "Update project timeline", category: "Work", priority: "Medium", assignee: "Sophie" },
    { title: "Respond to client email", category: "Work", priority: "High", assignee: "Michael" },
    { title: "Annual physical", category: "Health", priority: "Medium", assignee: "David" },
    { title: "Eye exam", category: "Health", priority: "Low", assignee: "Emily" },
    { title: "Restock first aid kit", category: "Health", priority: "Low", assignee: "Alice" },
    { title: "Meal prep for the week", category: "Health", priority: "Medium", assignee: "Me" },
    { title: "Go for a run", category: "Health", priority: "Low", assignee: "David" },
  ];
  let poolIdx = 0;
  for (let d = -182; d <= -4; d += 2) {
    const tmpl = TASK_POOL[poolIdx % TASK_POOL.length];
    poolIdx++;
    tasks.push(task({ ...tmpl, status: "Completed", completedAt: ts, dueDate: addDaysISO(today, d) }));
  }

  // Recurring templates are what keep the Calendar full on EVERY date, all the
  // way out to 2030 and beyond, without storing a row per day — the recurrence
  // engine expands them lazily for whatever window is on screen. A daily
  // template guarantees every single date has something; the weeklies (spread
  // across the week via staggered future anchors) and monthlies add variety.
  //
  // Anchors are at/after today on purpose: a template anchored in the PAST
  // would generate undone past occurrences that show up as "overdue" and blow
  // up the dashboard's count. Past dates are instead filled by the completed
  // one-off tasks above.
  const rec = (p: Partial<Recurrence>): Recurrence => ({
    id: newId(),
    title: "",
    notes: "",
    category: "Home",
    priority: "Medium",
    assignee: "Me",
    frequency: "weekly",
    anchorDate: today,
    endDate: "", // no end -> repeats forever (fills 2030+)
    remind: false,
    active: true,
    createdAt: ts,
    updatedAt: ts,
    ...p,
  });
  const recurrences: Recurrence[] = [
    // Daily — puts an item on every single day from today forward.
    rec({ title: "Morning routine", notes: "Stretch, water, plan the day", category: "Health", frequency: "daily", anchorDate: today }),
    // Weeklies, each anchored on a different upcoming weekday so the week is
    // varied rather than everything landing on the same day.
    rec({ title: "Team meeting", category: "Work", priority: "Medium", assignee: "Sophie", frequency: "weekly", anchorDate: addDaysISO(today, 1) }),
    rec({ title: "Deep clean kitchen", notes: "Wipe counters, scrub sink, refresh fridge", category: "Home", priority: "Low", assignee: "Alice", frequency: "weekly", anchorDate: addDaysISO(today, 2) }),
    rec({ title: "Grocery shopping", category: "Home", priority: "Medium", assignee: "Michael", frequency: "weekly", anchorDate: addDaysISO(today, 3) }),
    rec({ title: "Water houseplants", notes: "Ensure plants stay hydrated and healthy", category: "Home", priority: "Medium", assignee: "Emily", frequency: "weekly", anchorDate: addDaysISO(today, 4) }),
    rec({ title: "Weekly review & planning", notes: "Review tasks, plan next week's priorities", category: "Work", priority: "VeryLow", assignee: "Sophie", frequency: "weekly", anchorDate: addDaysISO(today, 5) }),
    rec({ title: "Family time", category: "Growth", priority: "Low", assignee: "David", frequency: "weekly", anchorDate: addDaysISO(today, 6) }),
    // Monthlies.
    rec({ title: "Pay bills", notes: "Schedule and complete all bill payments", category: "Finance", priority: "VeryHigh", assignee: "Emily", frequency: "monthly", anchorDate: today, remind: true }),
    rec({ title: "Review subscriptions", notes: "Audit recurring charges and cancel unused", category: "Finance", priority: "Low", assignee: "Michael", frequency: "monthly", anchorDate: addDaysISO(today, 10) }),
    rec({ title: "Goal reset / vision update", notes: "Reflect, reset goals, and plan growth path", category: "Growth", priority: "Medium", assignee: "Alice", frequency: "monthly", anchorDate: addDaysISO(today, 18) }),
    rec({ title: "Home maintenance check", notes: "Inspect roof, plumbing, smoke detectors, etc.", category: "Home", priority: "VeryHigh", assignee: "David", frequency: "monthly", anchorDate: addDaysISO(today, 22) }),
  ];

  return { tasks, recurrences };
}
