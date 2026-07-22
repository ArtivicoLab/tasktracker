import { useMemo, useState } from "react";
import { Checkbox } from "../../components/Checkbox";
import { EmptyState } from "../../components/EmptyState";
import { BottomSheet } from "../../components/BottomSheet";
import { HelpTip } from "../../components/HelpTip";
import { IconRepeat } from "../../components/icons";
import { TaskSheet } from "../tasks/TaskSheet";
import { useTasks } from "../../stores/useTasks";
import { useSettings } from "../../stores/useSettings";
import { expandOccurrences } from "../../lib/recurrence";
import { addDaysISO, dayNum, dueLabel, daysBetween, todayISO, weekdayShort } from "../../lib/dates";
import { categoryColor, categoryPillBg, categoryPillInk, frequencyLabel, PRIORITY_COLOR, PRIORITY_LABEL } from "../../lib/ui";
import { PRIORITIES, type Frequency, type Priority, type Recurrence, type Task } from "../../lib/types";

type RecSort = "next" | "priority" | "name" | "category";
const REC_SORTS: { value: RecSort; label: string }[] = [
  { value: "next", label: "Next occurrence" },
  { value: "priority", label: "Priority" },
  { value: "category", label: "Category" },
  { value: "name", label: "Name" },
];
const REC_PRI_RANK: Record<Priority, number> = {
  VeryHigh: 0, High: 1, Medium: 2, Low: 3, VeryLow: 4,
};

/* Nominal cycle length in days — drives the cycle ring's fill fraction.
   Months/years use calendar-ish approximations; the ring is a *feel* for how
   deep into the cycle a series is, not a due-date calculation (those all go
   through expandOccurrences as usual). */
function cycleDays(f: Frequency): number {
  if (f === "daily") return 1;
  if (f === "weekly") return 7;
  if (f === "biweekly") return 14;
  if (f === "monthly") return 30;
  if (f === "yearly") return 365;
  const [name, n] = f.split(":");
  if (name === "every_n_weeks") return 7 * Number(n);
  if (name === "every_n_months") return 30 * Number(n);
  return 7;
}

const CADENCE_DAYS = 14;

// Sticker pop-shadow pairing: always a SIBLING candy hue, never a category's
// own tone. Falls back to pink (safe default for hash-assigned custom
// category colors this map doesn't name).
const POP_FOR_CATEGORY: Record<string, string> = {
  Home: "cyan",
  Health: "pink",
  Finance: "pink",
  Work: "lemon",
  Growth: "lemon",
};
// .rec-card already has a hover transform (lift on hover) — a sticker-rot-*
// CLASS would just lose a specificity tie-break against that rule instead of
// composing with it, so the tilt is threaded through as a --rot custom
// property that .rec-card's own transform reads at rest AND on hover
// (rotate(var(--rot)) translateY(-3px)) instead.
const ROTATIONS = ["-1.1deg", "0.8deg", "-0.6deg"];

