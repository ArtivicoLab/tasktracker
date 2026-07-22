// Global build flags.
// LOCAL_MODE = true → the whole app runs on-device (IndexedDB) with no Google.
// Flip to false once the Sheets sync layer (lib/google/*) is wired in.
export const LOCAL_MODE = false;

export const APP_NAME = "Task Tracker";
// NOT renamed alongside APP_NAME — this is the literal IndexedDB database
// name; changing it would make indexedDB.open() create a brand-new empty
// database on next load, silently orphaning every existing local user's
// tasks under the old name. Decoupled from the display brand on purpose,
// same as COPYRIGHT_HOLDER/APP_NAME already are from each other.
export const DB_NAME = "taskcenter";
export const DB_VERSION = 1;

// Public source repository — the Privacy screen's "check the source" link.
export const GITHUB_URL = "https://github.com/ArtivicoLab/tasktracker";

// Copyright holder shown in Privacy / footers.
export const COPYRIGHT_HOLDER = "Task Tracker";

// Version stamp shown in page footers — package.json version plus the short
// commit SHA, so a live site's (or local dev server's) freshness can be
// checked at a glance instead of guessing whether a deploy/rebuild actually
// landed. CI's VITE_COMMIT_SHA takes precedence when set (real deploys);
// __LOCAL_COMMIT_SHA__ (git HEAD at build time) covers local dev, where
// VITE_COMMIT_SHA is never set and APP_VERSION alone never changes.
export const APP_VERSION = __APP_VERSION__;
export const BUILD_SHA = (import.meta.env.VITE_COMMIT_SHA || __LOCAL_COMMIT_SHA__ || "").slice(0, 7);
