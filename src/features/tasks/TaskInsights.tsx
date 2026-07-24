// The "Smart Task Center" analytics header: auto-calculated KPIs + live charts
// (status / category / priority donuts, completion ring, priority-by-category,
// upcoming dues, person-in-charge). All CSS/JS charts — no SVG, no chart lib.
// Lives on the Dashboard (the spec's "01 Dashboard" frame is this exact KPI+
// chart cluster) — always visible, no collapse toggle. It used to sit on the
// Tasks screen collapsed behind a "Show charts" button, which meant the
// dashboard landing page had no charts at all — not what the reference
// product (or the user) actually wants front and center.
import { useMemo } from "react";
import type { LucideIcon } from "lucide-react";
import { Donut, RankedBars, PeopleBars, SegmentedBars, StackedColumns } from "../../components/Charts";
import { ProgressRing } from "../../components/ProgressRing";
import { TipBanner } from "../../components/TipBanner";
import { IconBell, IconCheck, IconHeart } from "../../components/icons";
import { addDaysISO, daysBetween, fromISO, format } from "../../lib/dates";
import {
  categoryColor,
  PRIORITY_COLOR,
  PRIORITY_LABEL,
  STATUS_COLOR,
  STATUS_LABEL,
  stringColor,
} from "../../lib/ui";
import { PRIORITIES, STATUSES } from "../../lib/types";
import type { AgendaItem } from "./agenda";

