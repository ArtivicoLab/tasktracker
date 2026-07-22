// Google Identity Services (GIS) token client (spec §8). No gapi — we load the
// tiny GIS script and call REST endpoints with fetch ourselves.

const GIS_SRC = "https://accounts.google.com/gsi/client";
export const SCOPE_SHEETS = "https://www.googleapis.com/auth/drive.file";
export const SCOPE_CALENDAR = "https://www.googleapis.com/auth/calendar.events";
// Requested together, once, at the single interactive moment we have (the
// user's "Connect Google" click) — nothing in this app ever requests
// SCOPE_CALENDAR interactively on its own (see calendar.ts's authedFetch: it
// only ever tries a silent, prompt:"none" request). Google's silent flow only
// succeeds for a scope the account has already granted this client_id, so
// without this, calendar.events is never actually granted and every
// reminder/Calendar sync (task reminders, bill reminders, the daily digest)
// silently no-ops forever — confirmed 2026-07-13 as the reason the budget
// bell toggle "did nothing": it flips locally, but createEvent's token
// request fails silently every time. Requesting the combined scope here
// covers both APIs off one consent screen.
export const SCOPE_SHEETS_AND_CALENDAR = `${SCOPE_SHEETS} ${SCOPE_CALENDAR}`;

export const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? "";
export const hasClientId = CLIENT_ID.length > 0;

interface TokenState {
  token: string;
  expiresAt: number; // epoch ms
  scopes: Set<string>;
}
// Keyed by the exact scope STRING requested (SCOPE_SHEETS vs SCOPE_CALENDAR
// are different keys) — NOT a single shared slot. A single shared token used
// to mean requesting a Calendar-reminder token would silently evict a still
// valid Sheets token (and vice versa), so ordinary use (any task/bill with a
// reminder on) ping-ponged between the two scopes on every save, each swap
// needing a fresh token — which is exactly what surfaced as a real Google
// popup on every single add (confirmed 2026-07-13). Each scope now keeps its
// own independent cache entry so getting one token never evicts the other.
const tokenCache = new Map<string, TokenState>();

// This in-memory Map is ALL that used to back the token cache — meaning a
// page reload for ANY reason (a new deploy triggering the app's own
// auto-update reload, a manual refresh, a backgrounded tab getting reclaimed
// by the OS) threw away a token that might still have had 40+ minutes of
// real validity left, forcing a fresh sign-in from zero every time. During a
// session with frequent deploys this made reconnecting feel constant even
// though the underlying ~1hr Google token wasn't actually dying that fast
// (confirmed 2026-07-13). Mirrored into sessionStorage (survives a reload,
// scoped to this tab/session, gone when the tab closes — same practical
// exposure as keeping it in a JS variable) so a reload can revive a still-
// valid token instead of discarding it.
const SESSION_KEY_PREFIX = "lp.token.";

function persistToken(scope: string, entry: TokenState) {
  try {
    sessionStorage.setItem(
      SESSION_KEY_PREFIX + scope,
      JSON.stringify({ token: entry.token, expiresAt: entry.expiresAt, scopes: [...entry.scopes] })
    );
  } catch {
    /* sessionStorage unavailable (private mode, quota) — in-memory cache still covers this page load */
  }
}

function forgetPersistedToken(scope: string) {
  try {
    sessionStorage.removeItem(SESSION_KEY_PREFIX + scope);
  } catch {
    /* ignore */
  }
}

/** In-memory cache miss doesn't necessarily mean "no valid token" anymore —
    check sessionStorage before concluding a fresh sign-in is needed. */
function getCached(scope: string): TokenState | undefined {
  const inMemory = tokenCache.get(scope);
  if (inMemory) return inMemory;
  try {
    const raw = sessionStorage.getItem(SESSION_KEY_PREFIX + scope);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as { token: string; expiresAt: number; scopes: string[] };
    if (parsed.expiresAt - Date.now() <= 60_000) {
      forgetPersistedToken(scope); // expired (or near enough) — don't keep reviving a dead token
      return undefined;
    }
    const revived: TokenState = { token: parsed.token, expiresAt: parsed.expiresAt, scopes: new Set(parsed.scopes) };
    tokenCache.set(scope, revived);
    return revived;
  } catch {
    return undefined;
  }
}

