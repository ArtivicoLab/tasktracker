// Coach-mark tour. Each screen has its own short coach, scoped to only what's
// actually rendered there right now — no cross-screen auto-navigation. A step
// spotlights a real, existing element via a `data-tour="<key>"` attribute (see
// the various screens, TabBar, Sidebar) — never invents UI that isn't there.
// Steps whose target isn't currently in the DOM (e.g. a card that only shows
// once you have data) are filtered out before the tour ever opens, so a page
// with nothing relevant to show just doesn't open one.
// "Seen forever" (for the one automatic first-run showing, on the Dashboard)
// persists in plain localStorage — a UI preference, not user data, so it
// deliberately does NOT ride along with the IndexedDB reset/activate flow in
// stores/bootstrap.ts.
import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as RPointerEvent, type CSSProperties } from "react";
import { useRoute, type Route } from "../router";
import { Segmented } from "./Segmented";
import { isDemo } from "../lib/demo";
import { loadSampleIntoStores, setDemoMode } from "../stores/bootstrap";
import { suspendSync, resumeSync } from "../lib/sync";
import { useTasks } from "../stores/useTasks";

const TOUR_SEEN_KEY = "tourSeen";

interface TourStep {
  target: string; // matches a `data-tour` attribute value
  route?: Route; // screen this target lives on — omit for "dashboard"
  title: string;
  body: string;
  // Some targets only exist while the user is mid-action (e.g. the calendar
  // entry pickers appear only while typing). When a step names a `demo`, the
  // tour fires `coach:<demo>-on` while it's open so the screen can render a
  // safe, non-saving example that puts the target on screen to point at.
  demo?: string;
}

const STEPS: TourStep[] = [
  // ---------- Dashboard ----------
  {
    target: "nav-calendar",
    title: "Not sure where to start? Start here",
    body: "Everything in Task Tracker can begin on your Calendar. Open it, tap any day, and just type a task. It figures out the category, so you can run your whole day from one place.",
  },
  {
    target: "today",
    title: "Today, at a glance",
    body: "Everything due today lives in this one card. Check things off right here as you go. Overdue items dock right in too, so this one card is your whole morning check-in.",
  },
  {
    target: "tasks-insights",
    title: "Your numbers, live",
    body: "Total, completion rate, overdue, and due-soon counts, plus breakdowns by status, category, priority, activity over time, and who's carrying what — all update live as you work.",
  },
  {
    target: "nav-more",
    title: "Everything else lives here",
    body: "Recurring and Settings each have their own full screen, one tap away. Each one has its own quick coach too, look for the compass.",
  },
  // ---------- Tasks ----------
  {
    target: "tasks-segmented",
    route: "tasks",
    title: "Today, Upcoming, Overdue, All",
    body: "Switch views to see just what's due today, what's coming up, what's overdue, or everything at once.",
  },
  {
    target: "tasks-filters",
    route: "tasks",
    title: "Filter and sort",
    body: "Tap a category chip above to filter by it. A chip lights up when something in that category needs attention. Narrow further by status, priority, or assignee, and pick how the list sorts.",
  },
  {
    target: "tasks-fab",
    route: "tasks",
    title: "Quick capture, anywhere",
    body: "Tap + to add a one-off to-do or a recurring routine in seconds. Use the tabs and filters above to slice your list by status, priority, category, or assignee.",
  },
  // ---------- Calendar ----------
  {
    target: "calendar-head",
    route: "calendar",
    title: "This is where everything starts",
    body: "Tap any day and type anything: a task or a routine. It guesses the category and shows a pill; tap the pill to fix it before saving.",
  },
  {
    target: "calendar-filters",
    route: "calendar",
    title: "Show or hide what you see",
    body: "Tap a category to dim it out of the grid.",
  },
  {
    target: "calendar-grid",
    route: "calendar",
    title: "Tap in, type anything",
    body: "Tap + on any day to add something right there, tap an item to complete it, or tap its text to open and edit it. Tap the date number to see the whole day in a sheet.",
  },
  {
    target: "capture-pickers",
    route: "calendar",
    demo: "calendar-demo",
    title: "Set the category and assignee",
    body: "As soon as you type an entry, these buttons appear next to it. We guess the category and priority. Tap either to change it before it saves.",
  },
  // ---------- Recurring ----------
  {
    target: "recurring-list",
    route: "recurring",
    title: "Every upcoming occurrence",
    body: "Each series lists its next several dates. Tick one off right here, or tap it to edit just that occurrence without touching the rest of the series.",
  },
  {
    target: "recurring-manage",
    route: "recurring",
    title: "Manage a whole series",
    body: "Recurring routines are created from Tasks (choose Repeat when adding one). Come back here to pause, end, or delete the whole series. Editing one occurrence never touches past ones; editing the series only changes what's still upcoming.",
  },
  // ---------- Wrap-up ----------
  {
    target: "settings-sheets",
    route: "settings",
    title: "It's your data, in your Google Sheet",
    body: "Everything works fully offline on this device first. Connect your own Google Sheet here and it becomes the backup and single source of truth, synced automatically after that.",
  },
  {
    target: "settings-categories",
    route: "settings",
    title: "Your color tags",
    body: "Add, rename, or recolor the tags your tasks and routines use. Tap a tag's name to rename it, or its dot to change its color.",
  },
  {
    target: "settings-team",
    route: "settings",
    title: "Who's on your team",
    body: "Add names here and they show up as one-tap \"Assigned to\" chips on every task — no accounts or logins needed.",
  },
];

