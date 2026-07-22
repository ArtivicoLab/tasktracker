import { useEffect, useMemo, useState } from "react";
import { Segmented } from "../../components/Segmented";
import { BottomSheet } from "../../components/BottomSheet";
import { Checkbox } from "../../components/Checkbox";
import { ProgressRing } from "../../components/ProgressRing";
import { HelpTip } from "../../components/HelpTip";
import { IconChevron, IconRepeat, IconTarget } from "../../components/icons";
import { TaskSheet } from "../tasks/TaskSheet";
import { QuickCapture } from "./QuickCapture";
import { buildAgenda, sortAgenda } from "../tasks/agenda";
import { useTasks } from "../../stores/useTasks";
import { useSettings } from "../../stores/useSettings";
import {
  addDaysISO,
  addMonthsISO,
  fromISO,
  format,
  inSameMonth,
  monthGridISO,
  monthTitle,
  todayISO,
  weekDaysISO,
  weekdayShort,
} from "../../lib/dates";
import { categoryColor, categoryPillBg, categoryPillInk, PRIORITY_COLOR, PRIORITY_LABEL, STATUS_COLOR, STATUS_LABEL } from "../../lib/ui";
import { PRIORITIES, STATUSES, type Occurrence, type Priority, type Recurrence, type Status, type Task } from "../../lib/types";

type View = "month" | "week" | "day";
const VIEWS = [
  { value: "month" as View, label: "Month" },
  { value: "week" as View, label: "Week" },
  { value: "day" as View, label: "Day" },
];

// Soft per-day header tints (our palette — mockups give structure, not colors).
const DAY_TINTS = [
  "var(--cat-pink)", "var(--cat-teal)", "var(--cat-butter)", "var(--cat-sky)",
  "var(--cat-lavender)", "var(--cat-teal)", "var(--cat-pink)",
];
const ROTATIONS = ["-1.1deg", "0.8deg", "-0.6deg", "0.7deg", "-0.9deg", "0.5deg", "-0.4deg"];
const POP_FOR_TINT: Record<string, string> = {
  "var(--cat-pink)": "cyan",
  "var(--cat-teal)": "pink",
  "var(--cat-butter)": "pink",
  "var(--cat-sky)": "lemon",
  "var(--cat-lavender)": "lemon",
};

// Consecutive-day streak, computed from real completion data — a day with
// zero items due doesn't break it (nothing was missed), a day with anything
// left undone does. Today is never allowed to BREAK the streak (the day
// isn't over yet) but a fully-done today does extend it. Bounded lookback
// so a brand-new account with no history doesn't loop for nothing.
const STREAK_LOOKBACK_DAYS = 90;
function computeStreak(tasks: Task[], recurrences: Recurrence[], today: string): number {
  const start = addDaysISO(today, -STREAK_LOOKBACK_DAYS);
  const byDay = new Map<string, { done: number; total: number }>();
  for (const it of buildAgenda(tasks, recurrences, start, today)) {
    if (!it.date) continue;
    const s = byDay.get(it.date) ?? { done: 0, total: 0 };
    s.total++;
    if (it.done) s.done++;
    byDay.set(it.date, s);
  }
  let streak = 0;
  for (let i = 0; i <= STREAK_LOOKBACK_DAYS; i++) {
    const d = addDaysISO(today, -i);
    const s = byDay.get(d);
    if (!s || s.total === 0) continue; // nothing due that day — doesn't break it
    const allDone = s.done === s.total;
    if (i === 0 && !allDone) continue; // today isn't over — don't count it, don't break it either
    if (!allDone) break;
    streak++;
  }
  return streak;
}

function FlameIcon({ color, size = 12 }: { color: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <path
        d="M12 2c1 5-4 6-4 11a4 4 0 0 0 8 0c0-2-1-3-2-4 1 3-1 4-2 2-1-2 1-4 0-9z"
        fill={color}
        stroke="var(--outline)"
        strokeWidth="1.4"
      />
    </svg>
  );
}

