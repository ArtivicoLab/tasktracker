// Sync layer (spec §8). Bridges the local IndexedDB stores and the user's Google
// Sheet. v1 is single-user: we mirror each collection to its own tab. Reads pull
// the whole sheet; writes are local-first, then a debounced full-tab push
// (last-write-wins by the device that saved most recently — safe for one user).

import * as db from "./db";
import {
  HEADERS,
  LEGACY_TAB_RENAMES,
  SPREADSHEET_TITLE,
  TAB,
  V2_TABS,
  recurrenceToRow,
  rowToRecurrence,
  rowToTask,
  taskToRow,
} from "./schema";
import {
  batchGet,
  createSpreadsheet,
  ensureTabs,
  ReauthRequiredError,
  SheetNotFoundError,
  SheetPermissionDeniedError,
  writeTab,
} from "./google/sheets";
export { ReauthRequiredError, SheetPermissionDeniedError };
import { forgetToken, requestToken, SCOPE_SHEETS, tokenTimeLeftMs } from "./google/auth";
import { isValidAccessCode } from "./access";
import { isDemo } from "./demo";
import { useSettings } from "../stores/useSettings";
import { useTasks } from "../stores/useTasks";
import type { Recurrence, Task } from "./types";

const LS_ID = "tt.spreadsheetId";
// Separate from LS_ID on purpose: LS_ID is kept forever once a sheet exists (so
// a later connect() always relinks to the SAME sheet — see connect()'s doc
// comment). LS_DISCONNECTED is the only thing disconnect() sets. Without this
// split, disconnect() used to delete LS_ID outright, so the next Connect click
// found no "existing" id and created a BRAND NEW spreadsheet instead of
// relinking — a buyer's data ended up scattered across several sheets on
// repeated disconnect/reconnect. Never remove LS_ID in disconnect() again.
//
// This is an opt-OUT flag (absence = connected), not opt-in, on purpose: an
// opt-in flag that only gets set inside connect() silently broke syncing for
// anyone already connected before that flag was introduced — isConnected()
// started returning false for them with zero error, because nothing had ever
// set the new flag for an existing session. Opt-out is migration-safe: an
// already-connected user with no flag at all is correctly still connected.
const LS_DISCONNECTED = "tt.disconnected";
// Remembers whatever LS_ID was about to be abandoned (start-a-new-sheet,
// wrong-account recovery) so it's not just gone from the user's perspective
// — the sheet itself was never deleted, only unlinked, but if they don't
// happen to remember its exact name in Drive, "go look at my old data" has
// no starting point without this. Deliberately just a link/reminder, NOT a
// one-tap "switch back" — see abandonRememberedSheet()'s doc comment for why
// that would need real care, not just wiring the id into relink().
const LS_PREVIOUS_ID = "tt.previousSpreadsheetId";

/** Accepts a raw spreadsheet id or a full Google Sheets URL and returns the id. */
export function extractSpreadsheetId(idOrUrl: string): string {
  const trimmed = idOrUrl.trim();
  const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : trimmed;
}

export function getSpreadsheetId(): string {
  return localStorage.getItem(LS_ID) ?? "";
}
export function isConnected(): boolean {
  return getSpreadsheetId().length > 0 && localStorage.getItem(LS_DISCONNECTED) !== "1";
}
function setSpreadsheetId(id: string) {
  localStorage.setItem(LS_ID, id);
  localStorage.removeItem(LS_DISCONNECTED);
}

const SYNC_TABS = [
  TAB.Tasks,
  TAB.Recurrences,
];
const ALL_TABS = [...SYNC_TABS, ...V2_TABS];

// Maps an IndexedDB collection to the single Sheet tab it lives in — lets a
// mutation push just its own tab instead of rewriting every tab on every edit
// (see COLLECTION_TAB usage in touch/markDirty below).
export const COLLECTION_TAB: Record<db.Collection, string> = {
  tasks: TAB.Tasks,
  recurrences: TAB.Recurrences,
};

