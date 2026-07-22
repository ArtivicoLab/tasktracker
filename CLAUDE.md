# CLAUDE.md — Task Tracker

Guidance for any AI agent (or human) working in this repo. Read this first.

## What this is
A **static, dark-mode-first, phone-first PWA** that replaces the "Task Tracker /
Smart Task Center" spreadsheet category sold on Etsy (dark mode, recurring tasks,
per-task "Assigned to" owner, a Weekly/Monthly Calendar, and a live KPI+chart
dashboard). It is the *interface*; the user's own **Google Sheet is the database**.
Runs fully offline on-device (IndexedDB) and optionally syncs to Google Sheets.

**Sibling of TrackerA (Life Planner), TrackerB (Ultimate Budget), TrackerC (Social
Planner), and TrackerD (Habit Tracker)** — this repo was forked from TrackerA on
2026-07-20 and trimmed to a single-purpose task/recurring-task tracker: everything
about Habits, Budget, Savings, Debt Payoff, Goals, Meal Planner/Setup, Grocery,
Fitness, Weight, Hydration, and Time Blocking was **deleted**, not hidden — those
modules do not exist in this codebase at all. Only `Tasks`, `Recurrences`, and
`Settings` remain as Sheet tabs. If you're looking for how a removed feature used
to work, or for the deep multi-day sync/auth bug-fix history, TrackerA's own
`CLAUDE.md` is the canonical record — the sync engine (`src/lib/sync.ts`,
`src/lib/google/*`) here is functionally the SAME code, just pointed at 2 tabs
instead of 16, so every lesson below about *that* layer still applies to this repo
too, and TrackerA's history explains WHY it's shaped this way in more depth than
repeated here.

## Git — never auto-commit or push
Do not run `git commit`, `git push`, or `git add` toward a commit unless the
user explicitly asks for it **in that same turn**. This repo is routinely
edited by more than one agent session at once — an unprompted commit can
silently sweep up and push another session's in-progress, unreviewed changes
together with yours. GitHub Pages deploys straight from `main` (see
`.github/workflows/deploy.yml`), so an unwanted commit can also mean an
unwanted production deploy. Build, typecheck, and test freely; leave the
working tree uncommitted for the user to review and push themselves. Being
asked to commit once does not carry over to later turns — ask again each time.

**Confirmed live risk on this exact sync/CI pattern (TrackerC, 2026-07-15,
inherited into this repo along with the rest of the sync layer):** a push
landing mid-agent-edit shipped a broken build — a multi-step rename had one
edit land (renaming a constant) before a second edit (renaming its usages)
had landed, and a commit+push happened in that exact window. GitHub Actions'
`build` job (`tsc -b`) caught it immediately and correctly; `deploy` never
ran. **The fix was never to debug `deploy.yml` or Pages settings** — it was
to notice the on-disk working tree already had the finished, consistent
edit, re-verify it locally (`tsc --noEmit` + `npm run build` + tests, all
clean), and commit+push that as a new commit superseding the broken one.
**General rule: if a deploy fails on a build/typecheck error right after a
multi-step edit was in progress, check the current working tree against the
broken commit before assuming the logic itself is wrong.** Also: run
`tsc --noEmit` immediately before `git commit`, not just after finishing an
edit — it's the cheapest way to catch an accidentally-mid-edit snapshot
before it ships.

## Version control — always keep the version number real and visible
The app must always show a version number that actually reflects what's
deployed — no hardcoded placeholder strings, ever.
- Version comes from `src/lib/config.ts`: `APP_VERSION` (from `package.json`'s
  `version` field, baked in via `__APP_VERSION__` in `vite.config.ts`) and
  `BUILD_SHA` (CI's `VITE_COMMIT_SHA` when set, else the local git HEAD via
  `__LOCAL_COMMIT_SHA__` in `vite.config.ts` — so the footer always shows a
  real, changing commit sha, even in local dev where `APP_VERSION` alone
  never moves).
- It's displayed in three places, all must stay wired to the real values:
  Settings screen footer, desktop `Sidebar.tsx` footer, and `PrivacyScreen.tsx`.
  If you add another place the version could show, pull from `config.ts` —
  never hardcode a version string anywhere.
