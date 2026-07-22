// Desktop sidebar (shown ≥900px). Groups every destination like the reference's
// Overview / Organization / Finances / Wellness nav.
import { navigate, type Route } from "../router";
import { NAV, SETTINGS_ITEM, ROUTE_LABELS } from "../nav";
import { IconCompass, IconHeart } from "./icons";
import { useSync } from "../stores/useSync";
import { useSettings } from "../stores/useSettings";
import { HIDE_DEMO_CHROME, useDemo } from "../lib/demo";
import { useDueToday } from "../lib/useDueToday";
import { APP_NAME, APP_VERSION, BUILD_SHA } from "../lib/config";
import { Mascot } from "./Mascot";

const STATUS_LABEL: Record<string, string> = {
  synced: "Synced",
  syncing: "Syncing…",
  offline: "Offline",
};

export function Sidebar({ active, onCoachTour }: { active: Route; onCoachTour: () => void }) {
  const { status, connected, needsReauth, busy, tapToRetry } = useSync();
  const { hiddenRoutes } = useSettings();
  const demo = useDemo((s) => s.demo);
  const dueCounts = useDueToday();
  // Each nav icon shows its OWN share of what's due today, not just the
  // Dashboard's total — 2 tasks + 1 goal due today lights Tasks "2", Goals
  // "1", and Dashboard "3" (the sum), instead of only the Dashboard icon
  // showing anything at all. Reported directly, 2026-07-14: "i still dont
  // see badged on the next to the icon of other tabs like dashboard."
  const badgeFor: Partial<Record<Route, number>> = {
    dashboard: dueCounts.total,
    tasks: dueCounts.tasks,
  };
  // Stuck sync must always have a manual escape hatch, not just the specific
  // reauth case — a plain "offline" (rate limit, blip, whatever) previously
  // had no click affordance at all, which read as "pressing it does nothing."
  const retryable = connected && !needsReauth && status === "offline";
  const clickable = needsReauth || retryable;
  const dot =
    needsReauth || status === "offline" ? "var(--warn)"
    : status === "synced" ? "var(--success)" : "var(--accent)";

  const groups = NAV.map((group) => ({
    ...group,
    items: group.items.filter((i) => !hiddenRoutes.includes(i.route)),
  })).filter((group) => group.items.length > 0);

  return (
    <aside className="sidebar" data-tour="nav-more">
      <div className="sidebar__brand">
        <img src="/favicon-96x96.png" alt="" aria-hidden width={26} height={26} />
        {APP_NAME}
        {demo && !HIDE_DEMO_CHROME && <span className="brand-demo">Demo</span>}
      </div>
      <button className="sidebar__item sidebar__coachbtn" onClick={onCoachTour}>
        <span className="sidebar__ico">
          <IconCompass size={17} />
        </span>
        Coach Tour: {ROUTE_LABELS[active]}
      </button>
      <div className="sidebar__scroll">
        {groups.map((group) => (
          <div key={group.title} className="sidebar__group">
            <div className="sidebar__grouptitle">{group.title}</div>
            {group.items.map(({ route, label, Icon }) => (
              <button
                key={route}
                className={`sidebar__item${active === route ? " sidebar__item--on" : ""}`}
                data-tour={`nav-${route}`}
                onClick={() => navigate(route)}
              >
                <span className="sidebar__ico">
                  <Icon size={17} />
                </span>
                {label}
                {!!badgeFor[route] && (
                  <span className="navbadge navbadge--inline" aria-hidden>
                    {badgeFor[route]! > 99 ? "99+" : badgeFor[route]}
                  </span>
                )}
              </button>
            ))}
          </div>
        ))}
        <div className="sidebar__group">
          <button
            className={`sidebar__item${active === "settings" ? " sidebar__item--on" : ""}`}
            data-tour="settings"
            onClick={() => navigate("settings")}
          >
            <span className="sidebar__ico">
              <SETTINGS_ITEM.Icon size={17} />
            </span>
            Settings
          </button>
          <button
            className={`sidebar__item${active === "privacy" ? " sidebar__item--on" : ""}`}
            onClick={() => navigate("privacy")}
          >
            <span className="sidebar__ico">
              <IconHeart size={17} />
            </span>
            Privacy
          </button>
        </div>
      </div>
      <div className="sidebar__foot">
        <Mascot dueToday={dueCounts.total} />
        {/* Hidden in demo mode — see Header.tsx's matching change for why:
            the "DEMO" brand tag and the DemoBanner already say it. */}
        {!demo && (clickable ? (
          <button
            className="syncpill"
            disabled={busy}
            onClick={() => tapToRetry()}
            title={
              needsReauth
                ? "Your Google connection lapsed after being idle a while. Tap to sign in again, nothing was lost"
                : "Tap to retry syncing now"
            }
          >
            <span className="syncpill__dot" style={{ background: dot }} />
            {busy ? (needsReauth ? "Reconnecting…" : "Syncing…") : needsReauth ? "Tap to reconnect" : "Offline · tap to retry"}
          </button>
        ) : (
          <span className="syncpill">
            <span className="syncpill__dot" style={{ background: dot }} />
            {connected ? STATUS_LABEL[status] : "Saved on device"}
          </span>
        ))}
        <span className="sidebar__version">
          v{APP_VERSION}
          {BUILD_SHA && ` · ${BUILD_SHA}`}
        </span>
      </div>
    </aside>
  );
}
