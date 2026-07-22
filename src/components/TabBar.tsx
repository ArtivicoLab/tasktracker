// Bottom tab bar (mobile). Press and hold any pinned icon to enter rearrange
// mode: icons jiggle iOS-style, a small red unpin badge appears on each, and a
// bar slides in at the TOP of the screen with a "Done" button. While in that
// mode, dragging an icon left/right swaps it past its neighbors live.
import { useRef, useState } from "react";
import { navigate, type Route } from "../router";
import { ALL_NAV_ITEMS } from "../nav";
import { IconGrid, IconMinus } from "./icons";
import { useSettings } from "../stores/useSettings";
import { useInstall, type InstallPlatform } from "../stores/useInstall";
import { useDueToday } from "../lib/useDueToday";
import { BottomSheet } from "./BottomSheet";
import { APP_NAME } from "../lib/config";

// Friendlier tab-bar-only label for the dashboard (matches the ADHD-gentle tone
// used elsewhere); every other tab keeps its nav.tsx label.
const LABEL_OVERRIDE: Partial<Record<Route, string>> = { dashboard: "Today" };

const LONG_PRESS_MS = 450;
const MOVE_CANCEL_PX = 8;

// Manual "add to home screen" steps for browsers that never hand us a native
// prompt (iOS Safari never fires beforeinstallprompt) or that haven't yet.
const MANUAL_INSTALL_STEPS: Record<InstallPlatform, string> = {
  ios: "Tap the Share icon in Safari's toolbar, then choose \"Add to Home Screen\".",
  android: "Open your browser's menu (⋮) and tap \"Install app\" or \"Add to Home screen\".",
  desktop: `Look for the install icon in your browser's address bar, or open the browser menu and choose "Install ${APP_NAME}".`,
};

