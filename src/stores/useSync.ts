import { create } from "zustand";
import { hasClientId } from "../lib/google/auth";
import * as sync from "../lib/sync";
import { useToast } from "./useToast";
import type { Collection } from "../lib/db";

export type SyncStatus = "synced" | "syncing" | "offline";

interface SyncState {
  status: SyncStatus;
  pending: number;
  connected: boolean;
  spreadsheetId: string;
  /** The most recently ABANDONED sheet's id, if any (from startNewSheet() or
      the wrongAccount recovery) — for a "your previous sheet is still here"
      link in Settings, never used to reconnect automatically. */
  previousSpreadsheetId: string;
  hasClientId: boolean;
  busy: boolean;
  error: string;
  /**
   * True when the last connect() failed because the signed-in Google account
   * doesn't own the remembered sheet (picked the wrong account, or a genuine
   * switch). Settings shows a specific "try a different account" / "start a
   * new sheet with this account" choice instead of the raw API error text.
   */
  wrongAccount: boolean;
  /**
   * True when a background sync attempt found the Google token expired and a
   * silent refresh failed — typically the tab sat open long enough that the
   * ~1hr token lapsed. Background code deliberately never opens a popup to
   * fix this itself (see ReauthRequiredError); the UI shows a "tap to
   * reconnect" affordance instead, and that click is what's allowed to open
   * Google's sign-in popup safely.
   */
  needsReauth: boolean;

  setStatus: (s: SyncStatus) => void;
  /**
   * Called after every mutation; debounced push to Sheets when connected.
   * Pass the collection that changed so only its tab gets pushed (falls back
   * to a full push if omitted).
   */
  touch: (collection?: Collection) => void;
  /** Best-effort push of celebrateConfetti/celebrateSound to the Sheet's
   * Settings tab — call right after toggling either one. No-op if not
   * connected; failures are swallowed since these are a nice-to-have, never
   * something that should surface an error to the user over a toggle. */
  pushCelebratePrefs: () => void;

  connect: () => Promise<void>;
  /** Link to an existing Sheet by id/URL — the cross-device recovery path. */
  relink: (idOrUrl: string) => Promise<boolean>;
  disconnect: () => void;
  /**
   * `allowInteractive` (default true) must be passed `false` for any caller
   * that isn't a direct, current user click — e.g. the `online` browser
   * event, which fires whenever the network reconnects and can happen while
   * the tab isn't even focused. Defaulting this to "allowed" is what let a
   * Google popup appear "while the window is not used" (confirmed
   * 2026-07-13); see pushAll()'s doc comment in sync.ts.
   */
  syncNow: (allowInteractive?: boolean) => Promise<void>;
  /** Recovery for wrongAccount: abandon the remembered sheet, then connect()
      again so a fresh spreadsheet is created for the currently-signed-in account. */
  useThisAccountInstead: () => Promise<void>;
  /** Deliberate "start a new sheet" from Settings — same primitive as
      useThisAccountInstead, own name/doc comment since it's a different
      feature reached from a different place, not an error recovery. */
  startNewSheet: () => Promise<void>;
  /**
   * What the sync pill's click calls, in Header AND Sidebar — centralized so
   * a failure (e.g. a blocked popup) surfaces as a toast right where the user
   * clicked, instead of only being visible if they happen to go to Settings.
   */
  tapToRetry: () => Promise<void>;
}

let flashTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Flip needsReauth on. Used to also fire a one-time toast explaining why
 * (see git history) — replaced with the persistent <ReconnectBanner/>
 * (mounted in App.tsx) instead, since a toast only helps if you're looking
 * at the exact moment it fires. That's precisely the case this flag exists
 * for: the tab sat closed or idle long enough for the ~1hr Google token to
 * lapse, so the person most likely to miss a transient toast is exactly the
 * person who was away when it happened, then comes back and starts typing
 * before ever noticing anything changed (reported directly, 2026-07-14: "we
 * need some kind of popup... let them know... since they have been away for
 * too long"). The banner stays up on every screen for as long as needsReauth
 * is true instead of disappearing after a few seconds, so it's there
 * whenever they actually look, not just at the instant it happened. Kept as
 * its own function (rather than inlining `set({needsReauth: true})` at every
 * call site) purely so a future need for one-time-per-episode behavior has
 * somewhere to live again.
 */
function flagNeedsReauth(_get: () => SyncState, set: (p: Partial<SyncState>) => void) {
  set({ needsReauth: true });
}

export const useSync = create<SyncState>((set, get) => ({
  // "synced" here does NOT mean a push actually succeeded — it's a blind
  // guess based only on network state. If a prior session left work pending
  // (sync.hasPendingPush(), restored from localStorage — see LS_DIRTY_TABS'
  // doc comment in sync.ts) show "syncing" instead so the pill reflects
  // reality; the boot effect below immediately resumes that push.
  status: navigator.onLine ? (sync.hasPendingPush() ? "syncing" : "synced") : "offline",
  pending: 0,
  connected: sync.isConnected(),
  spreadsheetId: sync.getSpreadsheetId(),
  previousSpreadsheetId: sync.getPreviousSpreadsheetId(),
  hasClientId,
  busy: false,
  error: "",
  wrongAccount: false,
  needsReauth: false,

  setStatus: (status) => set({ status }),

  touch: (collection) => {
    if (get().connected) {
      sync.markDirty(collection ? sync.COLLECTION_TAB[collection] : undefined);
      sync.scheduleFlush(
        (s) => set({ status: s }),
        () => flagNeedsReauth(get, set)
      );
      return;
    }
    // Local-only mode: flash a quick "saved".
    if (!navigator.onLine) {
      set((s) => ({ status: "offline", pending: s.pending + 1 }));
      return;
    }
    set({ status: "syncing" });
    if (flashTimer) clearTimeout(flashTimer);
    flashTimer = setTimeout(() => set({ status: "synced", pending: 0 }), 400);
  },

  pushCelebratePrefs: () => {
    if (get().connected) void sync.pushCelebratePrefs(false).catch(() => {});
  },

  connect: async () => {
    set({ busy: true, error: "", wrongAccount: false, status: "syncing" });
    try {
      const id = await sync.connect();
      set({
        connected: true,
        spreadsheetId: id,
        busy: false,
        wrongAccount: false,
        needsReauth: false,
        status: "synced",
      });
    } catch (e) {
      const wrongAccount = e instanceof sync.SheetPermissionDeniedError;
      set({
        busy: false,
        wrongAccount,
        status: get().connected ? "synced" : "offline",
        error: wrongAccount
          ? "This Google account doesn't have access to your existing Task Tracker sheet."
          : e instanceof Error ? e.message : "Could not connect.",
      });
    }
  },

  relink: async (idOrUrl) => {
    set({ busy: true, error: "", status: "syncing" });
    try {
      await sync.relink(idOrUrl);
      set({
        connected: true,
        spreadsheetId: sync.getSpreadsheetId(),
        busy: false,
        status: "synced",
      });
      return true;
    } catch (e) {
      set({
        busy: false,
        status: get().connected ? "synced" : "offline",
        error: e instanceof Error ? e.message : "Could not link that sheet.",
      });
      return false;
    }
  },

  disconnect: () => {
    sync.disconnect();
    // spreadsheetId is deliberately left in place — sync.disconnect() keeps the
    // sheet remembered so the next connect() relinks to it instead of creating
    // a new one; blanking it here would just make "Open my sheet" disappear
    // for no reason while disconnected.
    set({ connected: false, error: "", needsReauth: false });
  },

  syncNow: async (allowInteractive = true) => {
    if (!get().connected) return;
    set({ busy: true, status: "syncing", error: "" });
    try {
      await sync.pushAll(allowInteractive);
      set({ busy: false, status: "synced", needsReauth: false });
    } catch (e) {
      const needsReauth = e instanceof sync.ReauthRequiredError;
      set({
        busy: false,
        status: "offline",
        needsReauth,
        error: e instanceof Error ? e.message : "Sync failed.",
      });
    }
  },

  useThisAccountInstead: async () => {
    sync.abandonRememberedSheet();
    set({ previousSpreadsheetId: sync.getPreviousSpreadsheetId() });
    await get().connect();
  },

  /**
   * Deliberate "give me a brand new sheet" for an already-connected user —
   * reached from its own Settings action, not the wrongAccount error
   * recovery flow (a different call site with a different reason for
   * existing). Requested directly, 2026-07-14: there was previously no way
   * to start a new sheet except by accident, via a 403 error branch.
   *
   * Calls sync.createNewSheet(), NOT connect() — an earlier version of this
   * action called abandonRememberedSheet() then connect(), which (a) requests
   * connect()'s combined Sheets+Calendar scope on every click, needlessly
   * re-triggering Google's heavier "unverified app" consent screen meant to
   * show only once at genuine first connect, and (b) abandoned the old sheet
   * BEFORE confirming the new one actually got created — a failed/blocked
   * popup left the user silently disconnected from everything, with no clear
   * message (confirmed 2026-07-14, reported directly: "start a new sheet
   * failed... Google hasn't verified this app..." then "probably it was
   * already disconnected but its not even saying that"). createNewSheet()
   * fixes both: narrower scope, and only abandons the old sheet once the new
   * one is confirmed reachable — see its own doc comment in sync.ts.
   */
  startNewSheet: async () => {
    set({ busy: true, error: "", status: "syncing" });
    try {
      const id = await sync.createNewSheet();
      set({
        connected: true,
        spreadsheetId: id,
        previousSpreadsheetId: sync.getPreviousSpreadsheetId(),
        busy: false,
        needsReauth: false,
        status: "synced",
      });
    } catch (e) {
      set({
        busy: false,
        status: get().connected ? "synced" : "offline",
        error: e instanceof Error ? e.message : "Could not start a new sheet.",
      });
    }
  },

  tapToRetry: async () => {
    if (get().needsReauth) {
      // A prior silent refresh already failed — that's the only way
      // needsReauth gets set. Routing this through syncNow()'s normal
      // silent-first chain (authedFetch tries requestToken(scope, false)
      // before ever trying interactive) means retrying a silent GIS request
      // we already know is doomed. When it hangs — a confirmed GIS quirk,
      // see auth.ts's SILENT_TOKEN_TIMEOUT_MS comment: a silent
      // prompt:"none" request can go completely silent with no callback at
      // all instead of erroring — up to 10s pass between this click and the
      // eventual interactive fallback, long enough that the browser stops
      // treating the resulting popup as user-initiated and silently blocks
      // it. That's the mechanism behind "it still pops up every once in a
      // while" (confirmed 2026-07-13). sync.reauth() avoids this by
      // requesting an interactive token FIRST, synchronously off the click.
      //
      // Deliberately sync.reauth(), NOT connect() — an earlier version of
      // this fix called connect() here since it already does
      // interactive-first correctly, but connect() also requests the
      // COMBINED SCOPE_SHEETS_AND_CALENDAR scope, which is meant to be
      // asked for exactly once, at the genuine first "Connect Google" click
      // (see connect()'s own doc comment: "nothing else in the app is ever
      // allowed to ask for calendar.events interactively"). Requesting it on
      // every routine reconnect made Google show its heavier "Google hasn't
      // verified this app... sensitive info" consent screen every time
      // (confirmed 2026-07-14: showed on this pill's reconnect, never on
      // Settings' Sync now, which only ever escalates to SCOPE_SHEETS).
      // sync.reauth() requests SCOPE_SHEETS alone and skips connect()'s
      // ensureTabs/pull/syncAccessCode too — see its own doc comment for why
      // that extra weight doesn't belong in a routine "token just expired"
      // recovery (a separate, earlier bug: any one of those steps failing
      // for an unrelated reason used to leave needsReauth stuck for a
      // reason that had nothing to do with reconnecting).
      set({ busy: true, error: "" });
      try {
        await sync.reauth();
        set({ busy: false, status: "synced", needsReauth: false });
      } catch (e) {
        set({
          busy: false,
          status: get().connected ? "synced" : "offline",
          error: e instanceof Error ? e.message : "Could not reconnect.",
        });
      }
    } else {
      await get().syncNow();
    }
    const err = get().error;
    if (err) useToast.getState().show({ message: err });
  },
}));

/**
 * Resume any push a prior session left pending (see sync.ts's
 * hasPendingPush()/LS_DIRTY_TABS doc comment) instead of leaving it stuck
 * until the next unrelated edit happens to touch the same tab. Silent only
 * (allowInteractive is baked into attemptPush -> pushDirty -> writeTab as
 * false) — a page load has no click behind it, same rule as every other
 * background path in this chain.
 *
 * MUST be called only after the Zustand stores have actually been hydrated
 * from IndexedDB (i.e. after bootstrap() resolves — see stores/bootstrap.ts's
 * call to this), never at this module's own top-level scope. This module is
 * imported (directly or transitively) by bootstrap.ts itself, so its
 * synchronous top-level code runs during initial script evaluation — well
 * before bootstrap()'s async IndexedDB reads even start, since those only
 * begin inside a `useEffect` in App.tsx, which fires after React's first
 * render. A push resumed that early used to read tabValues() off the stores'
 * still-empty defaults and clear+overwrite the real Sheet tab with nothing
 * but a header row, even though the real data was sitting untouched in
 * IndexedDB the whole time and never got re-pushed once the (successful, but
 * wrong) empty write cleared the dirty flag (confirmed 2026-07-14 — real,
 * reproducible data loss, not hypothetical).
 */
export function resumePendingPush(): void {
  if (sync.isConnected() && sync.hasPendingPush()) {
    sync.attemptPush(
      (s) => useSync.setState({ status: s }),
      () => flagNeedsReauth(useSync.getState, useSync.setState)
    );
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    const st = useSync.getState();
    // false: the network reconnecting has nothing to do with a user click and
    // can fire while the tab isn't even focused — must never risk a popup.
    // If a real reauth is needed, this fails fast (ReauthRequiredError) and
    // the sync pill shows "Tap to reconnect" for the user to click when ready.
    if (st.connected) void st.syncNow(false);
    else useSync.setState({ status: "synced", pending: 0 });
  });
  window.addEventListener("offline", () => useSync.setState({ status: "offline" }));

  // Proactively top up the Google token between edits instead of only ever
  // checking reactively at the exact moment a save needs one — that reactive
  // pattern is what made reconnecting feel like it kept ambushing active work
  // (confirmed 2026-07-13: "annoying... while we finish editing", and rapid
  // edits made it worse — the debounced save timer keeps getting pushed back
  // by each new edit, so the reauth check only ever fired once things finally
  // went quiet, landing right as a backlog of work was about to fire too).
  // Silent-only (see keepTokenWarm) — this never opens a popup itself, it
  // just means "tap to reconnect" tends to appear during a pause, not mid-edit.
  const warmUp = () =>
    void sync.keepTokenWarm(
      useSync.getState().needsReauth,
      () => flagNeedsReauth(useSync.getState, useSync.setState)
    );
  // Also run once immediately on boot, not just on the interval/visibility
  // triggers below. Those only fire 5 minutes in, or on a hidden→visible
  // transition — neither covers the tab having been fully CLOSED and
  // reopened (a fresh page load starts "visible" already, so there's no
  // hidden→visible transition to catch it). That gap meant reopening the
  // app after being away for a while showed no sign anything was wrong, and
  // the user could start typing well before the next check, 5 minutes
  // later, ever ran — reported directly, 2026-07-14: "let the user just
  // type type type while their work is not being logged in... let them know
  // to check for it since they have been away for too long." keepTokenWarm
  // is silent-only regardless of when it's called, so this can't itself pop
  // a Google sign-in window; it just makes needsReauth (and the persistent
  // <ReconnectBanner/>) accurate from the very first render instead of
  // catching up minutes later.
  warmUp();
  setInterval(warmUp, 5 * 60_000);
  // The setInterval above is NOT enough on its own: browsers throttle timers
  // in a backgrounded/minimized tab (Chrome can drop a hidden tab's interval
  // to firing far less than once per 5 min), so "left the tab open in the
  // background for a while" is exactly the case where the token can slip past
  // TOKEN_REFRESH_MARGIN_MS with no proactive check catching it — the user
  // then comes back, the token's already expired, and if a silent refresh
  // also fails at that exact moment, it lands as "tap to reconnect" with no
  // obvious cause (confirmed report: happens "after left open for a while").
  // Fixed by also checking immediately whenever the tab regains focus, same
  // pattern main.tsx already uses for the service-worker update check — this
  // catches up on whatever the throttled interval missed the instant it can.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") warmUp();
  });
}