- `.github/workflows/deploy.yml` auto-bumps the patch version to that run's
  `$GITHUB_RUN_NUMBER` before building (ephemeral, not committed back to the
  repo) so every real deploy shows a version number that visibly changed —
  don't remove that step.
- `main.tsx` actively checks the service worker for updates whenever the app
  regains focus (`visibilitychange`) and auto-reloads once a new worker takes
  control (`controllerchange`), so an installed/long-open PWA can't get stuck
  serving a stale cached build. Keep this behavior if you touch `sw.js` or the
  SW registration.
- Settings screen also has a manual "Check for updates" button for the user to
  force a refresh — keep it working if you touch that screen.

## THE DATABASE IS THE USER'S GOOGLE SHEET — nothing else (not yet connected here)
This is the product, not a nice-to-have. There is **no backend and no other
database**. The user's **Google Sheet is the single source of truth**; IndexedDB
is only an **offline cache** in front of it. Any persisted field must roundtrip
through `schema.ts` to a Sheet column, or it does not really exist.

**Current state (2026-07-20): `LOCAL_MODE = false` in `config.ts`, but this repo
has no `.env` yet** — it was excluded when forking from TrackerA, on purpose, since
each app needs its own real Google OAuth Web Client ID (a TrackerA client ID's
Authorized JavaScript origins won't include this app's port/domain). The Settings
screen's Google Sheets card shows "Setup needed" until this is done — that's
expected, not a bug. To connect from scratch (owner-only step):
1. Create an OAuth **Web** client ID in Google Cloud Console, add
   `http://localhost:5516` (this repo's fixed dev port) and the real production
   origin as Authorized JavaScript origins.
2. `cp .env.example .env` and set `VITE_GOOGLE_CLIENT_ID=…`.
3. Restart dev/build.
4. **Declare `https://www.googleapis.com/auth/drive.file` on the OAuth consent
   screen's Data Access page** — Google Cloud Console → APIs & Services → OAuth
   consent screen → Data Access → Add or Remove Scopes. This is a SEPARATE step
   from creating the OAuth client and is NOT optional — TrackerA hit a real,
   confirmed cluster of confusing "app not verified"/"sign-in didn't complete"
   symptoms from skipping this that looked like code bugs but weren't. Only
   `drive.file` is requested (non-sensitive, no verification needed) — Calendar
   syncing is deliberately not requested here either (see TrackerA's history for
   why, if it's ever reconsidered).
5. In-app: Settings → Connect Google → sync creates the sheet + pushes local data.

**Product principles (do not violate):**
1. No backend of ours — static hosting only (GitHub Pages). No server code.
2. User data lives in the user's Google Drive via Sheets API (`drive.file` scope only).
3. Offline-first: everything works from the IndexedDB cache; sync when online.
4. Phone-first, designed at 390px — **but dashboard-first**, so desktop (≥900px,
   sidebar layout) must also look great.
5. ADHD-friendly = a design requirement: progress rings, low-friction capture,
   gentle overdue language ("N tasks need your love"), no notification firehose.
6. **Zero friction for buyers:** the app opens straight to the Dashboard (no
   onboarding gate) and auto-seeds sample data on first run so it looks alive.
7. **Dark mode is the identity of this product**, not just an option. `theme`
   defaults to `"dark"` (`useSettings.ts`), and the bare `:root` (before JS
   applies `data-theme`, and before a stored preference loads) is ALSO the dark
   "Nightstamp" palette (`tokens.css`) — see its comment. If you ever add new
   themed surfaces, verify them in dark first; light ("Postcard") is the
   secondary option here, the reverse of TrackerA.

## Access-code gate — soft by design, throttled (ported unmodified from TrackerA)
`src/lib/access.ts`'s Etsy product-code check (`isValidAccessCode`) is a plain
array comparison against a list baked into the client bundle at build time from
`VITE_ACCESS_CODES` — no backend to check it against, so it's a soft gate to keep
casual visitors on demo data and point genuine buyers at Connect, not real license
enforcement. `tryUnlock()` (same file) adds an honest, not bulletproof, speed
bump: an escalating lockout after wrong guesses through the real UI — attempts
1-5 free, attempt 6 a flat 30s, attempt 7+ an exponential wall in HOURS (1h, 2h,
4h, 8h, 16h…) capped at 24h — persisted to BOTH `localStorage` and IndexedDB's
`kv` store so a plain refresh, or clearing just one of the two, doesn't hand back
a free reset. `SettingsScreen.tsx`'s product-code form goes through `tryUnlock()`,
never `isValidAccessCode()` directly. **This does not, and architecturally
cannot, make the codes brute-force-proof from a static site** — the valid codes
still ship in plain text in the built JS, and any client-only lockout is
inherently clearable by clearing site data. If real license enforcement ever
matters more than it does today, that needs an actual backend endpoint, which is
a deliberate architecture change contradicting the static-hosting-only principle
above — don't reach for it without discussing the trade-off first.

## Owner preferences (learned — honor these)
- **No emojis in the UI.** Use icons only (lucide-react via `src/components/icons.tsx`).
- **Charts must be CSS/JS, not SVG and not a chart library.** Rings/donuts use CSS
  `conic-gradient`; bars/columns use flex divs. See `src/components/{ProgressRing,Charts}.tsx`.
  (recharts is in package.json but intentionally NOT imported — do not add it.)
- Icons should be a clean, simple standard set (lucide), not hand-drawn SVG paths.
- **Never use the native `window.confirm()`/`window.alert()`.** Use
  `confirmDialog({ title, message, confirmLabel?, danger? })` from
  `src/stores/useConfirm.ts` instead (`await`s a boolean, same call shape as
  `confirm()`) — it renders through the existing `BottomSheet` via `ConfirmHost`
  (mounted once in `App.tsx`). For non-blocking confirmations, use `useToast`
  (`src/stores/useToast.ts` + `<Toaster/>`) instead of `alert()`.
- **A genuinely destructive Danger Zone action gets `LockGatedButton`
  (`src/components/LockGatedButton.tsx`), not a plain danger button.** Two
  tap-to-unlock padlock latches flank the button; both must be opened before a
  tap does anything, and an early tap shakes the button + haptic-buzzes instead
  of silently doing nothing. Not real security, just deliberate friction. While
  still locked, each latch strobes red/blue via `setTimeout` with a randomized
  delay each tick (never a fixed CSS `@keyframes` loop, so it never settles into
  an exact repeating rhythm) — stops the instant that latch opens. It also has a
  low-opacity white radial-gradient "film" so the strobe reads as light
  diffusing through frosted glass. `LockGatedButton` still nests its OWN
  `confirmDialog()` call inside `onConfirm` for the single highest-stakes action
  ("Start over") — belt and suspenders, two latches AND a themed confirm.

## Tech stack (fixed — do not substitute)
- Vite + React 18 + TypeScript, SPA, hash router (no react-router), deploys as static files.
- Hand-written CSS with design tokens (`src/styles/tokens.css`). No Tailwind, no UI kit.
- **Zustand** for state (one store per domain). **date-fns** for dates (all date math
  goes through `src/lib/dates.ts`). **idb** for IndexedDB. **lucide-react** for icons.
- Google: raw REST + Google Identity Services (no gapi client).
- Vitest for the pure logic (recurrence, schema, reminders). 41 tests currently green.

## Architecture map
```
src/
  lib/
    types.ts        domain types: Task, Recurrence, Settings, Occurrence, Priority, Status
    schema.ts       SINGLE SOURCE OF TRUTH for Sheet tabs/columns + row (de)serializers
                     (Tasks, Recurring Tasks, Settings — only 2 real data tabs + Meta)
    dates.ts        ALL date math (plain ISO yyyy-mm-dd; no times except Calendar events)
    recurrence.ts   THE recurrence engine — lazy materialization (see below)
    db.ts           IndexedDB (tasks + recurrences object stores) + offline queue
    sync.ts         Sheets pull / push-all / debounced flush / connect — see "Google Sheet
                     as database" below; the FULL reauth/retry/token-cache machinery from
                     TrackerA is intact here, just trimmed to 2 sync tabs
    google/
      auth.ts       GIS token client (drive.file scope)
      sheets.ts     REST wrapper: create / batchGet / writeTab (clear+update)
      calendar.ts   all-day event create/update/delete + daily digest RRULE
    capture.ts      Calendar quick-capture: free text -> a Task on that date + category
    reminders.ts    decideReminderAction + syncTaskReminder + syncDailyDigest
    access.ts       Etsy access-code check + tryUnlock() brute-force lockout
    ui.ts           category colors, priority/status colors, formatters
    sample.ts       first-run sample data (tasks + recurrences, assigned across a small team)
    config.ts       DB_NAME/VERSION, APP_NAME, GITHUB_URL
  stores/           zustand: useTasks, useSettings, useSync, useConfirm, useToast, useInstall,
                    crud.ts (factory), bootstrap.ts (hydrate + seed + demo + reset)
  components/       ProgressRing, Charts, BottomSheet, Chip, Segmented, Checkbox,
                    TabBar, Sidebar, Header, LockGatedButton, CoachTour, icons.tsx
  features/         dashboard/, tasks/ (TasksScreen + TaskSheet + TaskInsights — the "Smart
                    Task Center" KPI/chart cluster), calendar/ (CalendarScreen + QuickCapture),
                    recurring/, settings/, more/, privacy/, whatsnew/
  nav.tsx           SINGLE nav config: Dashboard, Tasks, Calendar, Recurring (+ Settings)
  router.ts         tiny hash router (Route union: dashboard/tasks/calendar/recurring/
                    more/privacy/whatsnew/settings)
  App.tsx           shell: Sidebar (desktop) + Header + <main> + TabBar (mobile)
tests/              recurrence / schema / reminders
```

## The recurrence engine (most important module)
`src/lib/recurrence.ts` — **lazy materialization**:
- `Recurrences` are templates; occurrences are computed, never pre-stored.
- `expandOccurrences(rec, windowStart, windowEnd)` is a PURE function.
- An occurrence becomes a real `Tasks` row only when it needs identity (completed,
  edited, reminder toggled). Materialized rows override the computed ones at that date.
- Editing one occurrence = materialize + edit that row only. Editing the series edits
  the `Recurrences` row; already-materialized past rows are never changed retroactively.
- Rules: month-end clamps (31→28/30), Feb 29→Feb 28, DST-safe (plain dates).
- **Any change here MUST keep `tests/recurrence.test.ts` green.**
- **`rec.active === false` means "fully paused, generate nothing, ever."** Conflating
  that with "ended as of a date" destroys history — `deleteRecurrence(id, "future")`
  ("end future occurrences, keep past") must only set `endDate`, never also flip
  `active` false, or every past materialized-but-uncompleted occurrence vanishes too.

## The "Assigned to" / team feature (ported already-built from TrackerA)
`Task.assignee` and `Recurrence.assignee` are plain free-text strings (`""` = nobody)
already wired end-to-end — no accounts, no logins, no real multi-user backend, just
a label. `Settings.householdMembers: string[]` is the user-managed name list (Settings
→ "Team members" section) that feeds `TaskSheet`'s assignee chip picker as quick
suggestions; typing a name not in the list still works (it's a free-text field with
chips as shortcuts, not an enum). `TaskInsights.tsx`'s "PERSON IN CHARGE" chart and
`TasksScreen.tsx`'s assignee filter/sort both derive their options from whatever
actually appears in the data, not from `householdMembers` — so assignee filtering
works even before anyone's been added to the team list. Don't build real
authentication/permissions on top of this without discussing it first — it
contradicts the "no backend of ours" principle (see above); each Google account that
connects to a shared Sheet is trusting the others with edit access at the Sheet level,
not through anything this app enforces.

## Google Sheet as database
- `schema.ts` defines every tab + column order. Row 1 is an app-written header.
- Records keyed by `id` (col A, nanoid) — NEVER by row position. Tolerate extra
  user columns, reordered/blank rows.
- Tabs: **Tasks**, **Recurring Tasks**, and a hidden **Settings** key/value Meta tab
  (carries the access code across devices).
- Sync (`sync.ts`): pull = batchGet all tabs → replace IndexedDB + stores. Push is
  **per-tab dirty tracking**, not a blind full-tab rewrite: every store's `touch(collection)`
  call marks only that collection's tab dirty (`COLLECTION_TAB` map), and the debounced
  `pushDirty()` (2s after the last mutation) writes only the dirty tabs, clearing each off
  the dirty set only once its write actually succeeds. `pushAll()` (both tabs) is reserved
  for `connect()`'s first seed and the manual "Sync now" button. **Do not regress this to
  a blanket full-tab push on every touch** — TrackerA lost a real buyer's data this way
  when the write loop wasn't per-tab-isolated (see below) and one tab starved the rest.
- **`connect()`/`disconnect()` — the remembered spreadsheet ID (`lp.spreadsheetId`) must
  survive disconnect forever.** Never delete it in `disconnect()`; there's a SEPARATE
  opt-OUT flag (`lp.disconnected`, absence = connected) that disconnect sets and connect
  clears. Deleting the id outright caused a buyer's data to scatter across several
  spreadsheets from repeated disconnect/reconnect on TrackerA.
- **Any new "are we in state X" flag must default to the OLD behavior for users who
  existed before the flag did** — opt-out, not opt-in, unless you've checked what happens
  to someone already mid-flow when the flag ships.
- **Mark irreversible/critical local state changes SYNCHRONOUSLY, before any slow async
  step, not after.** `disconnectAndClearDevice()` calls `sync.markDisconnected()` (a
  synchronous, first-line operation) before any `await`, so a refresh mid-function still
  leaves the device correctly disconnected even if the trailing best-effort sync-then-wipe
  never finishes.
- **Google API errors need typed handling per status code, never a raw dumped message.**
  `sheets.ts`'s `ok()` throws `SheetNotFoundError` (404 — safe to fall through and create a
  new sheet) vs `SheetPermissionDeniedError` (403 — signed-in account has no access,
  almost always a wrong-account mix-up). A 403 must never be silently treated like a 404,
  and must never just be dumped as raw JSON — give the user an explicit choice instead
  (see `useSync.wrongAccount` + `useThisAccountInstead()` in `useSync.ts` and its rendering
  in `SettingsScreen.tsx`).
- The spreadsheet the app creates is always titled exactly `SPREADSHEET_TITLE`
  (`schema.ts`, currently `"Task Tracker"` — renamed from "Task Center" 2026-07-21, see
  `config.ts`'s `APP_NAME`) — keep this an EXACT match with the app's own brand name (page
  title/manifest/header). A mismatched title reads as wrong to a buyer.
- **NEVER let background/unattended code fall back to an interactive (popup) Google token
  request.** Every Sheets/Calendar call takes an explicit, no-default `allowInteractive:
  boolean` all the way down the chain (`authedFetch`, `writeTab`, `pushAll`, `pull`, etc.) —
  a background/debounced/timer/`online`-event call must always pass `false` and handle
  `ReauthRequiredError` (surface "tap to reconnect"), never assume it can safely pop a
  Google sign-in window with no user gesture behind it. TrackerA hit a real, confirmed case
  of a popup appearing "while the window is not used" from exactly this kind of default.
- **Nothing in the Sheets/auth chain may await unbounded.** `authedFetch`'s raw `fetch()`
  has an `AbortController` + `FETCH_TIMEOUT_MS` (20s); `requestToken()` in `auth.ts` has
  `SILENT_TOKEN_TIMEOUT_MS` (10s) / `INTERACTIVE_TOKEN_TIMEOUT_MS` (45s) — GIS's callback is
  NOT guaranteed to fire under strict third-party cookie/storage blocking. Any `await` on a
  browser API, third-party SDK callback, or network call without a guaranteed settle needs
  an explicit timeout, especially anything reachable from a background/debounced path.
- **A blocked browser popup is a real, confirmed production cause, not theoretical.** When
  `INTERACTIVE_TOKEN_TIMEOUT_MS` fires, the error message must name the likely cause: *"Google
  sign-in didn't open — your browser may have blocked the popup..."* — and must be surfaced
  where the user will see it (`useSync.tapToRetry()`'s toast), not just logged.
- **Reauth must be checked PROACTIVELY, between edits, not only reactively at save time.**
  `keepTokenWarm()` (`sync.ts`) silently tops up the Sheets token whenever it has under
  `TOKEN_REFRESH_MARGIN_MS` (10 min) of life left, called on an interval AND on
  `visibilitychange` (browsers throttle timers in a backgrounded tab, so the interval alone
  can silently fire far less often than scheduled) — so a needed reconnect surfaces calmly
  between actions instead of ambushing an in-progress save.
- **An in-memory-only token cache gets silently wiped by reloads more often than expected**
  (a service-worker auto-update reload, a manual refresh). `auth.ts` mirrors the token cache
  into `sessionStorage` (`persistToken`/`getCached`/`forgetPersistedToken`) so a reload
  revives a still-valid token instead of discarding it and forcing a fresh sign-in from zero.
- **A reconnect/resync path that can overwrite local state with remote state must push
  local's pending changes first.** `connect()`'s reconnect-to-an-existing-sheet branch does
  `await pushAll(true)` BEFORE `await pull()` — `pull()` unconditionally replaces IndexedDB
  with the Sheet's content, and if this device kept working through a stretch where the
  connection needed reauth, the Sheet is the STALE side. `relink()` is the one legitimate
  exception (a genuinely new device with nothing local to lose) — don't add a push there.
- **A write loop over N independent tabs must isolate each tab's failure from the others.**
  `writeAllTabs()` wraps each tab in its own try/catch; a non-auth failure on one tab is
  remembered and re-thrown only after every OTHER tab has been attempted, so a broken tab
  can't starve tabs behind it. A `ReauthRequiredError` on any tab still aborts the whole pass
  immediately (the same token backs every call, so if one is dead they all are).
- **Two independent push functions touching the same tab must share ONE serialization
  point**, not each get their own "in flight" guard. `serialized()` (a promise-chain mutex in
  `sync.ts`) wraps both `pushAll` and `pushDirty` — a boolean guard checked inside one
  function does nothing for a sibling function doing the same underlying work.
- **`relink()` must leave demo mode before pulling**, same as `connect()` — `pull()`'s writes
  to IndexedDB are gated off while demo mode is on, so a brand-new device (which defaults to
  demo mode ON) would show real pulled data for one session only, then lose it on reload
  while still saying "Connected."
- **`tabValues()` reads straight from IndexedDB (`db.all(collection)`), never from the
  in-memory Zustand store** — IndexedDB is genuinely shared across every tab/window on the
  same origin; in-memory state is per-tab and silently stale the moment a second tab/window
  of the app is open on the same device.
- **The debounced background push resumed on boot must wait for store hydration.**
  `resumePendingPush()` (`useSync.ts`) is called as the LAST line of `bootstrap.ts`'s
  `runBootstrap()`, after every store's `setAll()` has actually run — never at module-eval
  time, which happens before ANY `useEffect`/async hydration, no matter how "early" it looks.
- **A "temporarily show fake data" flag (Coach Tour) and "don't push what's in the stores
  right now" are different concerns.** `suspendSync()`/`resumeSync()` in `sync.ts` is a
  separate, purely in-memory flag from `isDemo()` — `CoachTour.tsx` calls it at every point
  it swaps in sample data for a real user, so a debounced push mid-tour can't clear+overwrite
  a real, connected Sheet with sample rows.

## Known bug patterns — watch for these (still-relevant subset, ported from TrackerA's QA pass)
- **A shared animation component that hardcodes "animate FROM 0" instead of "from whatever is
  currently displayed" is silently wrong on every update after the first mount.**
  `CountUp.tsx`/`ProgressRing.tsx` track the currently-displayed value in a `ref` and animate
  FROM that ref's value TO the new target, only ever seeding the ref with a literal `0` on
  initial mount.
- **An "Add X" `BottomSheet` form must reset its fields on the transition to `open`, not just
  at first mount**, or it silently carries last-typed values into the next time it's reopened.
  `TaskSheet.tsx` follows this pattern already — check it again if you touch its form state.
- **`x || fallback` is only safe when `0` is never a legitimate value for `x`.** For any
  numeric input where 0 is a real answer, check the raw input STRING for blank, never the
  parsed number for falsiness.
- **When two different pieces of UI derive from the same underlying state, check they agree
  on which state takes priority when more than one condition can be true simultaneously** —
  written at different times, they can silently disagree.
- **"The current date/time" is an implicit, easy-to-forget dependency of any memoized
  calculation that's supposed to change at midnight.** `useDueToday.ts` keeps "today" as
  reactive state, refreshed on `visibilitychange`, and included in its memo's deps — without
  that, a tab left open overnight shows a stale "due today" count.
- **A helper that adds a duration to a time-of-day string and returns just another
  time-of-day string silently drops date-rollover information.** The daily-digest RRULE
  logic (`calendar.ts`) detects a midnight wrap (comparing zero-padded `HH:mm` strings
  lexicographically) and advances the end date by one day when the configured digest time
  falls in the last ~15 minutes of the day — otherwise Google's API silently rejects an
  invalid (`end` before `start`) event.
- **Never trust a raw substring check against `navigator.userAgent` for a platform known to
  disguise itself as a different one by default.** `useInstall.ts`'s `detectPlatform()` also
  checks `navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1` — the standard
  heuristic for "this is actually an iPad," since iPadOS 13+ Safari's default UA reports as
  desktop macOS Safari.
- **Every open `BottomSheet` must be stack-aware for global-scope side effects** (a
  `document`-level Escape listener, a `document.body` scroll-lock) — a component that can
  legitimately nest inside another instance of itself (a confirm dialog opened on top of an
  edit sheet) needs a module-level stack so only the topmost sheet's Escape handler acts and
  body scroll only unlocks once the stack is fully empty.

## Data flow for a mutation
store action → update in-memory state → `db.put(...)` (IndexedDB) → `useSync.touch(collection)`
→ if connected, debounced `pushDirty()` pushes just that tab to Sheets; else flash "Saved".

## Conventions
- Match the surrounding code's style. New screens: `features/<name>/<Name>Screen.tsx`,
  add the `Route` to `router.ts`, an entry to `nav.tsx`, and a case in `App.tsx`.
- New persisted collection: add to `types.ts`, `schema.ts` (headers + serializers),
  `db.ts` (object store + `ALL_COLLECTIONS`, bump `DB_VERSION`), a store, `bootstrap.ts`
  (load + seed), and `sync.ts` (`SYNC_TABS`/`COLLECTION_TAB`/`tabValues`/`pull`).
- Icons: import from `components/icons.tsx`. Pickable icons live in `NAMED_ICONS`.
- Category colors via `categoryColor()` (`lib/ui.ts`).
- **Any "take the user to the thing they just did X to" action must carry that thing's id,
  not just a screen name.** Pass `{ id }` (and `{ date }` when date-based) via
  `navigate(route, query)`, then have the target screen check `routeQuery().get("id")` in a
  mount-only `useEffect` and open that exact item's editor.
- **Never use the native `window.confirm()`/`window.alert()`** — see "Owner preferences" above.
- **`.btn--stack` (`base.css`) is `margin-bottom: 10px` — put it on the button ABOVE the gap
  you want, never on the button below.**

## Commands
```
npm install
npm run dev        # dev server on port 5516 (fixed — see vite.config.ts)
npm test           # vitest — keep green before finishing a phase
npm run build      # static output in dist/; gzip budget ≤ 250KB (currently ~100KB)
npx tsc --noEmit   # typecheck (must be clean)
```

## Quality gates before calling a phase done
1. `npm test` green (recurrence, schema, reminders). 2. `tsc --noEmit` clean.
3. `npm run build` succeeds, initial JS ≤ 250KB gz. 4. No emojis in UI, no SVG/library charts.

## Status / roadmap
See `TODO.md`. Google Sheets sync code is complete and battle-tested (inherited from
TrackerA) but **this specific repo is not connected yet** — no `.env`/OAuth client ID has
been set up for TrackerE specifically. Connecting is the top-priority open task; see
"THE DATABASE IS THE USER'S GOOGLE SHEET" above.