// Tabs pending a push. A mutation adds its tab here; a successful push clears
// only the tabs it wrote, so a failed/rate-limited push (e.g. a 429 mid-way)
// leaves the rest dirty for the next attempt instead of silently dropping them.
//
// Persisted to localStorage (not just kept in memory) because the debounced
// flush waits 2s after the last edit before actually pushing (see
// scheduleFlush) — any reload inside that window (a manual refresh, or the
// app's OWN service-worker auto-update reload, which main.tsx triggers
// whenever a new deploy's worker takes control) used to wipe this Set
// entirely along with the pending setTimeout. The edit stayed safe in
// IndexedDB, but the "this still needs to reach the Sheet" flag vanished
// with nothing left to retry it — and the freshly reloaded page's status
// pill defaulted to a blind "Synced" (see useSync.ts's initial `status`)
// that never actually checked whether anything was still owed to the Sheet.
// Confirmed 2026-07-14, reported directly: "it says synced in the left
// panel but its not synced at all since new entry are not sent to the
// sheet." Mirrors auth.ts's token sessionStorage mirroring for the same
// reason: an in-memory-only value that legitimately needs to outlive one
// page load will get silently discarded by a reload more often than
// expected. localStorage (not sessionStorage) here since a dirty tab
// genuinely needs to survive the tab being closed and reopened too, not
// just a same-session reload.
const LS_DIRTY_TABS = "tt.dirtyTabs";

function loadDirtyTabs(): Set<string> {
  try {
    const raw = localStorage.getItem(LS_DIRTY_TABS);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as string[];
    const valid: string[] = SYNC_TABS;
    return new Set(parsed.filter((t) => valid.includes(t)));
  } catch {
    return new Set();
  }
}

function persistDirtyTabs(): void {
  try {
    localStorage.setItem(LS_DIRTY_TABS, JSON.stringify([...dirtyTabs]));
  } catch {
    /* localStorage unavailable (private mode, quota) — in-memory Set still covers this page load */
  }
}

let dirtyTabs = loadDirtyTabs();
export function markDirty(tab?: string): void {
  if (tab) dirtyTabs.add(tab);
  else SYNC_TABS.forEach((t) => dirtyTabs.add(t)); // no tab given: fall back to a full push
  persistDirtyTabs();
}

/** Whether a prior session left work that never reached the Sheet — e.g. a
    reload landed inside the 2s debounce window before it could push. Used
    on boot to resume the flush instead of trusting a blind "Synced". */
export function hasPendingPush(): boolean {
  return dirtyTabs.size > 0;
}

// ---- push: build a full tab (header + current rows) ----
// Reads straight from IndexedDB (the shared, durable store), NOT from this
// tab/window's in-memory Zustand snapshot. Two open tabs/windows on one
// device (a normal pattern for an offline-first, no-login-gate app — e.g. the
// installed PWA plus a leftover browser tab) each hydrate their own in-memory
// store once at boot and never learn about a sibling's edits. Building a push
// from in-memory state meant whichever tab pushed LAST simply clear+rewrote
// the whole Sheet tab from its own stale snapshot, silently erasing rows a
// sibling tab had already gotten onto the Sheet with no error and no way to
// notice (confirmed 2026-07-14 — a real, reproducible data-loss path, not
// hypothetical). IndexedDB itself is shared across every tab/window in the
// same origin, so reading fresh from it here means whichever tab happens to
// push always pushes the current union of everyone's committed writes,
// without needing any cross-tab locking/messaging. The debounced 2s flush
// (see scheduleFlush) already gives a same-tab edit's fire-and-forget
// `db.put()` (see crud.ts) ample time to land before this reads it back.
async function tabValues(tab: string): Promise<string[][]> {
  const header = HEADERS[tab] ?? [];
  let rows: string[][] = [];
  switch (tab) {
    case TAB.Tasks: rows = (await db.all<Task>("tasks")).map(taskToRow); break;
    case TAB.Recurrences: rows = (await db.all<Recurrence>("recurrences")).map(recurrenceToRow); break;
  }
  return [header, ...rows];
}

// In-memory only (never persisted, never survives a reload) — set by the
// Coach Tour while it has temporarily swapped a real (non-demo) user's stores
// for sample data so every tour step has something to point at (see
// CoachTour.tsx). Unlike isDemo(), which is a durable per-account mode, this
// only needs to survive the current tab's lifetime: it exists purely so a
// push that happens to fire while the store briefly holds fake tour data
// can't write that fake data over the user's real, connected Sheet
// (confirmed 2026-07-14 — replaying the tour could otherwise silently
// corrupt real Sheet tabs with sample rows, with no dirty flag left afterward
// to ever correct it). The tour resumes sync on every path that restores the
// real data, including its unmount cleanup, so this can't get stuck true.
let syncSuspended = false;
export function suspendSync(): void {
  syncSuspended = true;
}
export function resumeSync(): void {
  syncSuspended = false;
}

