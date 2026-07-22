import { describe, expect, it } from "vitest";
import {
  expandOccurrences,
  occurrencesForWindow,
  parseFrequency,
} from "../src/lib/recurrence";
import type { Recurrence, Task } from "../src/lib/types";

function rec(partial: Partial<Recurrence>): Recurrence {
  return {
    id: "r1",
    title: "Test",
    notes: "",
    category: "Home",
    priority: "Medium",
    assignee: "",
    frequency: "weekly",
    anchorDate: "2026-01-01",
    endDate: "",
    remind: false,
    active: true,
    createdAt: "",
    updatedAt: "",
    ...partial,
  };
}

describe("parseFrequency", () => {
  it("parses named + parameterized frequencies", () => {
    expect(parseFrequency("daily")).toEqual({ kind: "days", step: 1 });
    expect(parseFrequency("weekly")).toEqual({ kind: "days", step: 7 });
    expect(parseFrequency("biweekly")).toEqual({ kind: "days", step: 14 });
    expect(parseFrequency("every_n_weeks:3")).toEqual({ kind: "days", step: 21 });
    expect(parseFrequency("every_n_months:2")).toEqual({ kind: "months", step: 2 });
    expect(parseFrequency("yearly")).toEqual({ kind: "years", step: 1 });
  });
});

describe("weekly / biweekly / every_n_weeks", () => {
  it("weekly anchored to weekday", () => {
    const r = rec({ frequency: "weekly", anchorDate: "2026-01-01" }); // Thu
    const out = expandOccurrences(r, "2026-01-01", "2026-01-31");
    expect(out).toEqual([
      "2026-01-01",
      "2026-01-08",
      "2026-01-15",
      "2026-01-22",
      "2026-01-29",
    ]);
  });

  it("biweekly", () => {
    const r = rec({ frequency: "biweekly", anchorDate: "2026-01-01" });
    const out = expandOccurrences(r, "2026-01-01", "2026-02-28");
    expect(out).toEqual(["2026-01-01", "2026-01-15", "2026-01-29", "2026-02-12", "2026-02-26"]);
  });

  it.each([2, 3, 4, 5, 6])("every_n_weeks with n=%i", (n) => {
    const r = rec({ frequency: `every_n_weeks:${n}` as Recurrence["frequency"] });
    const out = expandOccurrences(r, "2026-01-01", "2026-12-31");
    // consecutive gaps are exactly n*7 days
    for (let i = 1; i < out.length; i++) {
      const a = new Date(out[i - 1]).getTime();
      const bT = new Date(out[i]).getTime();
      expect((bT - a) / 86400000).toBe(n * 7);
    }
  });
});

describe("monthly clamping", () => {
  it("31st clamps to last day of shorter months", () => {
    const r = rec({ frequency: "monthly", anchorDate: "2026-01-31" });
    const out = expandOccurrences(r, "2026-01-01", "2026-06-30");
    expect(out).toEqual([
      "2026-01-31",
      "2026-02-28", // clamp
      "2026-03-31",
      "2026-04-30", // clamp
      "2026-05-31",
      "2026-06-30", // clamp
    ]);
  });

  it("every_n_months:2", () => {
    const r = rec({ frequency: "every_n_months:2", anchorDate: "2026-01-15" });
    const out = expandOccurrences(r, "2026-01-01", "2026-12-31");
    expect(out).toEqual([
      "2026-01-15",
      "2026-03-15",
      "2026-05-15",
      "2026-07-15",
      "2026-09-15",
      "2026-11-15",
    ]);
  });
});

describe("yearly / leap years", () => {
  it("Feb 29 falls back to Feb 28 in non-leap years", () => {
    const r = rec({ frequency: "yearly", anchorDate: "2024-02-29" });
    const out = expandOccurrences(r, "2024-01-01", "2027-12-31");
    expect(out).toEqual(["2024-02-29", "2025-02-28", "2026-02-28", "2027-02-28"]);
  });
});

describe("windowing, anchor, endDate", () => {
  it("only returns dates inside the window", () => {
    const r = rec({ frequency: "daily", anchorDate: "2026-01-01" });
    const out = expandOccurrences(r, "2026-03-10", "2026-03-12");
    expect(out).toEqual(["2026-03-10", "2026-03-11", "2026-03-12"]);
  });

  it("never emits before anchorDate", () => {
    const r = rec({ frequency: "weekly", anchorDate: "2026-06-01" });
    const out = expandOccurrences(r, "2026-01-01", "2026-06-30");
    expect(out.every((d) => d >= "2026-06-01")).toBe(true);
    expect(out[0]).toBe("2026-06-01");
  });

  it("respects endDate", () => {
    const r = rec({
      frequency: "weekly",
      anchorDate: "2026-01-01",
      endDate: "2026-01-15",
    });
    const out = expandOccurrences(r, "2026-01-01", "2026-03-01");
    expect(out).toEqual(["2026-01-01", "2026-01-08", "2026-01-15"]);
  });

  it("paused (active=false) yields nothing", () => {
    const r = rec({ active: false });
    expect(expandOccurrences(r, "2026-01-01", "2026-12-31")).toEqual([]);
  });
});

describe("materialized overrides survive (per-occurrence edit)", () => {
  const r = rec({ frequency: "weekly", anchorDate: "2026-01-01", title: "Series" });
  const override: Task = {
    id: "t1",
    title: "Edited occurrence",
    notes: "",
    category: "Work",
    priority: "High",
    status: "Completed",
    assignee: "Sam",
    dueDate: "2026-01-08",
    recurrenceId: "r1",
    occurrenceDate: "2026-01-08",
    remind: false,
    calendarEventId: "",
    completedAt: "2026-01-08T10:00:00Z",
    createdAt: "",
    updatedAt: "",
  };

  it("materialized row overrides the computed one at that date", () => {
    const occ = occurrencesForWindow([r], [override], "2026-01-01", "2026-01-31");
    const jan8 = occ.find((o) => o.date === "2026-01-08");
    expect(jan8?.virtual).toBe(false);
    expect(jan8?.title).toBe("Edited occurrence");
    expect(jan8?.status).toBe("Completed");
    // other dates remain virtual from the series
    const jan15 = occ.find((o) => o.date === "2026-01-15");
    expect(jan15?.virtual).toBe(true);
    expect(jan15?.title).toBe("Series");
  });

  it("editing the series does not retroactively change a materialized past row", () => {
    const edited = { ...r, title: "Renamed series" };
    const occ = occurrencesForWindow([edited], [override], "2026-01-01", "2026-01-31");
    expect(occ.find((o) => o.date === "2026-01-08")?.title).toBe("Edited occurrence");
    expect(occ.find((o) => o.date === "2026-01-15")?.title).toBe("Renamed series");
  });
});

describe("DST boundary", () => {
  it("daily count is stable across a spring-forward week (calendar days, not hours)", () => {
    // US DST 2026 begins Sun Mar 8. Plain-date math must not drop/dup a day.
    const r = rec({ frequency: "daily", anchorDate: "2026-03-06" });
    const out = expandOccurrences(r, "2026-03-06", "2026-03-12");
    expect(out).toEqual([
      "2026-03-06",
      "2026-03-07",
      "2026-03-08",
      "2026-03-09",
      "2026-03-10",
      "2026-03-11",
      "2026-03-12",
    ]);
  });
});