export function TaskInsights({
  items,
  today,
  categories,
}: {
  items: AgendaItem[];
  today: string;
  categories: string[];
}) {
  const s = useMemo(() => {
    const total = items.length;
    const completed = items.filter((i) => i.done).length;
    const dated = (i: AgendaItem) => !!i.date;
    const overdue = items.filter((i) => dated(i) && i.date < today && !i.done).length;
    const dueToday = items.filter((i) => i.date === today && !i.done).length;
    const dueTomorrow = items.filter((i) => i.date === addDaysISO(today, 1) && !i.done).length;
    const dueIn = (n: number) =>
      items.filter((i) => dated(i) && i.date > today && daysBetween(today, i.date) <= n && !i.done).length;

    // breakdowns
    const byStatus = STATUSES.map((st) => ({
      label: STATUS_LABEL[st],
      value: items.filter((i) => i.status === st).length,
      color: STATUS_COLOR[st],
    })).filter((x) => x.value > 0);

    const cats = Array.from(new Set(items.map((i) => i.category).filter(Boolean)));
    const byCategory = cats.map((c) => ({
      label: c,
      value: items.filter((i) => i.category === c).length,
      color: categoryColor(c),
    }));

    const byPriority = PRIORITIES.map((p) => ({
      label: PRIORITY_LABEL[p],
      value: items.filter((i) => i.priority === p).length,
      color: PRIORITY_COLOR[p],
    })).filter((x) => x.value > 0);

    // priority by category (open items only) — pre-shaped for SegmentedBars
    // (Charts.tsx), embedded under both the Category and Priority donuts.
    const priByCat = categories.map((cat) => {
      const open = items.filter((i) => i.category === cat && !i.done);
      return {
        label: cat,
        total: open.length,
        segments: PRIORITIES.map((p) => ({
          value: open.filter((i) => i.priority === p).length,
          color: PRIORITY_COLOR[p],
        })),
      };
    }).filter((c) => c.total > 0);

    // activity timeline — the past week through the rest of this week, completed vs pending
    const activity = Array.from({ length: 14 }, (_, k) => addDaysISO(today, k - 7)).map((d) => {
      const onDay = items.filter((i) => i.date === d);
      return {
        label: format(fromISO(d), "d"),
        a: onDay.filter((i) => i.done).length,
        b: onDay.filter((i) => !i.done).length,
      };
    });

    // person in charge — task count per assignee
    const people = Array.from(new Set(items.map((i) => i.assignee).filter(Boolean)));
    const byPerson = people
      .map((name) => ({ label: name, value: items.filter((i) => i.assignee === name).length, color: stringColor(name) }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);

    return {
      total,
      completed,
      ongoing: total - completed,
      completionPct: total ? completed / total : 0,
      overdue,
      dueToday,
      dueTomorrow,
      due7: dueIn(7),
      due14: dueIn(14),
      byStatus,
      byCategory,
      byPriority,
      priByCat,
      activity,
      byPerson,
    };
  }, [items, today, categories]);

  // Overdue already stood out in --alert red; Completion/Completed were
  // plain ink even though they're the "good news" numbers on this strip —
  // mirrors the mockup's hot/good KPI coloring, reusing --success (already
  // a deep green in light mode, bright mint-green in dark) rather than
  // inventing a new token.
  const kpis: { label: string; value: string; alert?: boolean; good?: boolean }[] = [
    { label: "Total tasks", value: String(s.total) },
    { label: "Completion", value: `${Math.round(s.completionPct * 100)}%`, good: s.completionPct > 0 },
    { label: "Ongoing", value: String(s.ongoing) },
    { label: "Completed", value: String(s.completed), good: s.completed > 0 },
    { label: "Overdue", value: String(s.overdue), alert: s.overdue > 0 },
    { label: "Due today", value: String(s.dueToday) },
    { label: "Due ≤ 7 days", value: String(s.due7) },
    { label: "Due ≤ 14 days", value: String(s.due14) },
  ];

  // Each banner is its own featured sticker: a candy hue's soft fill + ink
  // outline + a hard pop-shadow in a SIBLING hue (never its own tone) +
  // a small alternating tilt — the same recipe as the active nav item and
  // the FAB, applied here so the very top of the dashboard states its
  // personality immediately, not three turns of scrolling in.
  const alerts: {
    icon: LucideIcon;
    text: string;
    hue: "sky" | "teal" | "pink";
    pop: "lemon" | "pink" | "cyan";
    rot: "sticker-rot-a" | "sticker-rot-b" | "sticker-rot-c";
    swing?: boolean;
  }[] = [];
  if (s.dueTomorrow > 0) {
    alerts.push({ icon: IconBell, hue: "sky", pop: "lemon", rot: "sticker-rot-b", text: `${s.dueTomorrow} task${s.dueTomorrow > 1 ? "s" : ""} due tomorrow`, swing: true });
  }
  if (s.total > 0) {
    alerts.push({ icon: IconCheck, hue: "teal", pop: "pink", rot: "sticker-rot-a", text: `Completed ${Math.round(s.completionPct * 100)}% of tasks` });
  }
  if (s.overdue > 0) {
    alerts.push({ icon: IconHeart, hue: "pink", pop: "cyan", rot: "sticker-rot-c", text: `${s.overdue} overdue task${s.overdue > 1 ? "s" : ""} need your love` });
  }

  return (
    <div style={{ marginBottom: 4 }} data-tour="tasks-insights">
      {alerts.length > 0 && (
        <div className="alert-stack">
          {alerts.map((a) => (
            <div
              key={a.text}
              className={`card pop-${a.pop} ${a.rot}`}
              style={{
                display: "flex", alignItems: "center", gap: 10, padding: "12px 14px",
                background: `var(--cat-${a.hue}-soft)`,
              }}
            >
              <span style={{
                width: 30, height: 30, borderRadius: "50%", flex: "none",
                display: "grid", placeItems: "center",
                background: "var(--surface)", border: "2px solid var(--outline)",
                color: `var(--cat-${a.hue}-deep)`,
              }}>
                <a.icon size={15} className={a.swing ? "icon-swing" : undefined} />
              </span>
              <span style={{ fontSize: 14, fontWeight: 700, color: "var(--ink)" }}>{a.text}</span>
            </div>
          ))}
        </div>
      )}

      {/* KPI strip — always visible */}
      <div className="statgrid" style={{ marginBottom: 10 }}>
        {kpis.map((k) => (
          <div key={k.label} className="stat" style={{ cursor: "default" }}>
            <span className="stat__value" style={{ color: k.alert ? "var(--alert)" : k.good ? "var(--success)" : undefined }}>
              {k.value}
            </span>
            <span className="stat__label">{k.label}</span>
          </div>
        ))}
      </div>

      {/* The ring and the 2 donuts are all roughly the same compact width —
          one per full-width row each wasted most of a wide desktop screen.
          A wrapping grid lets 2-3 share a row depending on viewport, down
          to 1-per-row on mobile. Uses grid `gap`, not the `.card + .card`
          margin trick (that only works for a single vertical stack) — see
          the scoped override right below. `align-items: start` (also in
          that override) keeps each card its own natural height instead of
          stretching the shorter donut cards to match the ring card, which
          can now run tall (a status list under the ring) — a stretched
          donut card just shows a lot of empty space under its own content. */}
      <div className="insights-compact-grid" style={{ marginTop: 10 }}>
          <div className="card">
            <div className="spread" style={{ marginBottom: 10 }}>
              <div className="muted" style={{ fontSize: 12, fontWeight: 700 }}>OVERALL COMPLETION</div>
              <span className="muted" style={{ fontSize: 11, fontWeight: 600 }}>{s.total} tasks</span>
            </div>
            <div style={{ display: "grid", placeItems: "center" }}>
              <ProgressRing value={s.completionPct} size={110} stroke={12} showPct label="done"
                ariaLabel={`${s.completed} of ${s.total} tasks done`} />
            </div>
            {/* Status used to be its own donut card — with usually one or two
                statuses doing almost all the work (Completed, Not Started)
                and the rest rounding to 0-1%, a donut just drew unreadable
                slivers for them. A ranked bar list states the exact
                percentage instead, and folding it into the completion card
                means the two REAL breakdown donuts (Category, Priority)
                below get an equal-width row to themselves instead of
                competing with a near-empty third. */}
            {s.byStatus.length > 0 && (
              <div className="chart-section-divider">
                <RankedBars items={s.byStatus} />
              </div>
            )}
          </div>

          {/* Category and Priority each fold their own priority-by-category
              breakdown in underneath (dashed divider, then SegmentedBars) —
              used to live pulled out as one separate full-width "Priority by
              category" card instead, but showing it right under BOTH donuts
              it's actually a breakdown OF matches the mockup's own reference
              layout for these two cards exactly (reported directly with a
              screenshot, 2026-07-23) and reads more naturally as "here's the
              donut, and here's that same mix spelled out per category" than
              as an unrelated fourth card. */}
          {s.byCategory.length > 0 && (
            <div className="card">
              <div className="muted" style={{ fontSize: 12, fontWeight: 700, marginBottom: 10 }}>CATEGORY</div>
              <Donut slices={s.byCategory} size={104} thickness={16} />
              {s.priByCat.length > 0 && (
                <div className="chart-section-divider">
                  <SegmentedBars rows={s.priByCat} />
                </div>
              )}
            </div>
          )}

          {s.byPriority.length > 0 && (
            <div className="card">
              <div className="muted" style={{ fontSize: 12, fontWeight: 700, marginBottom: 10 }}>PRIORITY</div>
              <Donut slices={s.byPriority} size={104} thickness={16} />
              {s.priByCat.length > 0 && (
                <div className="chart-section-divider">
                  <SegmentedBars rows={s.priByCat} />
                </div>
              )}
            </div>
          )}
      </div>

      {/* Vertical stack on phone (spaced by the inherited `.card + .card`
          margin); side by side on wide screens — Timeline gets the wider
          share (matches the Today/Upcoming split's own 1.6/1 ratio), Person
          a narrower column. See .insights-wide-grid in base.css. */}
      <div className="insights-wide-grid">
          <div className="card insights-wide-grid__timeline">
            <div className="muted" style={{ fontSize: 12, fontWeight: 700, marginBottom: 10 }}>TASK ACTIVITY TIMELINE</div>
            <StackedColumns points={s.activity} height={110} labelA="Completed" labelB="Pending" />
            {/* Docked here instead of standing alone as a 4th full-width
                sticker at the very bottom of the page — this card is the
                natural last stop in the reading order, so its closing line
                doesn't need a whole extra card of its own. */}
            <TipBanner inline />
          </div>

          {s.byPerson.length > 0 && (
            <div className="card">
              <div className="muted" style={{ fontSize: 12, fontWeight: 700, marginBottom: 10 }}>PERSON IN CHARGE</div>
              {/* Horizontal bars, not vertical columns — a column chart
                  scales bar HEIGHT to the busiest person, and "Me" usually
                  owns most tasks, so everyone else rendered as a sliver a
                  couple pixels tall (reported directly from the wide-screen
                  screenshot: Sophie/Michael/Emily/Alice/David were barely
                  visible next to "Me"'s bar). A horizontal track has far
                  more room to stay legible at the low end. */}
              <PeopleBars points={s.byPerson} />
            </div>
          )}
      </div>
    </div>
  );
}