interface CalItem {
  key: string;
  title: string;
  color: string;
  done: boolean;
  category: string;
  assignee: string;
  priority: Priority;
  status: Status;
  taskId?: string;
  occurrence?: Occurrence;
}

export function CalendarScreen() {
  const { tasks, recurrences, toggleComplete, toggleOccurrence, materialize } = useTasks();
  const { weekStart, categories } = useSettings();

  const [view, setView] = useState<View>("month");
  const [cursor, setCursor] = useState(todayISO());
  const [selected, setSelected] = useState<string | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  // filters: which categories/statuses are HIDDEN (matches "do not show")
  const [hiddenCat, setHiddenCat] = useState<Set<string>>(new Set());
  const [hiddenStatus, setHiddenStatus] = useState<Set<Status>>(new Set());
  // assignee/priority: "show only" filters
  const [assigneeFilter, setAssigneeFilter] = useState<string>("");
  const [priFilter, setPriFilter] = useState<Priority | "">("");

  // inline "write straight in the cell/day"
  const [addingDate, setAddingDate] = useState<string | null>(null);
  // The coach tour flips this on to show a non-saving example entry so it can
  // point at the category picker without the user typing first.
  const [coachDemo, setCoachDemo] = useState(false);
  useEffect(() => {
    const on = () => setCoachDemo(true);
    const off = () => setCoachDemo(false);
    window.addEventListener("coach:calendar-demo-on", on);
    window.addEventListener("coach:calendar-demo-off", off);
    return () => {
      window.removeEventListener("coach:calendar-demo-on", on);
      window.removeEventListener("coach:calendar-demo-off", off);
    };
  }, []);

  const today = todayISO();
  const weekDays = weekDaysISO(cursor, weekStart);
  const days =
    view === "month" ? monthGridISO(cursor, weekStart)
    : view === "week" ? weekDays
    : [cursor];
  const winStart = days[0];
  const winEnd = days[days.length - 1];
  const weekHeader = weekDays.map((d) => weekdayShort(d));

  const byDate = useMemo(() => {
    const map = new Map<string, CalItem[]>();
    for (const it of sortAgenda(buildAgenda(tasks, recurrences, winStart, winEnd))) {
      if (!it.date) continue;
      const arr = map.get(it.date) ?? [];
      arr.push({
        key: it.key,
        title: it.title,
        color: categoryColor(it.category),
        done: it.done,
        category: it.category,
        assignee: it.assignee,
        priority: it.priority,
        status: it.status,
        taskId: it.taskId,
        occurrence: it.occurrence,
      });
      map.set(it.date, arr);
    }
    return map;
  }, [tasks, recurrences, winStart, winEnd]);

  const catsPresent = useMemo(() => {
    const s = new Set<string>();
    for (const arr of byDate.values()) for (const it of arr) if (it.category) s.add(it.category);
    return [...s];
  }, [byDate]);

  // Month strip (week view only): 14 days — a week before + the current
  // week — each carrying a small pip in that day's DOMINANT category color
  // (whichever category has the most items due), so it doubles as a color-
  // rhythm preview of the days around the visible week, not just a plain
  // date picker. Needs its own wider agenda pull since it reaches outside
  // the current 7-day window.
  const stripStart = addDaysISO(weekDays[0], -7);
  const stripEnd = addDaysISO(weekDays[0], 6);
  const stripDots = useMemo(() => {
    if (view !== "week") return new Map<string, string>();
    const byDay = new Map<string, Record<string, number>>();
    for (const it of buildAgenda(tasks, recurrences, stripStart, stripEnd)) {
      if (!it.date || !it.category) continue;
      const counts = byDay.get(it.date) ?? {};
      counts[it.category] = (counts[it.category] ?? 0) + 1;
      byDay.set(it.date, counts);
    }
    const dots = new Map<string, string>();
    for (const [d, counts] of byDay) {
      const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
      if (top) dots.set(d, categoryColor(top[0]));
    }
    return dots;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, tasks, recurrences, stripStart, stripEnd]);

  // Weekly hero banner stats (week view only) — all real, from the same
  // items already shown in that week's columns, plus a real streak (see
  // computeStreak above; never fabricated/decorative).
  const weekStats = useMemo(() => {
    if (view !== "week") return null;
    const items = weekDays.flatMap((d) => byDate.get(d) ?? []);
    const done = items.filter((it) => it.done).length;
    const total = items.length;
    return { done, total };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, weekDays, byDate]);
  const weekOverdue = weekDays.reduce((n, d) => n + (byDate.get(d) ?? []).filter((it) => d < today && !it.done).length, 0);
  const streak = useMemo(() => computeStreak(tasks, recurrences, today), [tasks, recurrences, today]);

  // Month legend bar stats (month view only) — real completion % for every
  // item actually shown in the visible month grid (including the dimmed
  // lead/trail days from adjacent months, matching what's on screen).
  const monthStats = useMemo(() => {
    if (view !== "month") return null;
    const items = days.flatMap((d) => byDate.get(d) ?? []);
    const done = items.filter((it) => it.done).length;
    const total = items.length;
    return { done, total, pct: total ? Math.round((done / total) * 100) : 0 };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, days, byDate]);

  // Category filter chips always show the user's configured categories (like
  // the Tasks screen), plus any extra category that turns up in the data, so
  // category filtering is discoverable even on a brand-new blank account with
  // no tasks yet — not hidden until data happens to exist.
  const catsForFilter = useMemo(() => {
    const seen = new Set(categories);
    return [...categories, ...catsPresent.filter((c) => !seen.has(c))];
  }, [categories, catsPresent]);

  const assigneesPresent = useMemo(() => {
    const s = new Set<string>();
    for (const arr of byDate.values()) for (const it of arr) if (it.assignee) s.add(it.assignee);
    return [...s].sort();
  }, [byDate]);

  function visible(items: CalItem[] | undefined): CalItem[] {
    if (!items) return [];
    return items.filter((it) => {
      if (it.category && hiddenCat.has(it.category)) return false;
      if (it.status && hiddenStatus.has(it.status)) return false;
      if (assigneeFilter && it.assignee !== assigneeFilter) return false;
      if (priFilter && it.priority !== priFilter) return false;
      return true;
    });
  }

  function toggleItem(it: CalItem) {
    if (it.occurrence) toggleOccurrence(it.occurrence);
    else if (it.taskId) toggleComplete(it.taskId);
  }

  // Tapping an item's TEXT (as opposed to its checkbox) opens it for editing
  // instead of toggling it — there was previously no way to fix a typo or
  // even see full details once something landed on the calendar.
  function openItem(it: CalItem) {
    if (it.taskId) {
      const t = tasks.find((x) => x.id === it.taskId);
      if (t) setEditingTask(t);
    } else if (it.occurrence?.virtual) {
      setEditingTask(materialize(it.occurrence.recurrenceId, it.occurrence.date));
    }
  }

  const toggle = <T,>(set: Set<T>, v: T): Set<T> => {
    const n = new Set(set);
    n.has(v) ? n.delete(v) : n.add(v);
    return n;
  };

  const navBy = (dir: number) =>
    setCursor(
      view === "month" ? addMonthsISO(cursor, dir)
      : view === "week" ? addDaysISO(cursor, dir * 7)
      : addDaysISO(cursor, dir)
    );
  const title =
    view === "month"
      ? monthTitle(cursor)
      : view === "week"
      ? `${format(fromISO(weekDays[0]), "MMM d")} – ${format(fromISO(weekDays[6]), "MMM d")}`
      : format(fromISO(cursor), "EEEE, MMM d");

  return (
    <>
      <div className="screen-head" data-tour="calendar-head">
        <div className="screen-head__eyebrow">Filter &amp; write your view</div>
        <h1 className="screen-head__title">
          Calendar
          <HelpTip text="A month at a glance, spreadsheet-style: tap any day's cell and type a task. We'll guess its category and show a pill; tap the pill to change it before saving." />
        </h1>
      </div>

      <Segmented options={VIEWS} value={view} onChange={setView} />

      <div data-tour="calendar-filters">
        {catsForFilter.length > 0 && (
          <div className="chip-row mt-3">
            {catsForFilter.map((c) => {
              const on = !hiddenCat.has(c);
              return (
                <button key={c} className="chip" onClick={() => setHiddenCat(toggle(hiddenCat, c))}
                  style={{ opacity: on ? 1 : 0.4 }}>
                  <span className="dot-9 dot-9--round" style={{ background: categoryColor(c) }} />
                  {c}
                </button>
              );
            })}
          </div>
        )}
        {assigneesPresent.length > 0 && (
          <div className="chip-row">
            <button className={`chip${!assigneeFilter ? " chip--on" : ""}`} onClick={() => setAssigneeFilter("")}>
              Anyone
            </button>
            {assigneesPresent.map((a) => (
              <button key={a} className={`chip${assigneeFilter === a ? " chip--on" : ""}`}
                onClick={() => setAssigneeFilter(assigneeFilter === a ? "" : a)}>
                {a}
              </button>
            ))}
          </div>
        )}
        <div className="chip-row">
          <button className={`chip${!priFilter ? " chip--on" : ""}`} onClick={() => setPriFilter("")}>
            All priorities
          </button>
          {PRIORITIES.map((p) => (
            <button key={p} className={`chip${priFilter === p ? " chip--on" : ""}`}
              onClick={() => setPriFilter(priFilter === p ? "" : p)}>
              <span className="dot-9 dot-9--round" style={{ background: PRIORITY_COLOR[p] }} />
              {PRIORITY_LABEL[p]}
            </button>
          ))}
        </div>
        <div className="chip-row">
          {STATUSES.map((st) => {
            const on = !hiddenStatus.has(st);
            return (
              <button key={st} className="chip" onClick={() => setHiddenStatus(toggle(hiddenStatus, st))}
                style={{ opacity: on ? 1 : 0.4 }} aria-label={`${on ? "Hide" : "Show"} ${STATUS_LABEL[st]}`}>
                <span className="dot-9 dot-9--round" style={{ background: STATUS_COLOR[st] }} />
                {STATUS_LABEL[st]}
              </button>
            );
          })}
        </div>
      </div>

      {coachDemo && (
        <div className="cal-demo-entry">
          <div className="cal-demo-entry__label">Example entry</div>
          <QuickCapture date={today} demo initialDraft="Team meeting" className="cal-input"
            placeholder="Type a task…" onClose={() => {}} />
        </div>
      )}

      {view === "month" && monthStats && (
        /* Month legend bar — replaces the plain nav here: title + prev/next,
           all 5 category dots for quick reference, and the month's real
           completion + streak on the right, so switching from Week never
           loses the momentum framing, just condenses it to one line. */
        <div className="legendbar mt-3">
          <button className="legendbar__nav" aria-label="Previous month" onClick={() => navBy(-1)}>
            <IconChevron width={15} height={15} style={{ transform: "scaleX(-1)" }} />
          </button>
          <span className="legendbar__title">{title}</span>
          <button className="legendbar__nav" aria-label="Next month" onClick={() => navBy(1)}>
            <IconChevron width={15} height={15} />
          </button>
          <span className="legendbar__cats">
            {categories.map((c) => (
              <span key={c} className="lg-item">
                <span className="lg-dot" style={{ background: categoryColor(c) }} />
                {c}
              </span>
            ))}
          </span>
          <span className="legendbar__spacer" />
          <span className="legendbar__stat">
            {monthStats.pct}% complete this month{streak > 1 && <> · <b>{streak}-day streak</b></>}
          </span>
        </div>
      )}

      {view === "week" && (
        /* Month strip — jump to any nearby day without leaving week view;
           each date carries a pip in that day's dominant category color
           (real data — most-common category due that day), so the strip
           itself reads as a color-rhythm preview. */
        <div className="monthstrip mt-3">
          <button className="legendbar__nav" aria-label="Previous week" onClick={() => navBy(-1)}>
            <IconChevron width={15} height={15} style={{ transform: "scaleX(-1)" }} />
          </button>
          <span className="monthstrip__title">{format(fromISO(weekDays[0]), "MMMM yyyy")}</span>
          <div className="monthstrip__days">
            {Array.from({ length: 14 }, (_, i) => addDaysISO(stripStart, i)).map((d) => {
              const active = weekDays.includes(d);
              const dot = stripDots.get(d);
              return (
                <button
                  key={d}
                  className={`monthstrip__day${active ? " monthstrip__day--on" : ""}`}
                  aria-label={format(fromISO(d), "MMMM d")}
                  aria-current={active ? "date" : undefined}
                  onClick={() => setCursor(d)}
                >
                  <span className="monthstrip__dd">{weekdayShort(d).slice(0, 1)}</span>
                  {fromISO(d).getDate()}
                  {dot && <span className="monthstrip__pip" style={{ background: active ? "var(--outline)" : dot }} />}
                </button>
              );
            })}
          </div>
          <button className="legendbar__nav" aria-label="Next week" onClick={() => navBy(1)}>
            <IconChevron width={15} height={15} />
          </button>
        </div>
      )}

      {view === "week" && weekStats && (
        /* Weekly hero banner: real week completion %, item count, streak
           (see computeStreak — never fabricated), and overdue-this-week. */
        <div className="wk-banner mt-3">
          <div className="wb-card wb-hero pop-cyan sticker-rot-a">
            <IconTarget size={28} className="wb-hero__ic" />
            <div>
              <div className="wb-hero__num">
                {weekStats.total ? Math.round((weekStats.done / weekStats.total) * 100) : 0}%
              </div>
              <div className="wb-hero__lbl">Week progress</div>
            </div>
          </div>
          <div className="wb-card wb-mini">
            <div className="wb-mini__n">{weekStats.total}</div>
            <div className="wb-mini__l">Tasks this week</div>
          </div>
          <div className="wb-card wb-mini">
            <div className="wb-mini__n">{streak}</div>
            <div className="wb-mini__l">Day streak</div>
            <div className="wb-mini__flames">
              <FlameIcon color="var(--cat-pink)" />
              <FlameIcon color="var(--cat-butter)" />
              <FlameIcon color="var(--cat-teal)" />
            </div>
          </div>
          <div className="wb-card wb-mini">
            <div className="wb-mini__n" style={{ color: weekOverdue > 0 ? "var(--alert)" : undefined }}>{weekOverdue}</div>
            <div className="wb-mini__l">Overdue this week</div>
          </div>
        </div>
      )}

      {view === "day" && (
        <div className="card spread mt-3">
          <button className="chip cal-navchip cal-navchip--prev" aria-label="Previous"
            onClick={() => navBy(-1)}>
            <IconChevron width={16} height={16} />
          </button>
          <div className="cal-nav-title">{title}</div>
          <button className="chip cal-navchip" aria-label="Next" onClick={() => navBy(1)}>
            <IconChevron width={16} height={16} />
          </button>
        </div>
      )}

      {view === "month" ? (
        <div className="card cal-monthcard" data-tour="calendar-grid">
          <div className="cal-scroll">
            <div className="cal-grid">
              {weekHeader.map((w, i) => (
                <div key={i} className="cal-head">{w}</div>
              ))}
              {days.map((d) => {
                const items = visible(byDate.get(d));
                const isToday = d === today;
                const dim = !inSameMonth(d, cursor);
                const adding = addingDate === d;
                const shown = items.slice(0, 5);
                return (
                  <div key={d} className={`cal-cell${isToday ? " cal-cell--today" : ""}${dim ? " cal-cell--dim" : ""}`}>
                    <div className="cal-cell__head">
                      <button className="cal-daynum" onClick={() => setSelected(d)} aria-label={format(fromISO(d), "MMMM d")}>
                        {fromISO(d).getDate()}
                        {isToday && <span className="cal-todaypip">Today</span>}
                      </button>
                      {items.length > 7 && <span className="cal-over7">7+</span>}
                      <button className="cal-add" aria-label="Add on this day"
                        onClick={() => setAddingDate(d)}>+</button>
                    </div>
                    {shown.map((it) => (
                      <button key={it.key} className={`cal-item${it.done ? " cal-item--done" : ""}`}
                        style={{ background: categoryPillBg(it.category), color: categoryPillInk(it.category) }}
                        onClick={() => toggleItem(it)} title={it.title}>
                        {it.occurrence && <IconRepeat size={9} className="cal-item-repeat-ic" />}
                        <span className="cal-item__txt">{it.title}</span>
                      </button>
                    ))}
                    {items.length > shown.length && (
                      <button className="cal-more" onClick={() => setSelected(d)}>+{items.length - shown.length} more</button>
                    )}
                    {adding && (
                      <QuickCapture date={d} className="cal-input" compact
                        placeholder="Type a task…" onClose={() => setAddingDate(null)} />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : view === "week" ? (
        <div className="week-grid">
          {days.map((d, i) => {
            const items = visible(byDate.get(d));
            const done = items.filter((it) => it.done).length;
            const total = items.length;
            const isToday = d === today;
            const adding = addingDate === d;
            const tint = DAY_TINTS[i % 7];
            const pop = POP_FOR_TINT[tint] ?? "pink";
            const rot = ROTATIONS[i % ROTATIONS.length];
            return (
              <div
                key={d}
                className={`weekcard pop-${pop}${isToday ? " weekcard--today" : ""}`}
                style={{ ["--rot" as string]: rot }}
              >
                {/* Today skips the tint (see .weekcard--today) — accent fill
                    + glow is its own "you are here" treatment, a candy tint
                    on top would just compete with it. */}
                <div className="weekcard__head" style={isToday ? undefined : { background: tint }}>
                  <span className="weekcard__num">
                    {fromISO(d).getDate()}
                    {isToday && <span className="cal-todaypip cal-todaypip--onaccent">Today</span>}
                  </span>
                  <div>
                    <div className="weekcard__wd">{format(fromISO(d), "EEEE")}</div>
                    <div className="weekcard__date">{format(fromISO(d), "MMMM d")}</div>
                  </div>
                </div>

                <div className="weekcard__ring">
                  <ProgressRing
                    value={total ? done / total : 0}
                    size={78}
                    stroke={9}
                    dotted={total === 0}
                    ariaLabel={`${done} of ${total} tasks done`}
                    center={
                      <div className="text-center">
                        <div className="weekcard__pct">{total ? Math.round((done / total) * 100) : 0}%</div>
                        <div className="muted weekcard__pct-sub">{done}/{total}</div>
                      </div>
                    }
                  />
                </div>

                <div className="weekcard__list">
                  {items.length === 0 ? (
                    <div className="muted weekcard__empty">Nothing planned. A clear day.</div>
                  ) : (
                    items.map((it) => (
                      <div key={it.key} className={`weekrow${it.done ? " weekrow--done" : ""}`}>
                        <Checkbox checked={it.done} onChange={() => toggleItem(it)} label={it.title} />
                        <span className="weekrow__txt" onClick={() => openItem(it)}>
                          {it.occurrence && <IconRepeat size={11} className="ic-muted" />}
                          {it.title}
                        </span>
                        <span className="weekrow__dot" style={{ background: it.color }} />
                      </div>
                    ))
                  )}

                  {adding ? (
                    <div className="cal-quickadd-gap">
                      <QuickCapture date={d} className="input" placeholder="Type a task…"
                        inputStyle={{ fontSize: 14, padding: "8px 10px" }}
                        onClose={() => setAddingDate(null)} />
                    </div>
                  ) : (
                    <button className="weekcard__add" onClick={() => setAddingDate(d)}>+ Add a task</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <DayDetailView
          date={cursor}
          items={visible(byDate.get(cursor))}
          adding={addingDate === cursor}
          onAdd={() => setAddingDate(cursor)}
          onCloseAdd={() => setAddingDate(null)}
          onToggle={toggleItem}
          onOpen={openItem}
        />
      )}

      <p className="muted cal-hint">
        {view === "month"
          ? "Swipe the grid sideways on a phone. Tap + in any day to write a task straight in; tap an item to complete it, or open its day (tap the date) to edit it."
          : view === "week"
          ? "Each day shows its completion ring. Tick an item to complete it, tap its text to open and edit it; type a new task straight into any day."
          : "Filters above apply here too. Tick an item to complete it, tap its text to open and edit it; type anything to add it to today."}
      </p>

      <DaySheet
        date={selected}
        items={visible(selected ? byDate.get(selected) : [])}
        onClose={() => setSelected(null)}
        onAdd={() => setAddOpen(true)}
        onToggle={toggleItem}
        onOpen={openItem}
      />

      <TaskSheet
        open={addOpen || !!editingTask}
        editTask={editingTask}
        defaultDate={selected ?? today}
        onClose={() => { setAddOpen(false); setEditingTask(null); }}
      />
    </>
  );
}

function DaySheet({
  date, items, onClose, onAdd, onToggle, onOpen,
}: {
  date: string | null;
  items: CalItem[];
  onClose: () => void;
  onAdd: () => void;
  onToggle: (it: CalItem) => void;
  onOpen: (it: CalItem) => void;
}) {
  if (!date) return null;
  return (
    <BottomSheet open title={format(fromISO(date), "EEEE, MMM d")} onClose={onClose}>
      {items.length === 0 ? (
        <p className="muted cal-daysheet__empty">Nothing scheduled.</p>
      ) : (
        <div className="card card--tight mb-4">
          {items.map((it) => (
            <div key={it.key} className={`row${it.done ? " row--done" : ""}`}>
              <Checkbox checked={it.done} onChange={() => onToggle(it)} label={it.title} />
              <button className="row__body daydetail__row-btn" onClick={() => onOpen(it)}>
                <div className="row__title row__title--inline">
                  {it.occurrence && <IconRepeat size={13} className="ic-muted" />}
                  {it.title}
                </div>
                <div className="row__sub">{it.category}{it.assignee ? ` · ${it.assignee}` : ""}</div>
              </button>
            </div>
          ))}
        </div>
      )}
      <button className="btn btn--primary" onClick={onAdd}>+ Add task on this day</button>
    </BottomSheet>
  );
}

function DayDetailView({
  date,
  items,
  adding,
  onAdd,
  onCloseAdd,
  onToggle,
  onOpen,
}: {
  date: string;
  items: CalItem[];
  adding: boolean;
  onAdd: () => void;
  onCloseAdd: () => void;
  onToggle: (it: CalItem) => void;
  onOpen: (it: CalItem) => void;
}) {
  const done = items.filter((it) => it.done).length;
  const total = items.length;

  return (
    <div className="card mt-3">
      <div className="spread mb-4">
        <div>
          <div className="muted eyebrow-12">COMPLETED</div>
          <div className="big-number daydetail__count">{done}/{total}</div>
        </div>
        <ProgressRing
          value={total ? done / total : 0}
          size={64}
          stroke={7}
          dotted={total === 0}
          ariaLabel={`${done} of ${total} tasks done`}
          center={<span className="daydetail__pct">{total ? Math.round((done / total) * 100) : 0}%</span>}
        />
      </div>

      {items.length === 0 ? (
        <div className="muted daydetail__empty">Nothing planned. A clear day.</div>
      ) : (
        <div className="col-stack">
          {items.map((it) => (
            <div key={it.key} className={`row${it.done ? " row--done" : ""}`}>
              <Checkbox checked={it.done} onChange={() => onToggle(it)} label={it.title} />
              <button className="row__body daydetail__row-btn" onClick={() => onOpen(it)}>
                <div className="row__title row__title--inline">
                  {it.occurrence && <IconRepeat size={13} className="ic-muted" />}
                  {it.title}
                </div>
                <div className="row__sub">
                  {it.category}
                  {it.assignee ? ` · ${it.assignee}` : ""}
                </div>
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="mt-3">
        {adding ? (
          <QuickCapture date={date} className="input" placeholder="Type a task…" onClose={onCloseAdd} />
        ) : (
          <button className="btn btn--ghost" onClick={onAdd}>+ Add a task</button>
        )}
      </div>
    </div>
  );
}
