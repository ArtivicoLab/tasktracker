import { describe, expect, it } from "vitest";
import { rowToTask, taskToRow, rowToRecurrence, recurrenceToRow } from "../src/lib/schema";
import type { Recurrence, Task } from "../src/lib/types";

describe("schema serialize -> deserialize roundtrip", () => {
  it("Task roundtrips", () => {
    const t: Task = {
      id: "t1",
      title: "Buy milk",
      notes: "2%",
      category: "Home",
      priority: "High",
      status: "InProgress",
      assignee: "Alice",
      dueDate: "2026-07-04",
      recurrenceId: "r9",
      occurrenceDate: "2026-07-04",
      remind: true,
      calendarEventId: "evt1",
      completedAt: "",
      createdAt: "2026-07-01T00:00:00Z",
      updatedAt: "2026-07-02T00:00:00Z",
    };
    expect(rowToTask(taskToRow(t))).toEqual(t);
  });

  it("Recurrence roundtrips incl. boolean fields", () => {
    const r: Recurrence = {
      id: "r1",
      title: "Water plants",
      notes: "",
      category: "Home",
      priority: "Low",
      assignee: "Bob",
      frequency: "every_n_weeks:3",
      anchorDate: "2026-01-01",
      endDate: "2026-12-31",
      remind: false,
      active: true,
      createdAt: "a",
      updatedAt: "b",
    };
    expect(rowToRecurrence(recurrenceToRow(r))).toEqual(r);
  });

  it("tolerates blank/short rows without throwing", () => {
    expect(() => rowToTask([])).not.toThrow();
    expect(rowToTask([]).priority).toBe("Medium");
  });
});
