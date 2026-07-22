// Tiny hash router (spec §3: no react-router needed for 6 routes).
import { useEffect, useState } from "react";
import { flushSync } from "react-dom";

export type Route =
  | "dashboard"
  | "tasks"
  | "calendar"
  | "recurring"
  | "more"
  | "privacy"
  | "whatsnew"
  | "settings";

const ROUTES: Route[] = [
  "dashboard",
  "tasks",
  "calendar",
  "recurring",
  "more",
  "privacy",
  "whatsnew",
  "settings",
];

export function currentRoute(): Route {
  const h = window.location.hash.replace(/^#\/?/, "");
  const r = h.split("?")[0] as Route;
  return ROUTES.includes(r) ? r : "dashboard";
}

export function navigate(route: Route, query?: Record<string, string>) {
  const q = query
    ? "?" + new URLSearchParams(query).toString()
    : "";
  window.location.hash = `#/${route}${q}`;
}

export function routeQuery(): URLSearchParams {
  const h = window.location.hash;
  const qi = h.indexOf("?");
  return new URLSearchParams(qi >= 0 ? h.slice(qi + 1) : "");
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(currentRoute());
  useEffect(() => {
    // Page-to-page transition: wrap the route swap in a View Transition when
    // the browser has the API (Chrome/Safari), so the outgoing page gets its
    // own exit animation (see ::view-transition rules in base.css) layered
    // under the incoming page's cascade. Guards: only on a genuine ROUTE
    // change (a query-only hash change, e.g. calendar deep-links, must not
    // flash a full page transition), and never under prefers-reduced-motion.
    // flushSync is required inside the callback — the API snapshots "after"
    // state when the callback settles, and React 18 would otherwise defer
    // the state update past that point. Firefox simply takes the else path
    // and still gets the CSS cascade on the remounted <main>.
    let lastRoute = currentRoute();
    const onHash = () => {
      const next = currentRoute();
      if (next === lastRoute) return;
      lastRoute = next;
      const vt = (document as Document & {
        startViewTransition?: (cb: () => void) => {
          ready: Promise<void>;
          finished: Promise<void>;
        };
      }).startViewTransition?.bind(document);
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (vt && !reduceMotion) {
        // A skipped transition (rapid back-to-back navs, hidden tab) rejects
        // these promises — that's fine, the route still updates; swallow the
        // rejection so it doesn't surface as a console error.
        const t = vt(() => flushSync(() => setRoute(next)));
        t.ready.catch(() => {});
        t.finished.catch(() => {});
      } else {
        setRoute(next);
      }
    };
    window.addEventListener("hashchange", onHash);
    if (!window.location.hash) navigate("dashboard");
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  return route;
}
