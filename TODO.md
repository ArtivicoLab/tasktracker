# TODO — Task Tracker

Running status board for AI agents / humans. Keep this current.
Last updated: 2026-07-20.

## ✅ Done
- Forked from TrackerA (Life Planner) and trimmed to a single-purpose task/recurring-task
  tracker — Habits, Budget, Savings, Debt Payoff, Goals, Meal Planner/Setup, Grocery,
  Fitness, Weight, Hydration, and Time Blocking were **deleted**, not hidden.
- Rebranded: "Task Center" (renamed again to "Task Tracker" 2026-07-21 — see `APP_NAME`
  in `config.ts`). Theme defaulted to dark at first, briefly — reverted to light-default
  the same week (matches TrackerA/B/C/D; user explicitly rejected a dark default), so the
  bare `:root` fallback in `tokens.css` is the LIGHT "Sticker Paper" palette, not dark. Port 5516,
  `taskcenter` IndexedDB name, `DB_VERSION` reset to 1.
- `schema.ts`/`db.ts`/`sync.ts` trimmed to just Tasks + Recurring Tasks (+ hidden Settings
  Meta tab) — the full reauth/retry/token-cache sync machinery from TrackerA is intact,
  just pointed at 2 tabs instead of 16.
- Dashboard trimmed to task-only content: Today card, stat chips (Overdue/Due today/
  Upcoming/Completion), Task status card. No habit/budget/goal/fitness cards.
- Tasks screen ("Smart Task Center") already matched the reference product almost exactly
  pre-fork: KPI strip, alerts, status/category/priority donuts, priority-by-category bars,
  task activity timeline, and a "Person in charge" chart — all CSS/JS, no chart library.
- "Assigned to" on Task/Recurrence was already built in TrackerA — kept as-is, plus a new
  Settings "Team members" section (renamed from "Household members") feeding the assignee
  chip picker.
- Calendar simplified to task-only (dropped the Bills/Goals/Fitness/Time-block source
  layers and their filter row) — month/week/day views, category/assignee/priority/status
  filters, quick-capture.
- `capture.ts`/`QuickCapture.tsx` simplified: since only Tasks exist now, dropped the
  multi-domain keyword/prefix guesser (habit/goal/fund/debt/meal/grocery/workout/weight/
  hydration/money) entirely — quick-capture is now just "type a task, optionally pick a
  category."
- Coach tour trimmed to Dashboard/Tasks/Calendar/Recurring/Settings steps only.
- Settings: dropped currency field, the multi-module "Reuse year after year" checklist
  (replaced with a single "Clear task history" button — `clearTaskHistory()` in
  `bootstrap.ts`, keeps recurring templates/categories/team members).
- Public legal/marketing pages (`public/{home,privacy,terms,404}.html`) rebranded; the
  fabricated Etsy listing link was removed rather than guessed (no real TrackerE listing
  exists yet).
- `npx tsc --noEmit` clean, `npm test` green (41 tests: recurrence, schema, reminders),
  `npm run build` succeeds (~100KB gz, well under the 250KB budget).
- Smoke-tested in a real headless browser (Playwright): dark theme confirmed as default,
  no console errors, Dashboard/Tasks/Calendar/Recurring/Settings all render correctly,
  "Team members" text confirmed present (not "Household members"), Assigned To field
  confirmed in the task sheet.

## 🔧 Needs the owner (not a code task)
- **Google OAuth client ID.** This repo has no `.env` — needs its OWN Web client ID (a
  TrackerA client's Authorized JavaScript origins won't include this app's port/domain).
  See README's "Connect Google Sheets" section.
- **Real `VITE_ACCESS_CODES`** before selling on Etsy (currently unset — Connect stays
  gated behind "Setup needed" either way until the client ID above is set too).
- **App icon artwork.** The PWA icons (`public/*.png`, `public/logo-512.png`) are still
  copied byte-for-byte from TrackerA — same favicon, same apple-touch-icons. Needs real
  Task Tracker branding art before this ships anywhere public.
- **GitHub repo + Pages domain.** `GITHUB_URL` in `config.ts` and the CTA links in
  `public/home.html`/`privacy.html`/`terms.html` follow the same
  `https://github.com/ArtivicoLab/taskcenter` / `https://taskcenter.artivicolab.com`
  naming convention as TrackerB/C/D, but neither actually exists yet — `CNAME` is
  intentionally left blank until the owner decides on a real domain.
- **Publish/verify the OAuth consent screen** to sell to the public (not just test users)
  once a client ID exists — same one-time Google review as every sibling tracker.

## 🔜 Next / backlog (prioritized)
1. Wire up the real Google OAuth client + access codes (owner-blocked, see above).
2. ~~Design pass~~ — done 2026-07-20/21: a full "Sticker Club" identity replaced TrackerA's
   Postcard/Nightstamp palette entirely (own candy hues WCAG-solved per theme, Titan One +
   Baloo 2 fonts, outline/pop-shadow/tilt sticker mechanics, a mascot). See CLAUDE.md.
3. ~~Avatar/initial-badge treatment for "Assigned to"~~ — done: `stringColor()`/`initials()`
   (`lib/ui.ts`) + `.avatar` classes render small colored initials circles next to names.
4. Playwright smoke test checked into the repo (this session verified manually via a
   scratch script, not committed) — worth turning into a real `tests/`-adjacent e2e check
   if this app gets actively maintained.

## ⚠️ Gotchas / notes
- `recharts` is in package.json but MUST NOT be imported (owner wants CSS/JS charts) —
  same rule as every sibling tracker.
- Charts must not use SVG. Rings/donuts = conic-gradient.
- Push is per-tab dirty-tracked (not full-tab-per-edit) — see CLAUDE.md's sync section
  before touching `sync.ts`.
- `DB_VERSION` is 1 (fresh schema, no migration history yet). Adding a collection = bump
  it + add the object store in `db.ts` upgrade().
- Dashboard-first: always check the ≥900px sidebar layout, not just 390px.
- Dev server runs on **5516** for this project (fixed in `vite.config.ts`, matches the
  OAuth client's Authorized JavaScript origin once one exists).
