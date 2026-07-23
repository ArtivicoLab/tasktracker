// Hydrate every store from IndexedDB on boot; seed sample data on first run.

import * as db from "../lib/db";
import * as sync from "../lib/sync";
import { buildSample, type Seed } from "../lib/sample";
import { isValidAccessCode } from "../lib/access";
import { isDemo, setDemoFlag } from "../lib/demo";
import { useTasks } from "./useTasks";
import { useSettings } from "./useSettings";
import { useSync, resumePendingPush } from "./useSync";
import type { Recurrence, Task } from "../lib/types";

const SEEDED_KEY = "seeded"; // legacy flag: the OLD build wrote it when it seeded IndexedDB

async function loadStores() {
  const [tasks, recurrences] = await Promise.all([
    db.all<Task>("tasks"),
    db.all<Recurrence>("recurrences"),
  ]);
  useTasks.getState().setAll(tasks, recurrences);
}

// Load the full sample straight into the in-memory stores. Nothing is
// written to IndexedDB (db writes are gated off while demo mode is on), so the
// dummy data is purely a display layer — it can never be pushed to a Sheet or
// mistaken for real data. Every reload rebuilds a fresh, complete demo.
export function loadSampleIntoStores(s: Seed = buildSample()) {
  useTasks.getState().setAll(s.tasks, s.recurrences);
}

// One-time migration off the OLD model, which seeded the sample straight into
// IndexedDB for un-activated users. Under the new memory-only demo, IndexedDB
// must hold ONLY real data — otherwise a legacy visitor who turns demo OFF (or
// connects) would see stale seed rows masquerading as their own. So: if the old
// seed ran and they never became a real (activated) user, clear the collections.
const DEMO_MIGRATED_KEY = "demoMigratedV1";
async function migrateLegacySeed() {
  if (await db.getKV<boolean>(DEMO_MIGRATED_KEY)) return;
  const hadOldSeed = await db.getKV<boolean>(SEEDED_KEY);
  if (hadOldSeed && !useSettings.getState().activated) {
    for (const c of db.ALL_COLLECTIONS) {
      try { await db.clearStore(c); } catch { /* store may not exist yet */ }
    }
  }
  await db.setKV(DEMO_MIGRATED_KEY, true);
}

// Memoize so React StrictMode's double-invoked effect (or any repeat call)
// shares ONE run.
let bootPromise: Promise<void> | null = null;

export function bootstrap(): Promise<void> {
  if (!bootPromise) bootPromise = runBootstrap();
  return bootPromise;
}

async function runBootstrap() {
  await useSettings.getState().load();
  await migrateLegacySeed();
  const demo = isDemo();
  db.setDbDemoMode(demo);
  if (demo) {
    loadSampleIntoStores();
  } else {
    await loadStores();
  }
  // Only safe to resume a pending Sheets push now that every store above is
  // actually hydrated — see resumePendingPush()'s own doc comment for why
  // this can't run any earlier (e.g. useSync.ts's own module-eval time).
  resumePendingPush();
}

/**
 * Flip demo mode on/off at runtime (the Settings toggle). The choice persists
 * in localStorage (see lib/demo). Turning it ON shows the full sample without
 * touching the user's stored data; turning it OFF reloads their real
 * (possibly empty) data from IndexedDB.
 */
export async function setDemoMode(on: boolean): Promise<void> {
  setDemoFlag(on);
  db.setDbDemoMode(on);
  if (on) {
    loadSampleIntoStores();
  } else {
    await loadStores();
  }
}

/**
 * Unlock the real (Google Sheets-connectable) app with an Etsy purchase code.
 * Soft client-side check only (see lib/access.ts). Under the memory-only demo
 * model there's nothing to wipe — the sample was never written to IndexedDB —
 * so this just leaves demo mode and shows the user's own (blank for a new
 * buyer) data. It deliberately does NOT delete anything: if someone turned demo
 * off and entered real data before buying, that data survives activation.
 */
export async function activate(code: string): Promise<boolean> {
  if (!isValidAccessCode(code)) return false;
  setDemoFlag(false);
  db.setDbDemoMode(false);
  if (!useSettings.getState().activated) {
    await loadStores();
    useSettings.getState().update({ activated: true, accessCode: code.trim().toUpperCase() });
  }
  return true;
}

export async function resetEverything() {
  // An explicit "start fresh" is a real-app action — leave demo so writes land
  // again and the user sees their now-empty real planner, not the sample.
  setDemoFlag(false);
  db.setDbDemoMode(false);
  await db.wipeAll();
  useTasks.getState().setAll([], []);
}

/**
 * Disconnect Google Sheets AND remove this device's local copy — for someone
 * handing off or walking away from a shared/borrowed device who doesn't want
 * their planner visible to whoever picks it up next. A plain "Disconnect"
 * only stops syncing (see sync.ts); this also wipes IndexedDB.
 *
 * Marks the device disconnected FIRST, synchronously, before the slower
 * final-push/wipe steps below — a page refresh at any point during this
 * function still leaves the app correctly disconnected. The final push then
 * still refuses to let the local wipe happen if it fails (offline, API error,
 * etc.) — this button must never be the reason someone loses data that never
 * actually made it to their Sheet, but a failed push no longer holds the
 * disconnect itself hostage.
 */
export async function disconnectAndClearDevice(): Promise<
  { ok: true } | { ok: false; reason: string }
> {
  sync.markDisconnected();
  useSync.setState({ connected: false, wrongAccount: false, error: "" });

  try {
    // false: this is a trailing best-effort backup after the user already
    // confirmed "disconnect" — it must never surprise them with a popup at
    // this point. If the token can't be silently refreshed, fail cleanly
    // (nothing gets wiped, see the catch below) rather than popping a window.
    await sync.pushAll(false); // token is still live — markDisconnected() alone doesn't forget it
  } catch (e) {
    sync.disconnect(); // now safe to drop the token too; the device is disconnected either way
    return {
      ok: false,
      reason:
        e instanceof Error
          ? e.message
          : "Disconnected, but couldn't confirm your last changes reached Google Sheets. Nothing on this device was cleared.",
    };
  }
  sync.disconnect();
  await db.wipeAll();
  useTasks.getState().setAll([], []);
  return { ok: true };
}

/**
 * "Reuse year after year": clear one-time tasks and past recurring
 * occurrences while keeping every reusable structure intact — Recurring task
 * templates, categories, team members, and every other Settings value. The
 * recurrence engine lazily regenerates occurrences from the surviving
 * Recurrences the next time they're viewed, so nothing about the recurring
 * schedule itself is lost.
 */
export async function clearTaskHistory(): Promise<void> {
  await db.clearStore("tasks");
  useTasks.getState().setAll([], useTasks.getState().recurrences);
  useSync.getState().touch();
}

export { loadStores };