export function hasSeenTour(): boolean {
  try {
    return localStorage.getItem(TOUR_SEEN_KEY) === "1";
  } catch {
    return true; // storage blocked (private mode etc.) — don't force the tour
  }
}

function markTourSeen() {
  try {
    localStorage.setItem(TOUR_SEEN_KEY, "1");
  } catch {
    // ignore — worst case the tour reappears next visit
  }
}

function targetExists(key: string): boolean {
  return Array.from(document.querySelectorAll<HTMLElement>(`[data-tour="${key}"]`)).some(
    (el) => el.getClientRects().length > 0
  );
}

const CARD_GAP = 16;

export function CoachTour({ onDone }: { onDone: () => void }) {
  const currentRoute = useRoute();
  const [openedRoute] = useState(currentRoute);
  const [pageSteps, setPageSteps] = useState<TourStep[] | null>(null);
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [cardTop, setCardTop] = useState<number | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  // The tour needs something to point at. A real buyer's account is EMPTY, so
  // if the user isn't already in demo we load the sample data into the stores
  // for the duration of the tour (so every step has a filled card to spotlight)
  // and restore their real, empty data on close.
  const wasDemo = useRef(isDemo());
  const [sampleOn, setSampleOn] = useState(true); // the tour starts populated
  const [dataTick, setDataTick] = useState(0); // bump to re-measure after a toggle

  // A synchronous snapshot of the real user's data, taken before we swap in the
  // sample, so restoring is instant (no async IndexedDB read that could race a
  // StrictMode re-mount and clobber the freshly-loaded sample).
  const realSnap = useRef<{ tasks: unknown[]; recurrences: unknown[] } | null>(null);

  function captureReal() {
    realSnap.current = {
      tasks: useTasks.getState().tasks,
      recurrences: useTasks.getState().recurrences,
    };
  }
  function restoreReal() {
    const s = realSnap.current;
    if (!s) return;
    useTasks.getState().setAll(s.tasks as never, s.recurrences as never);
  }

  // The on-card toggle: flip between the sample data (so the tour has content)
  // and the user's own data. For someone already in demo it drives the real,
  // persistent demo flag (so they can turn demo off right here); for a real
  // user it's a temporary preview reverted when the tour closes.
  function toggleSample(on: boolean) {
    setSampleOn(on);
    if (wasDemo.current) {
      void setDemoMode(on);
    } else if (on) {
      loadSampleIntoStores();
      suspendSync();
    } else {
      restoreReal();
      resumeSync();
    }
    requestAnimationFrame(() => setDataTick((t) => t + 1));
  }

  // Drag-to-move: once the user drags the card by its grip, it stays where they
  // put it (dragPos wins over the auto above/below-the-spotlight placement).
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const draggingRef = useRef(false);
  const dragOffset = useRef({ dx: 0, dy: 0 });
  function onGripDown(e: RPointerEvent<HTMLDivElement>) {
    const card = cardRef.current;
    if (!card) return;
    const r = card.getBoundingClientRect();
    dragOffset.current = { dx: e.clientX - r.left, dy: e.clientY - r.top };
    draggingRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onGripMove(e: RPointerEvent<HTMLDivElement>) {
    if (!draggingRef.current) return;
    const card = cardRef.current;
    if (!card) return;
    const x = Math.max(6, Math.min(e.clientX - dragOffset.current.dx, window.innerWidth - card.offsetWidth - 6));
    const y = Math.max(6, Math.min(e.clientY - dragOffset.current.dy, window.innerHeight - card.offsetHeight - 6));
    setDragPos({ x, y });
  }
  function onGripUp(e: RPointerEvent<HTMLDivElement>) {
    draggingRef.current = false;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
  }

  // The tour is scoped to whichever screen it was opened on. If the user
  // navigates elsewhere while it's up (a nav tap, a card link), just close it
  // rather than following them — each screen's coach is its own thing now.
  useEffect(() => {
    if (currentRoute !== openedRoute) onDone();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentRoute]);

  // Build this page's step list once: only what's actually on screen right now.
  // If the user isn't already in demo, snapshot their (empty) data and load the
  // sample first so every step has a filled card to point at. Steps with a
  // `demo` also fire a `coach:<demo>-on` event; then we poll a few frames for
  // the freshly-rendered targets before deciding which steps survive.
  useLayoutEffect(() => {
    const filled = !wasDemo.current;
    if (filled) { captureReal(); loadSampleIntoStores(); suspendSync(); }

    const relevant = STEPS.filter((s) => (s.route ?? "dashboard") === openedRoute);
    const demoKeys = [...new Set(relevant.map((s) => s.demo).filter(Boolean) as string[])];
    demoKeys.forEach((k) => window.dispatchEvent(new Event(`coach:${k}-on`)));

    let rafId = 0, cancelled = false, frames = 0;
    const measure = () => relevant.filter((s) => targetExists(s.target));
    if (filled || demoKeys.length) {
      const poll = () => {
        if (cancelled) return;
        const found = measure();
        if (found.length > 0 || frames >= 12) { setPageSteps(found); return; }
        frames++;
        rafId = requestAnimationFrame(poll);
      };
      rafId = requestAnimationFrame(poll);
    } else {
      setPageSteps(measure());
    }
    return () => {
      cancelled = true;
      if (rafId) cancelAnimationFrame(rafId);
      demoKeys.forEach((k) => window.dispatchEvent(new Event(`coach:${k}-off`)));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Restore the real user's (empty) data when the tour closes. Demo-origin users
  // keep whatever the toggle last set, so only revert for someone who started
  // outside demo.
  useEffect(() => () => { if (!wasDemo.current) { restoreReal(); resumeSync(); } }, []);

  useEffect(() => {
    if (pageSteps && pageSteps.length === 0) onDone();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageSteps]);

  useLayoutEffect(() => {
    if (!pageSteps || pageSteps.length === 0) return;

    function findTarget() {
      const key = pageSteps![step].target;
      const candidates = Array.from(
        document.querySelectorAll<HTMLElement>(`[data-tour="${key}"]`)
      );
      // Mobile and desktop chrome both carry the attribute; only one is
      // actually on screen at a given width — pick whichever has real size.
      return candidates.find((el) => el.getClientRects().length > 0);
    }
    function place() {
      const visible = findTarget();
      setRect(visible ? visible.getBoundingClientRect() : null);
    }
    // Some steps target cards further down a long screen scroll (or, on
    // desktop, further down the sidebar's own nested scroll) — bring the new
    // target into view before measuring. Instant + synchronous, so there's no
    // animation to race against the scroll listener below. Tall cards (e.g.
    // Today) scroll to their top edge so the heading stays visible; smaller
    // ones center for a nicer frame.
    const target = findTarget();
    if (target) {
      const tall = target.getBoundingClientRect().height > window.innerHeight * 0.55;
      target.scrollIntoView({ block: tall ? "start" : "center", behavior: "auto" });
    }
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [step, pageSteps, dataTick]);

  // Anchor the card above or below the spotlighted element (whichever side
  // has room) so it never sits on top of the thing it's explaining — the
  // bottom tab bar targets especially, which used to sit right under the
  // fixed-bottom card. Falls back to the default bottom-sheet CSS position
  // when there's no target (or somehow no room on either side).
  useLayoutEffect(() => {
    const cardEl = cardRef.current;
    if (!cardEl || !rect) {
      setCardTop(null);
      return;
    }
    const vh = window.innerHeight;
    const cardH = cardEl.offsetHeight;
    // Work off the portion of the target actually on screen — a target
    // taller than the viewport (e.g. Today) has no true "above" or "below",
    // so comparing against the full off-screen rect would just pick
    // whichever side is relatively bigger and still overlap it.
    const visibleTop = Math.max(rect.top, 0);
    const visibleBottom = Math.min(rect.bottom, vh);
    const spaceBelow = vh - visibleBottom;
    const spaceAbove = visibleTop;
    if (spaceBelow >= cardH + CARD_GAP) {
      setCardTop(visibleBottom + CARD_GAP);
    } else if (spaceAbove >= cardH + CARD_GAP) {
      setCardTop(visibleTop - cardH - CARD_GAP);
    } else {
      // Neither side fits — pin to the bottom edge so the card stays fully
      // visible; the target's top (and its heading) is what we scrolled to,
      // so it remains visible above the card.
      setCardTop(Math.max(CARD_GAP, vh - cardH - CARD_GAP));
    }
  }, [rect, step]);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function finish() {
    // Any completed coach — on any page — is enough to stop auto-popping
    // the first-run one; it only needs to fire once, ever.
    markTourSeen();
    onDone();
  }

  function next() {
    if (!pageSteps || step >= pageSteps.length - 1) finish();
    else setStep((s) => s + 1);
  }

  function prev() {
    setStep((s) => Math.max(0, s - 1));
  }

  if (!pageSteps || pageSteps.length === 0) return null;

  const s = pageSteps[step];
  const isLast = step === pageSteps.length - 1;

  return (
    <div className="tour" role="dialog" aria-modal="true" aria-label={s.title}>
      <div className="tour__scrim" style={{ background: rect ? "transparent" : undefined }} onClick={finish} />
      {rect && (
        <div
          className="tour__spot"
          style={{
            left: rect.left - 6,
            top: rect.top - 6,
            width: rect.width + 12,
            height: rect.height + 12,
          }}
        />
      )}
      <div
        ref={cardRef}
        className="tour__card"
        style={
          dragPos
            ? { left: dragPos.x, top: dragPos.y, right: "auto", bottom: "auto", transform: "none" }
            : cardTop === null
              ? undefined
              : ({ top: cardTop, bottom: "auto" } as CSSProperties)
        }
      >
        <div
          className="tour__grip"
          onPointerDown={onGripDown}
          onPointerMove={onGripMove}
          onPointerUp={onGripUp}
          title="Drag to move"
          aria-label="Drag to move"
        />
        <div className="tour__dots">
          {pageSteps.map((st, i) => (
            <span key={st.target} className={`tour__dot${i === step ? " tour__dot--on" : ""}`} />
          ))}
        </div>
        <div className="tour__title">{s.title}</div>
        <p className="tour__body">{s.body}</p>
        <div className="tour__demo">
          <Segmented
            options={[{ value: "sample", label: "Sample data" }, { value: "mine", label: "My data" }]}
            value={sampleOn ? "sample" : "mine"}
            onChange={(v) => toggleSample(v === "sample")}
          />
        </div>
        <div className="tour__actions">
          <button className="btn btn--ghost" onClick={finish}>Skip</button>
          <div className="tour__actions-right">
            {step > 0 && <button className="btn btn--ghost" onClick={prev}>Back</button>}
            <button className="btn btn--primary" onClick={next}>{isLast ? "Got it" : "Next"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