// GIS global (loaded from the script tag).
declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (cfg: {
            client_id: string;
            scope: string;
            prompt?: string;
            callback: (resp: {
              access_token?: string;
              expires_in?: number;
              scope?: string;
              error?: string;
            }) => void;
          }) => { requestAccessToken: (opts?: { prompt?: string }) => void };
          revoke: (token: string, done?: () => void) => void;
        };
      };
    };
  }
}

let gisReady: Promise<void> | null = null;
function loadGis(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (gisReady) return gisReady;
  gisReady = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = GIS_SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Could not load Google sign-in. Check your connection."));
    document.head.appendChild(s);
  });
  return gisReady;
}

/**
 * Fetch the Google sign-in script ahead of time (fire-and-forget), so it's
 * already loaded by the time the user clicks Connect. Without this, the first
 * click has to wait on a real network round-trip before it can call
 * requestAccessToken() — which happens outside the click's synchronous call
 * stack and can make browsers treat the resulting popup as not user-initiated
 * (opens, then gets closed immediately).
 */
export function preloadGis(): void {
  if (hasClientId) void loadGis();
}

function tokenValid(scope: string): boolean {
  const entry = getCached(scope);
  return !!entry && entry.expiresAt - Date.now() > 60_000;
}

/** Milliseconds left before `scope`'s cached token expires (0 if there is
    none cached at all). Lets background code decide "is this worth quietly
    refreshing now" without forcing a request. */
export function tokenTimeLeftMs(scope: string): number {
  const entry = getCached(scope);
  return entry ? Math.max(0, entry.expiresAt - Date.now()) : 0;
}

// GIS's callback is not always guaranteed to fire — e.g. with strict
// third-party cookie/storage blocking, a silent (prompt:"none") request can
// just never call back at all instead of cleanly erroring. With no bound on
// that, every caller awaiting requestToken() hung forever with no error,
// which is exactly what left the sync pill stuck on "Syncing…" with no way
// to recover short of a full page reload (confirmed 2026-07-13). Silent
// requests are normally near-instant, so its timeout is short. A BLOCKED
// popup is the other confirmed real-world cause (2026-07-13) — the browser
// can silently swallow requestAccessToken() with no callback at all, so an
// interactive request needs its own bound too.
const SILENT_TOKEN_TIMEOUT_MS = 10_000;
// Was 45s ("real sign-in with an existing Google session normally takes
// under 15s") — that estimate only holds for an ALREADY-VERIFIED app's
// streamlined consent screen. While this app is unverified (see TODO.md —
// still true as of 2026-07-14 despite Google Cloud's "publish to
// production" step being done; sensitive/restricted scopes like
// calendar.events need a SEPARATE Google verification review that's still
// pending), every interactive sign-in adds several extra required screens:
// "this app hasn't been verified" → Advanced → "Go to [app] (unsafe)" → a
// scope-selection screen listing each permission individually → final
// consent. Confirmed live, 2026-07-14: a real attempt genuinely reading each
// screen (exactly the caution Google's own warning asks for) ran past 45s
// and failed with "Google sign-in didn't complete" even though nothing was
// actually broken — the user was still correctly working through the flow.
// 45s punishes exactly the careful behavior that warning screen requests.
// Bumped to 100s: generous enough for a real person to read every screen
// once, still bounded so a genuinely stuck/blocked popup surfaces an error
// well under two minutes instead of hanging silently forever.
const INTERACTIVE_TOKEN_TIMEOUT_MS = 100_000;