// pushAll() and pushDirty() must never run concurrently with each other OR
// with themselves — e.g. Settings' "Sync now" (pushAll) firing while the
// debounced background flush (pushDirty) is already mid-flight for the same
// tab. Two independent clear+write cycles against the same tab can resolve
// out of request order, so whichever finishes SECOND can silently overwrite
// a newer write with an older snapshot, and both sides independently clear
// the tab from `dirtyTabs` after their own "successful" write — permanently
// dropping whatever edit only existed in the newer snapshot, with no retry
// and no error surfaced (confirmed 2026-07-14). A simple promise chain
// serializes every call through here, regardless of which function or how
// many callers, so the next one always starts from a state that already
// reflects the previous one's result.
let pushChain: Promise<void> = Promise.resolve();
function serialized(fn: () => Promise<void>): Promise<void> {
  const run = pushChain.catch(() => {}).then(fn);
  pushChain = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

/**
 * `allowInteractive` has NO default on purpose — every caller must consciously
 * decide. This used to silently default to allowing a popup, and pushAll() is
 * reachable from the `online` browser event (network reconnects), which has
 * nothing to do with a user click and can fire while the tab isn't even
 * focused — that's exactly what surfaced as a Google popup appearing "while
 * the window is not used" (confirmed 2026-07-13). Pass `true` only from a
 * genuine, current click handler (Connect, Sync now button); `false` from
 * anything automatic.
 */
export function pushAll(allowInteractive: boolean): Promise<void> {
  return serialized(() => pushAllInner(allowInteractive));
}

async function pushAllInner(allowInteractive: boolean): Promise<void> {
  // Hard stop: never write the in-memory sample to a real Sheet. Demo mode
  // should always be off by the time anyone is connected (connect() clears it),
  // but this guarantees the sample can never leak upward even if it isn't.
  if (isDemo() || syncSuspended) return;
  const id = getSpreadsheetId();
  if (!id) return;
  // Create any tab that doesn't exist yet on this spreadsheet (e.g. a
  // collection added to SYNC_TABS in a later release, on an already-connected
  // user's older sheet) before writing to it — see writeAllTabs' doc comment.
  await ensureTabs(id, SYNC_TABS, allowInteractive, LEGACY_TAB_RENAMES);
  await writeAllTabs(id, SYNC_TABS, allowInteractive);
}

/**
 * Push only the tabs a mutation actually touched (see markDirty), instead of
 * rewriting every tab on every edit — this is what kept a single-field edit
 * from tripping Google's per-minute write quota during busy sessions and
 * silently dropping whichever tab hadn't been reached yet. A tab is only
 * cleared from the dirty set once it's actually written, so a
 * rate-limited/failed push retries it next time.
 */
export function pushDirty(): Promise<void> {
  return serialized(pushDirtyInner);
}

async function pushDirtyInner(): Promise<void> {
  if (isDemo() || syncSuspended) return;
  const id = getSpreadsheetId();
  if (!id) return;
  const tabs = [...dirtyTabs];
  if (tabs.length === 0) return;
  // Same as pushAll: a tab that was never created on this (older, already-
  // connected) spreadsheet used to fail every single write forever with no
  // per-tab isolation, which starved every OTHER dirty tab queued behind it
  // in the same pass too (confirmed 2026-07-14). Creating whatever's missing
  // first fixes the root cause, not just the blocking symptom.
  await ensureTabs(id, tabs, false, LEGACY_TAB_RENAMES);
  await writeAllTabs(id, tabs, false);
}

/**
 * Shared write loop for pushAll/pushDirty. One tab's write failing no longer
 * aborts the rest of the batch — each tab is isolated in its own try/catch,
 * so a single permanently-broken tab (or one that fails only this pass) can't
 * starve every other pending edit behind it. A ReauthRequiredError is the one
 * exception: the same token backs every call in this loop, so if the FIRST
 * one is dead they all will be identically — no point burning through the
 * rest, bail immediately so the caller's reauth handling fires right away.
 * Any other per-tab error is remembered and re-thrown once every tab in this
 * pass has been attempted, so the caller's existing retry-with-backoff still
 * kicks in for whatever's still dirty, while every tab that DID succeed this
 * pass is already off the dirty set and won't be needlessly retried.
 */
async function writeAllTabs(id: string, tabs: string[], allowInteractive: boolean): Promise<void> {
  let firstError: unknown;
  for (const tab of tabs) {
    try {
      await writeTab(id, tab, await tabValues(tab), allowInteractive);
      dirtyTabs.delete(tab);
      persistDirtyTabs();
    } catch (err) {
      if (err instanceof ReauthRequiredError) throw err;
      firstError = firstError ?? err;
    }
  }
  if (firstError) throw firstError;
}

// Silent tokens are normally requested reactively, only at the moment a push
// actually needs one — so if the token happened to be near/past expiry, the
// reauth prompt landed exactly when the user was mid-edit trying to save
// something, which is what made "tap to reconnect" feel like it kept
// interrupting active work (confirmed 2026-07-13). This checks proactively,
// between edits, so a needed reconnect surfaces calmly on the sync pill
// BEFORE it's blocking anything, not the moment someone hits save.
const TOKEN_REFRESH_MARGIN_MS = 10 * 60_000; // top up once under 10 min of life left
export async function keepTokenWarm(
  alreadyNeedsReauth: boolean,
  onReauthRequired: () => void
): Promise<void> {
  if (isDemo() || !isConnected() || !navigator.onLine) return;
  // Already known broken and waiting on the user to click "tap to reconnect"
  // — retrying the same silent request every 5 minutes just re-confirms the
  // same failure over and over with nothing new to learn from it, and reads
  // as the reconnect prompt "getting ridiculous" (confirmed 2026-07-13). The
  // reactive retry-with-backoff in attemptPush already covers this state;
  // this proactive check's whole job is catching a token that's ABOUT to
  // expire, not repeatedly re-poking one that already failed.
  if (alreadyNeedsReauth) return;
  if (tokenTimeLeftMs(SCOPE_SHEETS) > TOKEN_REFRESH_MARGIN_MS) return; // still plenty of runway
  try {
    await requestToken(SCOPE_SHEETS, false); // silent only — never pop a window from a timer
  } catch {
    onReauthRequired();
  }
}

// ---- pull: replace local data from the sheet ----
function parseRows<T>(rows: string[][], fromRow: (r: string[]) => T): T[] {
  // rows[0] is the header written by the app; skip it. Skip blank rows (no id).
  return rows
    .slice(1)
    .filter((r) => (r[0] ?? "").trim().length > 0)
    .map(fromRow);
}

export async function pull(allowInteractive: boolean): Promise<void> {
  const id = getSpreadsheetId();
  if (!id) return;
  const data = await batchGet(id, SYNC_TABS, allowInteractive);

  const tasks = parseRows<Task>(data[TAB.Tasks] ?? [], rowToTask);
  const recurrences = parseRows<Recurrence>(data[TAB.Recurrences] ?? [], rowToRecurrence);

  await Promise.all([
    replaceStore("tasks", tasks),
    replaceStore("recurrences", recurrences),
  ]);

  useTasks.getState().setAll(tasks, recurrences);
  await pullCelebratePrefs(id, allowInteractive).catch(() => {});
}

async function replaceStore<T extends { id: string }>(
  store: db.Collection,
  values: T[]
) {
  await db.clearStore(store);
  if (values.length) await db.putMany(store, values);
}

// ---- Meta tab: a tiny key/value store carried inside the user's own Sheet ----
async function readMetaTab(id: string, allowInteractive: boolean): Promise<Map<string, string>> {
  const data = await batchGet(id, [TAB.Meta], allowInteractive).catch(() => ({}) as Record<string, string[][]>);
  const rows = (data[TAB.Meta] ?? []).slice(1); // skip header
  return new Map(rows.filter((r) => (r[0] ?? "").trim()).map((r) => [r[0], r[1] ?? ""]));
}

async function writeMetaKey(id: string, key: string, value: string, allowInteractive: boolean): Promise<void> {
  const map = await readMetaTab(id, allowInteractive);
  map.set(key, value);
  await writeTab(id, TAB.Meta, [["key", "value"], ...map.entries()], allowInteractive);
}

const ACCESS_CODE_META_KEY = "accessCode";
const CELEBRATE_CONFETTI_META_KEY = "celebrateConfetti";
const CELEBRATE_SOUND_META_KEY = "celebrateSound";

/** Adopt celebrateConfetti/celebrateSound from the Sheet, if either key is
 * present — called from pull() so any device syncing picks up a change made
 * on another device. Swallows its own errors so a Meta-tab hiccup never
 * blocks the actual Tasks/Recurrences pull. */
async function pullCelebratePrefs(id: string, allowInteractive: boolean): Promise<void> {
  const map = await readMetaTab(id, allowInteractive);
  const patch: { celebrateConfetti?: boolean; celebrateSound?: boolean } = {};
  if (map.has(CELEBRATE_CONFETTI_META_KEY)) patch.celebrateConfetti = map.get(CELEBRATE_CONFETTI_META_KEY) === "TRUE";
  if (map.has(CELEBRATE_SOUND_META_KEY)) patch.celebrateSound = map.get(CELEBRATE_SOUND_META_KEY) === "TRUE";
  if (Object.keys(patch).length > 0) useSettings.getState().update(patch);
}

/** Push the current celebrateConfetti/celebrateSound values up to the Sheet
 * — call this right after toggling either one. No-op if not connected. */
export async function pushCelebratePrefs(allowInteractive: boolean): Promise<void> {
  const id = getSpreadsheetId();
  if (!id) return;
  const settings = useSettings.getState();
  const map = await readMetaTab(id, allowInteractive).catch(() => new Map<string, string>());
  map.set(CELEBRATE_CONFETTI_META_KEY, settings.celebrateConfetti ? "TRUE" : "FALSE");
  map.set(CELEBRATE_SOUND_META_KEY, settings.celebrateSound ? "TRUE" : "FALSE");
  await writeTab(id, TAB.Meta, [["key", "value"], ...map.entries()], allowInteractive);
}

/**
 * Keep the buyer's Etsy access code and the Sheet in sync, both directions:
 * - Already activated locally → push our code up (so a second device that
 *   later connects to this same Sheet inherits it).
 * - Not yet activated, but this Sheet already carries a code from a previous
 *   device → adopt it locally. No local wipe here — pull() already brought
 *   down the real data for this Sheet, unlike a fresh manual code entry.
 */
async function syncAccessCode(id: string, allowInteractive: boolean): Promise<void> {
  const settings = useSettings.getState();
  if (settings.activated && settings.accessCode) {
    await writeMetaKey(id, ACCESS_CODE_META_KEY, settings.accessCode, allowInteractive).catch(() => {});
    return;
  }
  const map = await readMetaTab(id, allowInteractive).catch(() => new Map<string, string>());
  const remoteCode = map.get(ACCESS_CODE_META_KEY) ?? "";
  if (remoteCode && isValidAccessCode(remoteCode)) {
    settings.update({ activated: true, accessCode: remoteCode });
  }
}

/**
 * Lightweight reconnect for the common "token just expired, tab sat open a
 * while" case — tapToRetry()'s needsReauth branch. Deliberately narrower
 * than connect() in two ways:
 * - Weight: no ensureTabs/pull/syncAccessCode, just a fresh token then one
 *   pushDirty. Those extra steps are right for a genuine first link or a
 *   long-overdue relink, but overkill for a routine expired token — any ONE
 *   of them failing for an unrelated reason (a blip, a rate limit) used to
 *   leave needsReauth stuck true for a reason that had nothing to do with
 *   reconnecting (see the "match the recovery action's weight to what
 *   actually broke" bug this replaced).
 * - Scope: requests SCOPE_SHEETS alone, never the combined
 *   SCOPE_SHEETS_AND_CALENDAR. Calendar access was already granted once at
 *   the original Connect; re-requesting it on every routine reconnect isn't
 *   needed, and its extra sensitivity is what makes Google show the heavier
 *   "Google hasn't verified this app... sensitive info" consent screen
 *   (confirmed 2026-07-14: this showed on the sidebar's reconnect, which had
 *   started requesting the combined scope, but never on Settings' Sync now,
 *   which only ever escalates to SCOPE_SHEETS). connect()'s own doc comment
 *   already establishes the rule this was supposed to follow: "nothing else
 *   in the app is ever allowed to ask for calendar.events interactively."
 * Still requests the token FIRST, synchronously off the click, before any
 * silent attempt — trying silent first here (like pushAll()'s normal chain
 * does) risks the eventual interactive fallback landing outside the
 * browser's user-gesture window if the silent attempt hangs its full
 * timeout, which is likely precisely because needsReauth being true already
 * means a recent silent attempt just failed. Once this resolves, pushAll's
 * own authedFetch calls hit the now-warm SCOPE_SHEETS cache entry instantly
 * — no further GIS round-trip, no added delay.
 */
export async function reauth(): Promise<void> {
  await requestToken(SCOPE_SHEETS, true);
  await pushAll(true);
}

/**
 * Connect a Google account. If a sheet id is remembered we relink + pull;
 * otherwise we create a fresh app-managed spreadsheet and push local data up.
 * Returns the spreadsheet id.
 */
export async function connect(): Promise<string> {
  // Ask for an interactive token FIRST, straight off the click — every other
  // Sheets call below tries a silent refresh before falling back to a popup,
  // which works for background sync but would delay the very first popup here
  // past the click's window for the browser to treat it as user-initiated.
  //
  // SCOPE_SHEETS only, deliberately NOT the combined SCOPE_SHEETS_AND_CALENDAR
  // this used to request. Calendar reminder syncing is being deferred to a
  // future version (decided 2026-07-14: "even i dont understand why we need
  // the calendar for" — it's a nice-to-have on top of reminders the app
  // already has, not core to the product, and calendar.events being a
  // Google-classified sensitive scope means requesting it here would send
  // every single connect through Google's "unverified app" review process —
  // real turnaround time, for a feature that isn't load-bearing). Requesting
  // a scope that was never declared/approved on the OAuth consent screen is
  // also exactly what caused a real, confirmed cluster of sign-in failures
  // the same day (see CLAUDE.md's "THE DATABASE IS THE USER'S GOOGLE SHEET"
  // section) — don't reintroduce that by adding SCOPE_CALENDAR back here
  // without first actually completing Google's verification for it.
  await requestToken(SCOPE_SHEETS, true);

  // Leaving demo BEFORE any push/pull: setDemoMode reloads the stores from the
  // user's real (blank for a new buyer) IndexedDB, so pushAll below seeds the
  // new sheet with THAT — never the in-memory sample. Dynamic import avoids the
  // sync ⇄ bootstrap ⇄ useSync require cycle.
  if (isDemo()) {
    const { setDemoMode } = await import("../stores/bootstrap");
    await setDemoMode(false);
  }

  const existing = getSpreadsheetId();
  if (existing) {
    try {
      await ensureTabs(existing, ALL_TABS, true, LEGACY_TAB_RENAMES);
      localStorage.removeItem(LS_DISCONNECTED);
      // Push local changes UP before pulling the sheet down. This device may
      // have kept working (safely, in IndexedDB) through a stretch where the
      // connection was stuck needing reauth — background pushes were failing
      // that whole time, so the SHEET is the stale side here, not the
      // device. A pull()-only reconnect used to blindly overwrite local data
      // with that stale sheet content, silently erasing everything typed
      // while disconnected (confirmed 2026-07-13 — real data loss, reported
      // directly: "once I signed back in everything was cleared"). We just
      // got a fresh interactive token above, so this push is reliable; pull()
      // afterward then just reads back a sheet that already reflects this
      // device's latest state, instead of clobbering it.
      await pushAll(true);
      await pull(true);
      await syncAccessCode(existing, true);
      return existing;
    } catch (err) {
      if (err instanceof SheetNotFoundError) {
        localStorage.removeItem(LS_ID);
        // fall through to create a new one
      } else {
        // A SheetPermissionDeniedError lands here too — the signed-in account
        // isn't the one that owns the remembered sheet (wrong Google account
        // picked, or a genuine account switch). Deliberately NOT auto-abandoning
        // the old link or auto-creating a new sheet here: that could silently
        // hide a simple "picked the wrong account" mistake behind what looks
        // like a fresh, empty planner. Propagate the typed error so the UI can
        // offer an explicit choice instead (see abandonRememberedSheet below
        // and SettingsScreen's handling of SheetPermissionDeniedError).
        throw err;
      }
    }
  }
  const id = await createSpreadsheet(SPREADSHEET_TITLE, ALL_TABS, true);
  setSpreadsheetId(id);
  // connect() already forced a fresh interactive token synchronously at the
  // top of this function (straight off the click), so this token is already
  // valid — true here just documents that a popup is safe in this call chain.
  await pushAll(true); // seed the new sheet with whatever is on-device now
  await syncAccessCode(id, true);
  return id;
}

/**
 * Create and link a brand new, empty spreadsheet for an ALREADY-connected
 * user who wants to abandon their current one and start fresh (Settings'
 * "Start a new sheet") — deliberately its own function, not a reuse of
 * connect(), found the same day, 2026-07-14, from one report ("start a new
 * sheet failed: Google sign-in didn't complete" immediately followed by
 * "Google hasn't verified this app... requesting access to sensitive info",
 * then "probably it was already disconnected but its not even saying
 * that"):
 *
 * ORDERING — the old sheet must NOT be abandoned until the new one is
 * confirmed reachable. The previous version called abandonRememberedSheet()
 * BEFORE attempting to connect, so a failed/blocked interactive request left
 * the user with LS_ID already cleared — silently disconnected from
 * EVERYTHING, with no clear message, exactly what was reported. Getting the
 * token first means a failure here throws before anything about the old
 * sheet has changed at all; the user stays cleanly connected to their
 * original sheet the whole time, and only gets abandoned once the new one
 * has actually been created and linked.
 *
 * (This function's scope used to also differ from connect() — connect()
 * requested the combined SCOPE_SHEETS_AND_CALENDAR, this one only
 * SCOPE_SHEETS. That distinction is moot now: Calendar reminder syncing was
 * dropped from what the app requests at all, deferred to a future version —
 * see connect()'s own comment — so both now request the same plain
 * SCOPE_SHEETS. Left this note so the history isn't confusing if Calendar
 * ever comes back and connect() goes back to a broader scope.)
 */
export async function createNewSheet(): Promise<string> {
  await requestToken(SCOPE_SHEETS, true);
  const id = await createSpreadsheet(SPREADSHEET_TITLE, ALL_TABS, true);
  // Only NOW that the new sheet genuinely exists — see this function's doc
  // comment for why abandoning the old one any earlier (e.g. before the
  // token request above) is exactly the bug that shipped.
  abandonRememberedSheet();
  setSpreadsheetId(id);
  await pushAll(true); // seed the new sheet with whatever is on-device now
  await syncAccessCode(id, true);
  return id;
}

/**
 * Relink to a spreadsheet id (or full Sheets URL) the user pasted in — the
 * genuine cross-device path: a brand-new browser has no remembered id and no
 * local access code, so this is how it recovers both the real data AND the
 * activation state from an already-connected device's Sheet, with no re-typed
 * code and no wipe. Available even before local activation, since that's
 * exactly what it's for.
 */
export async function relink(idOrUrl: string): Promise<void> {
  const id = extractSpreadsheetId(idOrUrl);
  if (!id) throw new Error("That doesn't look like a Google Sheet link or ID.");
  // SCOPE_SHEETS only — see connect()'s matching comment for why Calendar is
  // deliberately not requested here anymore (deferred to a future version).
  await requestToken(SCOPE_SHEETS, true);
  // Leaving demo BEFORE pull(): pull()'s writes to IndexedDB are gated off
  // while demo mode is on (see db.ts's demoMode flag), so without this the
  // real Sheet data pulled below would show in the stores for this session
  // only, never actually persist locally, and get silently wiped back to the
  // in-memory sample on the very next reload — while the app still reported
  // "Connected" the whole time (confirmed 2026-07-14). A brand-new
  // browser/device defaults to demo mode ON, which is exactly relink()'s own
  // target scenario ("a brand-new browser has no remembered id"), so this
  // isn't an edge case. Same fix connect() already has; see its own comment.
  if (isDemo()) {
    const { setDemoMode } = await import("../stores/bootstrap");
    await setDemoMode(false);
  }
  await ensureTabs(id, ALL_TABS, true, LEGACY_TAB_RENAMES);
  setSpreadsheetId(id);
  await pull(true);
  await syncAccessCode(id, true);
}

/**
 * The durable, synchronous half of disconnecting: mark this device as
 * disconnected and stop the background sync loop. Deliberately kept separate
 * from forgetting the token (see disconnect()) so a caller can call this
 * FIRST, before any slower async step like a final best-effort push — a page
 * refresh at any point after this line still leaves the app correctly
 * "disconnected," instead of the whole operation silently reverting because
 * a slow network call never got the chance to finish.
 */
export function markDisconnected(): void {
  // Deliberately keep LS_ID — see the comment on its declaration. Only mark
  // "disconnected" so the next Connect click relinks to this same sheet
  // instead of minting a new one.
  localStorage.setItem(LS_DISCONNECTED, "1");
  if (timer) clearTimeout(timer);
  clearRetry(); // no point quietly retrying a push once the user has disconnected
}

export function disconnect() {
  markDisconnected();
  forgetToken();
}

/**
 * The explicit "yes, really use a different Google account" recovery step for
 * a SheetPermissionDeniedError, and also what startNewSheet() calls: forgets
 * the remembered sheet id so the next connect() call creates a brand-new
 * spreadsheet, instead of retrying against the one it has no access to (or,
 * for startNewSheet, instead of relinking to the one just being abandoned).
 * Never called automatically — see the comment in connect()'s catch block.
 * Stashes the outgoing id as "previous" first (see LS_PREVIOUS_ID) so the
 * app can still point back to it — the sheet itself is never deleted here,
 * only unlinked.
 */
export function abandonRememberedSheet(): void {
  const outgoing = getSpreadsheetId();
  if (outgoing) localStorage.setItem(LS_PREVIOUS_ID, outgoing);
  localStorage.removeItem(LS_ID);
}

/** The id of whatever sheet was most recently abandoned via
    abandonRememberedSheet(), if any — for a "your previous sheet is still
    here, open it" link, not for reconnecting automatically. */
export function getPreviousSpreadsheetId(): string {
  return localStorage.getItem(LS_PREVIOUS_ID) ?? "";
}

// ---- debounced flush on every mutation, with background retry on failure ----
// Local writes (IndexedDB) always succeed instantly — a mutation is never lost.
// This only governs getting a dirty tab up to the Sheet; a transient failure
// (rate limit, blip) must never need the user to notice and manually hit
// "Sync now" — we keep quietly retrying with backoff until it lands, so a fast
// editor's later edits aren't the only thing that happens to retry it.
let timer: ReturnType<typeof setTimeout> | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
const RETRY_BASE_MS = 15_000;
const RETRY_MAX_MS = 120_000;
let retryDelay = RETRY_BASE_MS;
// Nothing previously stopped two pushes from running at once: a slow push
// (several dirty tabs, slow network) plus more edits arriving in the
// meantime could fire a second attemptPush before the first had finished —
// each independently deciding it needed a token and each requesting one,
// which is exactly the shape of "multiple popups at once" (confirmed
// 2026-07-13). One flush in flight at a time now; anything that comes in
// during it just waits for the current one to finish instead of racing it.
let pushInFlight = false;

function clearRetry() {
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
  retryDelay = RETRY_BASE_MS;
}

// Exported so useSync.ts can resume a push left pending from a prior session
// (see hasPendingPush()/LS_DIRTY_TABS above) on boot, reusing the same
// pushInFlight guard, retry-with-backoff, and reauth handling as every other
// caller instead of a separate ad hoc boot-time push.
export function attemptPush(
  onState: (s: "syncing" | "synced" | "offline") => void,
  onReauthRequired: () => void
) {
  if (pushInFlight) {
    // A push is already running — don't start a second one racing it, but
    // don't just drop this either: a tab dirtied WHILE the in-flight push is
    // running isn't in its snapshot, so check back shortly after it should
    // be done rather than silently waiting for the next unrelated edit.
    retryTimer = setTimeout(() => attemptPush(onState, onReauthRequired), 3000);
    return;
  }
  if (!navigator.onLine) {
    onState("offline");
    retryTimer = setTimeout(() => attemptPush(onState, onReauthRequired), retryDelay);
    return;
  }
  onState("syncing");
  pushInFlight = true;
  pushDirty()
    .then(() => {
      clearRetry();
      onState("synced");
    })
    .catch((err) => {
      onState("offline");
      if (err instanceof ReauthRequiredError) {
        // The token expired and a silent refresh failed (e.g. the tab sat
        // open for a long while) — surface it so the UI can offer a real
        // "tap to reconnect" button. Never opened a popup for this
        // ourselves; see ReauthRequiredError.
        //
        // Deliberately NOT rescheduling a retry here. This used to keep
        // retrying with the same backoff as any other failure, silently
        // forever — but a silent refresh that just failed will keep failing
        // identically every time until the user actually does something;
        // nothing about the underlying auth state changes just by waiting.
        // The visible symptom was the sync pill flickering
        // syncing → offline every ~2 minutes indefinitely while the tab
        // sat idle (confirmed 2026-07-13, reported directly: "the app keeps
        // trying to reconnect all the time while left alone... let the user
        // reconnect when disconnected"). `keepTokenWarm()` already has this
        // exact "don't re-hammer a known failure" guard (its own
        // `alreadyNeedsReauth` check) — this brings the push retry loop in
        // line with that same rule instead of being the one place that
        // still ignored it. The next actual push attempt now only comes
        // from the user's own action: a new edit (scheduleFlush() already
        // calls clearRetry() and starts fresh) or tapping "reconnect"
        // (tapToRetry() → syncNow(), a completely separate call path).
        onReauthRequired();
        return;
      }
      // Any other failure (offline, rate limit, a blip) is genuinely
      // transient and likely to self-resolve — keep retrying with backoff.
      retryTimer = setTimeout(() => attemptPush(onState, onReauthRequired), retryDelay);
      retryDelay = Math.min(retryDelay * 2, RETRY_MAX_MS);
    })
    .finally(() => {
      pushInFlight = false;
    });
}

export function scheduleFlush(
  onState: (s: "syncing" | "synced" | "offline") => void,
  onReauthRequired: () => void
) {
  if (!isConnected()) return;
  if (!navigator.onLine) {
    onState("offline");
    return;
  }
  if (timer) clearTimeout(timer);
  clearRetry(); // a fresh edit supersedes any pending backoff retry
  onState("syncing");
  timer = setTimeout(() => attemptPush(onState, onReauthRequired), 2000);
}