export function RecurringScreen() {
  const {
    recurrences,
    tasks,
    toggleOccurrence,
    toggleComplete,
    materialize,
    updateRecurrence,
    deleteRecurrence,
  } = useTasks();
  const { categories } = useSettings();

  const [editTask, setEditTask] = useState<Task | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [menuFor, setMenuFor] = useState<Recurrence | null>(null);

  const [catFilter, setCatFilter] = useState("");
  const [priFilter, setPriFilter] = useState<Priority | "">("");
  const [assigneeFilter, setAssigneeFilter] = useState("");
  const [activeFilter, setActiveFilter] = useState<"all" | "active" | "paused">("all");
  const [sort, setSort] = useState<RecSort>("next");

  const today = todayISO();
  const horizon = addDaysISO(today, 120);

  // materialized override lookup by recurrenceId:date
  const overrides = useMemo(() => {
    const map = new Map<string, Task>();
    for (const t of tasks) {
      if (t.recurrenceId && t.occurrenceDate) map.set(`${t.recurrenceId}:${t.occurrenceDate}`, t);
    }
    return map;
  }, [tasks]);

  const catsForFilter = useMemo(() => {
    const seen = new Set(categories);
    const extra = recurrences.map((r) => r.category).filter((c) => c && !seen.has(c));
    return [...categories, ...new Set(extra)];
  }, [categories, recurrences]);

  const assignees = useMemo(
    () => Array.from(new Set(recurrences.map((r) => r.assignee).filter(Boolean))).sort(),
    [recurrences]
  );

  const series = useMemo(() => {
    const filtered = recurrences.filter((r) => {
      if (catFilter && r.category !== catFilter) return false;
      if (priFilter && r.priority !== priFilter) return false;
      if (assigneeFilter && r.assignee !== assigneeFilter) return false;
      if (activeFilter === "active" && !r.active) return false;
      if (activeFilter === "paused" && r.active) return false;
      return true;
    });
    return filtered.sort((a, b) => {
      if (a.active !== b.active) return a.active ? -1 : 1;
      if (sort === "priority") return REC_PRI_RANK[a.priority] - REC_PRI_RANK[b.priority];
      if (sort === "name") return a.title.localeCompare(b.title);
      if (sort === "category") return a.category.localeCompare(b.category);
      const na = expandOccurrences(a, today, horizon)[0];
      const nb = expandOccurrences(b, today, horizon)[0];
      if (na && nb) return na < nb ? -1 : na > nb ? 1 : 0;
      if (na) return -1;
      if (nb) return 1;
      return 0;
    });
  }, [recurrences, catFilter, priFilter, assigneeFilter, activeFilter, sort, today, horizon]);

  function openOccurrence(rec: Recurrence, date: string) {
    const task = materialize(rec.id, date);
    setEditTask(task);
    setSheetOpen(true);
  }

  return (
    <>
      <div className="screen-head">
        <div className="screen-head__eyebrow">Set once · repeats on its own</div>
        <h1 className="screen-head__title">
          Recurring
          <HelpTip text="Templates for tasks that repeat: daily, weekly, monthly, or a custom interval. Editing one occurrence never changes past ones; editing the series changes future ones." />
        </h1>
      </div>

      {recurrences.length > 0 && (
        <div data-tour="recurring-filters">
          <div className="chip-row mt-3">
            <button className={`chip${!activeFilter || activeFilter === "all" ? " chip--on" : ""}`} onClick={() => setActiveFilter("all")}>
              All
            </button>
            <button className={`chip${activeFilter === "active" ? " chip--on" : ""}`} onClick={() => setActiveFilter("active")}>
              Active only
            </button>
            <button className={`chip${activeFilter === "paused" ? " chip--on" : ""}`} onClick={() => setActiveFilter("paused")}>
              Paused only
            </button>
          </div>
          {catsForFilter.length > 0 && (
            <div className="chip-row">
              <button className={`chip${!catFilter ? " chip--on" : ""}`} onClick={() => setCatFilter("")}>
                All categories
              </button>
              {catsForFilter.map((c) => (
                <button key={c} className={`chip${catFilter === c ? " chip--on" : ""}`} onClick={() => setCatFilter(catFilter === c ? "" : c)}>
                  <span className="dot-9 dot-9--round" style={{ background: categoryColor(c) }} />
                  {c}
                </button>
              ))}
            </div>
          )}
          <div className="chip-row">
            <button className={`chip${!priFilter ? " chip--on" : ""}`} onClick={() => setPriFilter("")}>
              All priorities
            </button>
            {PRIORITIES.map((p) => (
              <button key={p} className={`chip${priFilter === p ? " chip--on" : ""}`} onClick={() => setPriFilter(priFilter === p ? "" : p)}>
                <span className="dot-9 dot-9--round" style={{ background: PRIORITY_COLOR[p] }} />
                {PRIORITY_LABEL[p]}
              </button>
            ))}
          </div>
          {assignees.length > 0 && (
            <div className="chip-row">
              <button className={`chip${!assigneeFilter ? " chip--on" : ""}`} onClick={() => setAssigneeFilter("")}>
                Anyone
              </button>
              {assignees.map((a) => (
                <button key={a} className={`chip${assigneeFilter === a ? " chip--on" : ""}`} onClick={() => setAssigneeFilter(assigneeFilter === a ? "" : a)}>
                  {a}
                </button>
              ))}
            </div>
          )}
          <div className="filterbar" style={{ marginTop: 10 }}>
            <select className="input input--sm" aria-label="Sort routines by" value={sort} onChange={(e) => setSort(e.target.value as RecSort)}>
              {REC_SORTS.map((o) => <option key={o.value} value={o.value}>Sort: {o.label}</option>)}
            </select>
          </div>
        </div>
      )}

      {recurrences.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<IconRepeat size={28} />}
            title="No routines yet"
            sub="Create a task with a Repeat option and it shows up here, with every upcoming occurrence."
          />
        </div>
      ) : series.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<IconRepeat size={28} />}
            title="Nothing matches these filters"
            sub="Try clearing a filter above."
          />
        </div>
      ) : (
        <>
        {/* Cadence field: every active series' next 14 days as one score */}
        {series.some((r) => r.active) && (
          <div className="card mb-4">
            <div className="muted eyebrow-12 mb-2" style={{ textTransform: "uppercase", letterSpacing: "0.04em" }}>
              The next 14 days
            </div>
            <div className="cadence-scroll">
              <div className="cadence" role="img" aria-label="Calendar of upcoming occurrences for each routine over the next 14 days">
                <span className="cadence__corner" />
                {Array.from({ length: CADENCE_DAYS }, (_, i) => addDaysISO(today, i)).map((d, i) => (
                  <span key={d} className={`cadence__dayhead${i === 0 ? " cadence__dayhead--today" : ""}`}>
                    <span className="cadence__wd">{weekdayShort(d).slice(0, 1)}</span>
                    <span className="cadence__dn">{dayNum(d)}</span>
                  </span>
                ))}
                {series.filter((r) => r.active).map((rec, rowIdx, activeRows) => {
                  const hits = new Set(expandOccurrences(rec, today, addDaysISO(today, CADENCE_DAYS - 1)));
                  const color = categoryColor(rec.category);
                  return (
                    <span key={rec.id} style={{ display: "contents" }}>
                      <span className="cadence__label">
                        <span className="cadence__label-dot" style={{ background: color }} />
                        <span className="cadence__label-txt">{rec.title}</span>
                      </span>
                      {Array.from({ length: CADENCE_DAYS }, (_, i) => addDaysISO(today, i)).map((d, i) => (
                        <span
                          key={d}
                          className={`cadence__cell${i === 0 ? " cadence__cell--today" : ""}${
                            i === 0 && rowIdx === activeRows.length - 1 ? " cadence__cell--rowlast" : ""
                          }`}
                        >
                          {hits.has(d) ? (
                            <span
                              className={`cadence__dot${i === 0 ? " cadence__dot--today" : ""}`}
                              style={{ background: color }}
                            />
                          ) : (
                            <span className="cadence__tick" />
                          )}
                        </span>
                      ))}
                    </span>
                  );
                })}
              </div>
            </div>
          </div>
        )}
        <div className="rec-grid">
        {series.map((rec, idx) => {
          const dates = expandOccurrences(rec, today, horizon).slice(0, 6);
          const next = dates[0];
          // The top bar is a solid mid-tone fill against the card's neutral
          // surface — fine as-is. The pill/chip below put text ON TOP of a
          // tinted version of the same hue, so they need the soft/deep PAIR
          // (categoryPillBg/Ink), not the mid-tone used as both fill and
          // text color — that was pale-on-pale, barely readable (confirmed
          // 2026-07-20: "red text on red background").
          const barColor = categoryColor(rec.category);
          const pillBg = categoryPillBg(rec.category);
          const pillInk = categoryPillInk(rec.category);
          // Cycle ring: how far through its own cycle this series is —
          // empty right after an occurrence, full the day the next lands.
          const cycle = cycleDays(rec.frequency);
          const daysUntil = next ? daysBetween(today, next) : null;
          const frac =
            !rec.active || daysUntil === null
              ? 0
              : Math.min(1, Math.max(0.04, 1 - daysUntil / cycle));
          const pop = POP_FOR_CATEGORY[rec.category] ?? "pink";
          const rot = ROTATIONS[idx % ROTATIONS.length];
          return (
            <div
              className={`card rec-card pop-${pop}`}
              data-tour="recurring-list"
              key={rec.id}
              style={{ opacity: rec.active ? 1 : 0.6, ["--rot" as string]: rot }}
            >
              <span className="rec-card__bar" style={{ background: barColor }} />
              <div className="spread spread--top">
                <span className="rec-freq" style={{ background: pillBg, color: pillInk }}>
                  {frequencyLabel(rec.frequency)}
                </span>
                <button
                  className={`toggle-switch${rec.active ? " toggle-switch--on" : ""}`}
                  role="switch"
                  aria-checked={rec.active}
                  aria-label={rec.active ? `Pause ${rec.title}` : `Resume ${rec.title}`}
                  onClick={() => updateRecurrence(rec.id, { active: !rec.active })}
                />
              </div>
              <div className="rec-card__mid">
                <div
                  className="cycle-ring"
                  style={{ ["--frac" as string]: frac, ["--ring-color" as string]: barColor }}
                  aria-label={
                    !rec.active
                      ? "Paused"
                      : daysUntil === null
                        ? "No upcoming occurrence"
                        : daysUntil === 0
                          ? "Next occurrence is today"
                          : `Next occurrence in ${daysUntil} day${daysUntil > 1 ? "s" : ""}`
                  }
                >
                  <span className="cycle-ring__hole">
                    {!rec.active || daysUntil === null ? (
                      <span className="cycle-ring__num cycle-ring__num--word muted">
                        {rec.active ? "none" : "off"}
                      </span>
                    ) : daysUntil === 0 ? (
                      <span className="cycle-ring__num cycle-ring__num--word" style={{ color: pillInk }}>
                        today
                      </span>
                    ) : (
                      <span>
                        <span className="cycle-ring__num">{daysUntil}</span>
                        <span className="cycle-ring__unit">day{daysUntil > 1 ? "s" : ""}</span>
                      </span>
                    )}
                  </span>
                </div>
                <div className="rec-card__midtext">
                  <div className="rec-card__name">{rec.title}</div>
                  <div className="muted rec-card__sub">
                    {rec.active ? (next ? `Next: ${dueLabel(next)}` : "No upcoming") : "Paused"}
                    {rec.assignee ? ` · ${rec.assignee}` : ""}
                  </div>
                </div>
              </div>
              <div className="spread rec-card__foot">
                <span className="chip" style={{ padding: "3px 10px", fontSize: 11, background: pillBg, color: pillInk }}>
                  {rec.category}
                </span>
                <button className="muted rec-manage-link" data-tour="recurring-manage" onClick={() => setMenuFor(rec)}>
                  {dates.length} upcoming →
                </button>
              </div>
            </div>
          );
        })}
        </div>
        </>
      )}

      {/* Series actions + upcoming occurrences */}
      <BottomSheet open={!!menuFor} title={menuFor?.title} onClose={() => setMenuFor(null)}>
        {menuFor && (
          <>
            {menuFor.active && (
              <div className="card card--tight mb-4">
                {expandOccurrences(menuFor, today, horizon).slice(0, 6).map((date) => {
                  const real = overrides.get(`${menuFor.id}:${date}`);
                  const done = real?.status === "Completed";
                  const modified = !!real;
                  return (
                    <div key={date} className={`row${done ? " row--done" : ""}`}>
                      <Checkbox
                        checked={done}
                        label={`${menuFor.title} ${date}`}
                        onChange={() => {
                          if (real) toggleComplete(real.id);
                          else
                            toggleOccurrence({
                              key: `${menuFor.id}:${date}`, date, title: menuFor.title,
                              category: menuFor.category, priority: menuFor.priority, assignee: menuFor.assignee,
                              recurrenceId: menuFor.id, status: "NotStarted", remind: menuFor.remind, virtual: true,
                            });
                        }}
                      />
                      <button className="row__body" style={{ background: "none", textAlign: "left" }}
                        onClick={() => { openOccurrence(menuFor, date); setMenuFor(null); }}>
                        <div className="row__title" style={{ fontSize: 14 }}>{dueLabel(date)}</div>
                        <div className="row__sub">{date}</div>
                      </button>
                      {modified && !done && (
                        <span className="chip" style={{ padding: "3px 8px", fontSize: 11, background: "var(--accent-soft)", color: "var(--accent)" }}>
                          edited
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            <button className="btn" style={{ marginBottom: 10 }}
              onClick={() => { deleteRecurrence(menuFor.id, "future"); setMenuFor(null); }}>
              End future occurrences (keep past)
            </button>
            <button className="btn btn--danger"
              onClick={() => { deleteRecurrence(menuFor.id, "all"); setMenuFor(null); }}>
              Delete series entirely
            </button>
          </>
        )}
      </BottomSheet>

      <TaskSheet open={sheetOpen} editTask={editTask} onClose={() => { setSheetOpen(false); setEditTask(null); }} />
    </>
  );
}