/**
 * Request (or silently refresh) an access token for `scope`.
 * @param interactive false = try silent (prompt: ''); true = allow the popup.
 *   No default — every caller up the chain (authedFetch, pushAll, connect,
 *   etc.) is required to pass this explicitly for the same reason none of
 *   THEM default it either: this is the root-level function underneath all
 *   of them, so an unnoticed default here is the single most dangerous place
 *   for one. No current call site relies on a default, but see CLAUDE.md's
 *   "allowInteractive must have NO default anywhere in the Sheets/Calendar/
 *   auth chain" for why that's exactly how a previous version of this bug
 *   shipped elsewhere in this same chain.
 */
export function requestToken(
  scope: string,
  interactive: boolean
): Promise<string> {
  if (!hasClientId) {
    return Promise.reject(
      new Error("No Google client ID configured. Add VITE_GOOGLE_CLIENT_ID to your .env.")
    );
  }
  if (tokenValid(scope)) return Promise.resolve(getCached(scope)!.token);

  return loadGis().then(
    () =>
      new Promise<string>((resolve, reject) => {
        let settled = false;
        const timeoutMs = interactive ? INTERACTIVE_TOKEN_TIMEOUT_MS : SILENT_TOKEN_TIMEOUT_MS;
        const timeout = setTimeout(() => {
          if (settled) return;
          settled = true;
          reject(new Error(interactive
            // Two confirmed real causes (2026-07-13): the browser silently
            // blocked the popup (GIS's callback never fires), OR the popup
            // opened fine but Google's own accounts.google.com returned a
            // transient error (e.g. a 503) with no interactive flow to
            // complete, so nothing ever calls back either way. Cover both —
            // don't tell someone to check their popup blocker when the real
            // issue was Google's server having a bad moment.
            ? "Google sign-in didn't complete. If a popup was blocked, look for a blocked-popup icon in your address bar and allow it for this site. If the popup opened but showed a Google error page, that's a temporary issue on Google's end — just try again."
            : "Could not silently refresh your Google connection."));
        }, timeoutMs);

        const client = window.google!.accounts.oauth2.initTokenClient({
          client_id: CLIENT_ID,
          scope,
          callback: (resp) => {
            if (settled) return; // already timed out — ignore a very late callback
            settled = true;
            clearTimeout(timeout);
            if (resp.error || !resp.access_token) {
              reject(new Error(resp.error || "Authorization was cancelled."));
              return;
            }
            const entry: TokenState = {
              token: resp.access_token,
              expiresAt: Date.now() + (resp.expires_in ?? 3600) * 1000,
              scopes: new Set((resp.scope ?? scope).split(" ")),
            };
            tokenCache.set(scope, entry);
            persistToken(scope, entry);
            resolve(resp.access_token);
          },
        });
        // '' attempts silent; 'consent' forces the account chooser.
        client.requestAccessToken({ prompt: interactive ? "" : "none" });
      })
  );
}

export function currentToken(): string | null {
  return tokenValid(SCOPE_SHEETS) ? getCached(SCOPE_SHEETS)!.token : null;
}

/** Drop a scope's cached token — e.g. after a 401 shows it's actually bad
    server-side even though it still looked time-valid locally. The NEXT
    requestToken() for that scope will fetch a genuinely fresh one. */
export function invalidateToken(scope: string): void {
  tokenCache.delete(scope);
  forgetPersistedToken(scope);
}

export function forgetToken() {
  for (const entry of tokenCache.values()) {
    try {
      window.google?.accounts.oauth2.revoke(entry.token);
    } catch {
      /* ignore */
    }
  }
  tokenCache.clear();
  // Clear both known scopes explicitly, not just whatever happened to be
  // hydrated into tokenCache already — getCached() only loads a scope from
  // sessionStorage lazily on first use, so a scope nothing has touched yet
  // this page load could still have a stale entry sitting in sessionStorage.
  forgetPersistedToken(SCOPE_SHEETS);
  forgetPersistedToken(SCOPE_CALENDAR);
}