export function TabBar({ active }: { active: Route }) {
  const { tabBarRoutes, update } = useSettings();
  const { platform, installed, canPrompt, promptInstall } = useInstall();
  const dueCounts = useDueToday();
  // Same per-route breakdown as Sidebar.tsx — see its comment for why each
  // pinned icon shows its own share of what's due today, not just Dashboard.
  const badgeFor: Partial<Record<Route, number>> = {
    dashboard: dueCounts.total,
    tasks: dueCounts.tasks,
  };
  const [editing, setEditing] = useState(false);
  const [dragRoute, setDragRoute] = useState<string | null>(null);
  const [installNote, setInstallNote] = useState("");

  const pressTimer = useRef<number | null>(null);
  const pressStart = useRef<{ x: number; y: number } | null>(null);
  const dragOrigin = useRef<{ route: string; x: number } | null>(null);
  const btnRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  const pinned = tabBarRoutes
    .map((route) => ALL_NAV_ITEMS.find((i) => i.route === route))
    .filter((i): i is (typeof ALL_NAV_ITEMS)[number] => !!i);
  const pinnedRoutes = new Set(pinned.map((i) => i.route));
  // "More" is the fixed escape hatch to everything else — always present, never
  // itself pinnable, and lit up whenever the current route isn't one of the pins.
  const moreActive = !pinnedRoutes.has(active);

  function clearPressTimer() {
    if (pressTimer.current != null) {
      window.clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  }

  function onPressStart(e: React.PointerEvent) {
    if (editing) return;
    pressStart.current = { x: e.clientX, y: e.clientY };
    clearPressTimer();
    pressTimer.current = window.setTimeout(() => {
      setEditing(true);
      if (navigator.vibrate) navigator.vibrate(12);
    }, LONG_PRESS_MS);
  }

  function onPressMove(e: React.PointerEvent) {
    if (!pressStart.current) return;
    const dx = Math.abs(e.clientX - pressStart.current.x);
    const dy = Math.abs(e.clientY - pressStart.current.y);
    if (dx > MOVE_CANCEL_PX || dy > MOVE_CANCEL_PX) clearPressTimer();
  }

  function onPressEnd() {
    clearPressTimer();
    pressStart.current = null;
  }

  async function onBrandClick() {
    if (installed) {
      setInstallNote(`${APP_NAME} is already installed on this device.`);
      return;
    }
    if (canPrompt) {
      const outcome = await promptInstall();
      if (outcome !== "unavailable") return;
    }
    setInstallNote(MANUAL_INSTALL_STEPS[platform]);
  }

  function unpin(route: string) {
    update({ tabBarRoutes: tabBarRoutes.filter((r) => r !== route) });
  }

  function onDragStart(route: string, e: React.PointerEvent) {
    if (!editing) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragOrigin.current = { route, x: e.clientX };
    setDragRoute(route);
  }

  function onDragMove(e: React.PointerEvent) {
    const origin = dragOrigin.current;
    if (!origin) return;
    const el = btnRefs.current.get(origin.route);
    const dx = e.clientX - origin.x;
    if (el) el.style.transform = `translateX(${dx}px) rotate(0deg)`;

    const i = tabBarRoutes.indexOf(origin.route);
    const dir = dx > 0 ? 1 : -1;
    const neighborRoute = tabBarRoutes[i + dir];
    if (!neighborRoute) return;
    const neighborEl = btnRefs.current.get(neighborRoute);
    if (!neighborEl) return;
    const rect = neighborEl.getBoundingClientRect();
    const midpoint = rect.left + rect.width / 2;
    const crossed = dir > 0 ? e.clientX > midpoint : e.clientX < midpoint;
    if (!crossed) return;

    const next = [...tabBarRoutes];
    [next[i], next[i + dir]] = [next[i + dir], next[i]];
    update({ tabBarRoutes: next });
    dragOrigin.current = { route: origin.route, x: e.clientX };
    if (el) el.style.transform = "";
  }

  function onDragEnd() {
    if (dragOrigin.current) {
      const el = btnRefs.current.get(dragOrigin.current.route);
      if (el) el.style.transform = "";
    }
    dragOrigin.current = null;
    setDragRoute(null);
  }

  return (
    <>
      {editing && (
        <div className="tabbar-editbar">
          <span className="tabbar-editbar__label">Rearranging your bar</span>
          <button className="btn btn--primary" style={{ width: "auto", padding: "8px 18px" }} onClick={() => setEditing(false)}>
            Done
          </button>
        </div>
      )}
      <nav className="tabbar" aria-label="Primary">
        <button
          className="tabbar__brandbtn"
          aria-label={`Install ${APP_NAME}`}
          onClick={onBrandClick}
        >
          <img src="/favicon-96x96.png" alt="" aria-hidden className="tabbar__brand" width={28} height={28} />
        </button>
        <div className="tabbar__scroll">
          {pinned.map(({ route, label, Icon }) => {
            const on = active === route;
            const dragging = dragRoute === route;
            return (
              <button
                key={route}
                ref={(el) => {
                  if (el) btnRefs.current.set(route, el);
                  else btnRefs.current.delete(route);
                }}
                className={`tabbar__btn${on ? " tabbar__btn--active" : ""}${editing ? " tabbar__btn--editing" : ""}${dragging ? " tabbar__btn--dragging" : ""}`}
                aria-current={on ? "page" : undefined}
                data-tour={`nav-${route}`}
                onClick={() => !editing && navigate(route)}
                onPointerDown={(e) => { onPressStart(e); onDragStart(route, e); }}
                onPointerMove={(e) => { onPressMove(e); onDragMove(e); }}
                onPointerUp={() => { onPressEnd(); onDragEnd(); }}
                onPointerCancel={() => { onPressEnd(); onDragEnd(); }}
              >
                {editing && (
                  <span
                    className="tabbar__unpin"
                    role="button"
                    aria-label={`Unpin ${label}`}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => { e.stopPropagation(); unpin(route); }}
                  >
                    <IconMinus />
                  </span>
                )}
                <span className="tabbar__iconwrap">
                  <Icon />
                  {!!badgeFor[route] && !editing && (
                    <span className="navbadge" aria-hidden>
                      {badgeFor[route]! > 99 ? "99+" : badgeFor[route]}
                    </span>
                  )}
                </span>
                <span>{LABEL_OVERRIDE[route] ?? label}</span>
              </button>
            );
          })}
        </div>
        <button
          className={`tabbar__btn${moreActive ? " tabbar__btn--active" : ""}`}
          aria-current={moreActive ? "page" : undefined}
          data-tour="nav-more"
          onClick={() => navigate("more")}
        >
          <IconGrid />
          <span>More</span>
        </button>
      </nav>
      <BottomSheet open={!!installNote} title={`Install ${APP_NAME}`} onClose={() => setInstallNote("")}>
        <p className="muted settings-sheet-note">{installNote}</p>
      </BottomSheet>
    </>
  );
}
