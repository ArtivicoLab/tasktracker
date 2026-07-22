import { beforeEach, describe, expect, it, vi } from "vitest";
import { decideReminderAction } from "../src/lib/reminders";
import type { Task } from "../src/lib/types";

const { isConnected } = vi.hoisted(() => ({ isConnected: vi.fn() }));
vi.mock("../src/lib/sync", () => ({ isConnected }));

const calendarMock = vi.hoisted(() => ({
  createEvent: vi.fn(),
  updateEvent: vi.fn(),
  deleteEvent: vi.fn(),
  createOrUpdateDailyDigest: vi.fn(),
}));
vi.mock("../src/lib/google/calendar", () => calendarMock);

import { cancelReminder, syncDailyDigest, syncTaskReminder } from "../src/lib/reminders";

function task(partial: Partial<Task>): Task {
  return {
    id: "t1",
    title: "Water plants",
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
    createdAt: "",
    updatedAt: "",
    ...partial,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("decideReminderAction", () => {
  it("never creates without a due date", () => {
    expect(decideReminderAction(true, "", "", true)).toEqual({ kind: "none" });
  });

  it("deletes a stray event even if due date is missing", () => {
    expect(decideReminderAction(true, "", "evt1", true)).toEqual({ kind: "none" });
    expect(decideReminderAction(false, "", "evt1", true)).toEqual({ kind: "delete", eventId: "evt1" });
  });

  it("creates when remind+dueDate and no event yet", () => {
    expect(decideReminderAction(true, "2026-07-10", "", true)).toEqual({ kind: "create" });
  });

  it("updates when title/date changed and an event already exists", () => {
    expect(decideReminderAction(true, "2026-07-10", "evt1", true)).toEqual({
      kind: "update",
      eventId: "evt1",
    });
  });

  it("does nothing when an event exists but nothing reminder-relevant changed", () => {
    expect(decideReminderAction(true, "2026-07-10", "evt1", false)).toEqual({ kind: "none" });
  });

  it("deletes when remind turned off and an event exists", () => {
    expect(decideReminderAction(false, "2026-07-10", "evt1", false)).toEqual({
      kind: "delete",
      eventId: "evt1",
    });
  });

  it("does nothing when remind is off and there's no event", () => {
    expect(decideReminderAction(false, "2026-07-10", "", false)).toEqual({ kind: "none" });
  });
});

describe("syncTaskReminder", () => {
  it("no-ops immediately when not connected — never touches the network", async () => {
    isConnected.mockReturnValue(false);
    const result = await syncTaskReminder(task({ remind: true, dueDate: "2026-07-10" }), true);
    expect(result).toBeUndefined();
    expect(calendarMock.createEvent).not.toHaveBeenCalled();
  });

  it("creates an event and returns the new id", async () => {
    isConnected.mockReturnValue(true);
    calendarMock.createEvent.mockResolvedValue("evt-new");
    const result = await syncTaskReminder(task({ remind: true, dueDate: "2026-07-10" }), true);
    expect(calendarMock.createEvent).toHaveBeenCalledWith("Water plants", "2026-07-10", undefined);
    expect(result).toEqual({ calendarEventId: "evt-new" });
  });

  it("updates an existing event without changing the stored id", async () => {
    isConnected.mockReturnValue(true);
    calendarMock.updateEvent.mockResolvedValue(undefined);
    const result = await syncTaskReminder(
      task({ remind: true, dueDate: "2026-07-11", calendarEventId: "evt1" }),
      true
    );
    expect(calendarMock.updateEvent).toHaveBeenCalledWith("evt1", "Water plants", "2026-07-11", undefined);
    expect(result).toBeUndefined();
  });

  it("deletes and clears the id when remind is turned off", async () => {
    isConnected.mockReturnValue(true);
    calendarMock.deleteEvent.mockResolvedValue(undefined);
    const result = await syncTaskReminder(
      task({ remind: false, dueDate: "2026-07-11", calendarEventId: "evt1" }),
      false
    );
    expect(calendarMock.deleteEvent).toHaveBeenCalledWith("evt1");
    expect(result).toEqual({ calendarEventId: "" });
  });

  it("swallows a failed call (e.g. popup cancelled) and returns undefined", async () => {
    isConnected.mockReturnValue(true);
    calendarMock.createEvent.mockRejectedValue(new Error("Authorization was cancelled."));
    const result = await syncTaskReminder(task({ remind: true, dueDate: "2026-07-10" }), true);
    expect(result).toBeUndefined();
  });
});

describe("cancelReminder", () => {
  it("does nothing when there's no event id — never touches the network", async () => {
    isConnected.mockReturnValue(true);
    await cancelReminder("");
    expect(calendarMock.deleteEvent).not.toHaveBeenCalled();
  });

  it("no-ops when not connected", async () => {
    isConnected.mockReturnValue(false);
    await cancelReminder("evt1");
    expect(calendarMock.deleteEvent).not.toHaveBeenCalled();
  });

  it("deletes the event when connected", async () => {
    isConnected.mockReturnValue(true);
    calendarMock.deleteEvent.mockResolvedValue(undefined);
    await cancelReminder("evt1");
    expect(calendarMock.deleteEvent).toHaveBeenCalledWith("evt1");
  });

  it("swallows a failed delete", async () => {
    isConnected.mockReturnValue(true);
    calendarMock.deleteEvent.mockRejectedValue(new Error("network down"));
    await expect(cancelReminder("evt1")).resolves.toBeUndefined();
  });
});

describe("syncDailyDigest", () => {
  it("no-ops when not connected", async () => {
    isConnected.mockReturnValue(false);
    const result = await syncDailyDigest("08:00", "");
    expect(result).toBeUndefined();
    expect(calendarMock.createOrUpdateDailyDigest).not.toHaveBeenCalled();
  });

  it("creates/updates the digest event when a time is set", async () => {
    isConnected.mockReturnValue(true);
    calendarMock.createOrUpdateDailyDigest.mockResolvedValue("evt-digest");
    const result = await syncDailyDigest("08:00", "");
    expect(calendarMock.createOrUpdateDailyDigest).toHaveBeenCalledWith("", "08:00", "Daily planning digest");
    expect(result).toBe("evt-digest");
  });

  it("deletes the digest event and clears the id when turned off", async () => {
    isConnected.mockReturnValue(true);
    calendarMock.deleteEvent.mockResolvedValue(undefined);
    const result = await syncDailyDigest("", "evt-digest");
    expect(calendarMock.deleteEvent).toHaveBeenCalledWith("evt-digest");
    expect(result).toBe("");
  });

  it("does nothing when turned off and there was never an event", async () => {
    isConnected.mockReturnValue(true);
    const result = await syncDailyDigest("", "");
    expect(result).toBeUndefined();
    expect(calendarMock.deleteEvent).not.toHaveBeenCalled();
  });
});
