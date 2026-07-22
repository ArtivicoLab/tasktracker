import { useEffect, useState } from "react";
import { Segmented } from "../../components/Segmented";
import { BottomSheet } from "../../components/BottomSheet";
import { HelpTip } from "../../components/HelpTip";
import { IconClose } from "../../components/icons";
import { LockGatedButton } from "../../components/LockGatedButton";
import { useSettings } from "../../stores/useSettings";
import { useTasks } from "../../stores/useTasks";
import { useSync } from "../../stores/useSync";
import { confirmDialog } from "../../stores/useConfirm";
import { activate, clearTaskHistory, disconnectAndClearDevice, resetEverything, setDemoMode } from "../../stores/bootstrap";
import { currentLockoutMs, tryUnlock } from "../../lib/access";
import { isDemo } from "../../lib/demo";
import { spreadsheetUrl } from "../../lib/google/sheets";
import { navigate } from "../../router";
import { ALL_NAV_ITEMS, HIDEABLE_NAV_ITEMS } from "../../nav";
import { APP_NAME, APP_VERSION, BUILD_SHA } from "../../lib/config";
import { categoryColor, PICKABLE_CATEGORY_COLORS } from "../../lib/ui";

function formatWait(ms: number): string {
  const s = Math.ceil(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.ceil(s / 60);
  if (m < 60) return `${m} minute${m === 1 ? "" : "s"}`;
  const h = Math.ceil(m / 60);
  return `${h} hour${h === 1 ? "" : "s"}`;
}

export function SettingsScreen() {
  const {
    name, theme, weekStart, digestTime, hiddenRoutes, householdMembers, categories,
    categoryColors, tabBarRoutes, activated, accessCode, update,
  } = useSettings();
  const { connected, spreadsheetId, previousSpreadsheetId, hasClientId, busy, error, wrongAccount, connect, relink, syncNow, useThisAccountInstead, startNewSheet } =
    useSync();
  const [newMember, setNewMember] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [colorPickerFor, setColorPickerFor] = useState<string | null>(null);
  const [codeInput, setCodeInput] = useState("");
  const [codeError, setCodeError] = useState("");
  const [relinkOpen, setRelinkOpen] = useState(false);
  const [relinkInput, setRelinkInput] = useState("");
  const [relinkError, setRelinkError] = useState("");
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [demoOn, setDemoOn] = useState(isDemo());
  const [clearingDevice, setClearingDevice] = useState(false);
  const [clearError, setClearError] = useState("");
  const [startingNewSheet, setStartingNewSheet] = useState(false);
  const [newSheetError, setNewSheetError] = useState("");

  useEffect(() => {
    if (activated) return;
    void currentLockoutMs().then((ms) => {
      if (ms > 0) setCodeError(`Too many attempts. Try again in ${formatWait(ms)}.`);
    });
    // Only needs to check once, on mount — activated flips this section away.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleDisconnect() {
    const ok = await confirmDialog({
      title: "Disconnect & clear this device?",
      message:
        "We'll sync any last changes to your Google Sheet first, then remove your planner data from this device only — your Sheet keeps everything.",
      confirmLabel: "Disconnect & clear",
      danger: true,
    });
    if (!ok) return;
    setClearError("");
    setClearingDevice(true);
    const result = await disconnectAndClearDevice();
    setClearingDevice(false);
    if (!result.ok) setClearError(`Couldn't finish syncing, so nothing was cleared: ${result.reason}`);
  }

  async function handleStartNewSheet() {
    const ok = await confirmDialog({
      title: "Start a brand new sheet?",
      message:
        "This links a fresh, empty Google Sheet and pushes everything currently on this device into it. Your old sheet isn't deleted, it stays in your Drive exactly as it is, just no longer linked here.",
      confirmLabel: "Start new sheet",
      danger: true,
    });
    if (!ok) return;
    setNewSheetError("");
    setStartingNewSheet(true);
    try {
      await startNewSheet();
    } finally {
      setStartingNewSheet(false);
    }
    if (useSync.getState().error) setNewSheetError(useSync.getState().error);
  }

  async function toggleDemo(on: boolean) {
    setDemoOn(on);
    await setDemoMode(on);
    navigate("dashboard"); // let them see the app switch to demo / their real data
  }

  async function checkForUpdates() {
    setCheckingUpdate(true);
    try {
      const reg = await navigator.serviceWorker?.getRegistration();
      await reg?.update();
    } finally {
      // Reload either way: a fresh network fetch of index.html + a re-checked
      // sw.js is the only way to be sure you're not still on a stale cache —
      // if a new worker was found, main.tsx's controllerchange listener takes
      // over from here anyway.
      window.location.reload();
    }
  }

  function submitCode() {
    const code = codeInput.trim();
    if (!code) return;
    setCodeError("");
    void tryUnlock(code).then(async (result) => {
      if (!result.ok) {
        setCodeError(
          result.retryAfterMs
            ? `Too many attempts. Try again in ${formatWait(result.retryAfterMs)}.`
            : "That code doesn't look right. Check your Etsy order confirmation."
        );
        return;
      }
      const ok = await activate(code);
      if (ok) { setCodeError(""); setCodeInput(""); }
      else setCodeError("That code doesn't look right. Check your Etsy order confirmation.");
    });
  }

  async function submitRelink() {
    setRelinkError("");
    const ok = await relink(relinkInput.trim());
    if (ok) { setRelinkOpen(false); setRelinkInput(""); }
    else setRelinkError(error || "Couldn't link that sheet. Check the link and try again.");
  }

  function addCategory() {
    const c = newCategory.trim();
    if (!c || categories.includes(c)) return;
    update({ categories: [...categories, c] });
    setNewCategory("");
  }

  // Renaming/removing a category must cascade to every Task/Recurrence that
  // references it by name — otherwise they're left pointing at a category
  // that no longer exists in the list: unpickable, unfilterable, and (since
  // categoryColor() hashes unknown names into the same pool as real custom
  // categories) liable to visually collide with something else entirely.
  function reassignTaskCategory(from: string, to: string) {
    const { tasks: allTasks, recurrences: allRecurrences, updateTask, updateRecurrence } = useTasks.getState();
    for (const t of allTasks) if (t.category === from) updateTask(t.id, { category: to });
    for (const r of allRecurrences) if (r.category === from) updateRecurrence(r.id, { category: to });
  }

  function removeCategory(c: string) {
    const remaining = categories.filter((x) => x !== c);
    const fallback = remaining[0] ?? "Other";
    reassignTaskCategory(c, fallback);
    const { [c]: _removed, ...restColors } = categoryColors;
    update({ categories: remaining.length ? remaining : [fallback], categoryColors: restColors });
  }

  function renameCategory(oldName: string, next: string) {
    const n = next.trim();
    if (!n || n === oldName || categories.includes(n)) return;
    reassignTaskCategory(oldName, n);
    const { [oldName]: movedColor, ...restColors } = categoryColors;
    update({
      categories: categories.map((c) => (c === oldName ? n : c)),
      categoryColors: movedColor ? { ...restColors, [n]: movedColor } : restColors,
    });
  }

  function setCategoryColor(name: string, color: string) {
    update({ categoryColors: { ...categoryColors, [name]: color } });
  }

  async function runClearHistory() {
    const ok = await confirmDialog({
      title: "Clear task history?",
      message: "Removes one-time tasks and past occurrences. Your recurring templates, categories, and team members all stay exactly as they are.",
      confirmLabel: "Clear history",
      danger: true,
    });
    if (ok) void clearTaskHistory();
  }

  function toggleRoute(route: string) {
    update({
      hiddenRoutes: hiddenRoutes.includes(route)
        ? hiddenRoutes.filter((r) => r !== route)
        : [...hiddenRoutes, route],
    });
  }

  function addTab(route: string) {
    if (tabBarRoutes.includes(route)) return;
    update({ tabBarRoutes: [...tabBarRoutes, route] });
  }

  function removeTab(route: string) {
    update({ tabBarRoutes: tabBarRoutes.filter((r) => r !== route) });
  }

  function addMember() {
    const n = newMember.trim();
    if (!n || householdMembers.includes(n)) return;
    update({ householdMembers: [...householdMembers, n] });
    setNewMember("");
  }

  function removeMember(n: string) {
    update({ householdMembers: householdMembers.filter((m) => m !== n) });
  }

  return (
    <>
      <div className="screen-head">
        <div className="screen-head__eyebrow">Make it yours</div>
        <h1 className="screen-head__title">
          Settings
          <HelpTip text="Personalize the app: your name, currency, theme, week start, and connect your Google Sheet so your data has a real backup." />
        </h1>
      </div>

      <div className="section-title">
        Demo mode
        <HelpTip text="Fills the whole app with a full year of realistic sample data so you can try everything before buying. It's display-only, and nothing here is saved to your device or your Google Sheet. Turn it off to use your own planner; connecting Google Sheets turns it off automatically." />
      </div>
      <div className="card">
        <label className="field__label">Sample data</label>
        <Segmented
          options={[
            { value: "on", label: "Demo on" },
            { value: "off", label: "My data" },
          ]}
          value={demoOn ? "on" : "off"}
          onChange={(v) => { void toggleDemo(v === "on"); }}
        />
        <p className="muted settings-hint" style={{ marginTop: 8 }}>
          {demoOn
            ? "Showing sample data. Nothing you change here is saved."
            : "Showing your own planner."}
        </p>
      </div>

      <div className="section-title">Google Sheets</div>
      <div className="card" data-tour="settings-sheets">
        {connected ? (
          <>
            <div className="spread settings-connected-row">
              <div>
                <div className="settings-connected-label">
                  <span className="dot-8 dot-8--success" />
                  Connected
                </div>
                <div className="muted fs-13">
                  Your data lives in your own Google Drive.
                </div>
                {accessCode && (
                  <div className="muted fs-13">Unlocked with code {accessCode}</div>
                )}
              </div>
            </div>
            <a
              className="btn btn--stack"
              href={spreadsheetUrl(spreadsheetId)}
              target="_blank"
              rel="noreferrer"
            >
              Open my sheet ↗
            </a>
            <button className="btn btn--primary btn--stack" disabled={busy} onClick={() => syncNow()}>
              {busy ? "Syncing…" : "Sync now"}
            </button>
            <button className="btn btn--ghost" disabled={clearingDevice} onClick={handleDisconnect}>
              {clearingDevice ? "Syncing & clearing…" : "Disconnect & clear this device"}
            </button>
          </>
        ) : (
          <>
            <div className="settings-card-title">Back up to Google Sheets</div>
            <p className="muted settings-hint">
              Sync your planner to a spreadsheet in your own Google Drive: open it on any
              device and keep your data forever.
            </p>

            {!activated && (
              <div className="field" style={{ marginBottom: 12 }}>
                <label className="field__label" htmlFor="settings-product-code">Product code</label>
                <div className="spread spread--gap8">
                  <input
                    id="settings-product-code"
                    className="input input--shrink"
                    value={codeInput}
                    placeholder="From your Etsy order"
                    onChange={(e) => { setCodeInput(e.target.value); setCodeError(""); }}
                    onKeyDown={(e) => e.key === "Enter" && submitCode()}
                  />
                  <button className="btn btn--auto" onClick={submitCode} disabled={!codeInput.trim()}>
                    Unlock
                  </button>
                </div>
                {codeError && <p className="neg settings-error">{codeError}</p>}
              </div>
            )}

            {hasClientId ? (
              <button
                className="btn btn--primary"
                disabled={busy || !activated}
                onClick={() => connect()}
                title={!activated ? "Enter your product code above to enable" : undefined}
              >
                {busy ? "Connecting…" : "Connect Google Sheets"}
              </button>
            ) : (
              <div className="card settings-setup-note">
                <b>Setup needed.</b> Add your Google OAuth client ID to a <code>.env</code> file
                (<code>VITE_GOOGLE_CLIENT_ID=…</code>) and restart. See the README for the free
                5-minute Google Cloud setup.
              </div>
            )}
            {!activated && (
              <p className="muted settings-hint--sm">
                Enter your product code above to enable Connect, or if you've already set up
                the planner on another device, link that sheet below instead. No code needed.
              </p>
            )}

            <button className="btn btn--ghost" style={{ marginTop: 10 }} onClick={() => setRelinkOpen(true)}>
              Link a sheet from another device (skip the code)
            </button>
          </>
        )}
        {wrongAccount ? (
          <div className="card settings-setup-note" style={{ marginTop: 10 }}>
            <b>Wrong Google account.</b> The Google account you just signed in with
            doesn't have access to the sheet this device is already linked to — most
            likely your Task Tracker data lives under a different Google account
            (check your Drive for a "Task Tracker" spreadsheet to see which one).
            <div className="spread spread--gap8" style={{ marginTop: 10 }}>
              <button className="btn btn--auto" disabled={busy} onClick={() => connect()}>
                {busy ? "Trying…" : "Try signing in again"}
              </button>
              <button
                className="btn btn--ghost btn--auto"
                disabled={busy}
                onClick={() => useThisAccountInstead()}
              >
                Use this account, start a new sheet
              </button>
            </div>
          </div>
        ) : (
          error && (
            <p className="neg settings-error">
              {error}
            </p>
          )
        )}
        {clearError && <p className="neg settings-error">{clearError}</p>}
        {previousSpreadsheetId && (
          <p className="muted settings-hint--sm" style={{ marginTop: 10 }}>
            Previously connected sheet still has everything on it —{" "}
            <a href={spreadsheetUrl(previousSpreadsheetId)} target="_blank" rel="noreferrer">
              open it to copy anything over ↗
            </a>
          </p>
        )}
      </div>

      <div className="section-title">Appearance</div>
      <div className="card">
        <label className="field__label">Theme</label>
        <Segmented
          options={[
            { value: "auto", label: "Auto" },
            { value: "light", label: "Morning" },
            { value: "dark", label: "Midnight" },
          ]}
          value={theme}
          onChange={(v) => update({ theme: v as typeof theme })}
        />
      </div>

      <div className="section-title">Preferences</div>
      <div className="card">
        <div className="field">
          <label className="field__label" htmlFor="settings-name">Your name</label>
          <input
            id="settings-name"
            className="input settings-name-input"
            value={name}
            maxLength={24}
            placeholder="What should we call you?"
            onChange={(e) => update({ name: e.target.value })}
          />
        </div>
        <div className="field">
          <label className="field__label">Week starts on</label>
          <Segmented
            options={[
              { value: "0", label: "Sunday" },
              { value: "1", label: "Monday" },
            ]}
            value={String(weekStart)}
            onChange={(v) => update({ weekStart: Number(v) as 0 | 1 })}
          />
        </div>
        <div className="field field--flush">
          <label className="field__label" htmlFor="settings-digest-time">Daily digest reminder</label>
          <input
            id="settings-digest-time"
            type="time"
            className="input settings-time-input"
            value={digestTime}
            onChange={(e) => update({ digestTime: e.target.value })}
          />
          <p className="muted settings-hint--sm">
            {digestTime
              ? connected
                ? `One gentle nudge at ${digestTime}.`
                : `One gentle nudge at ${digestTime} once Google Sheets is connected.`
              : "Off. Set a time to enable."}
          </p>
        </div>
      </div>

      <div className="section-title">
        Team members
        <HelpTip text="Add everyone on your team once. Their names then show as quick-pick 'Assigned to' chips on every task, so you never get 'Alex' and 'alex' as two different people. No accounts or logins needed — just labels." />
      </div>
      <div className="card" data-tour="settings-team">
        {householdMembers.length > 0 && (
          <div className="chip-wrap">
            {householdMembers.map((m) => (
              <span key={m} className="chip chip--removable">
                {m}
                <button aria-label={`Remove ${m}`} onClick={() => removeMember(m)} className="chip__remove">
                  <IconClose size={12} />
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="spread spread--gap8">
          <input
            className="input input--shrink"
            value={newMember}
            placeholder="Add a person"
            aria-label="Add a household member"
            onChange={(e) => setNewMember(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addMember()}
          />
          <button className="btn btn--auto" onClick={addMember} disabled={!newMember.trim()}>
            Add
          </button>
        </div>
      </div>

      <div className="section-title">
        Color tags
        <HelpTip text="Add, rename, or remove the color tags tasks and routines can be filed under (this is just for coloring/filtering your to-do list; it has nothing to do with the Finances section). Tap a tag's name to rename it, or tap its dot to change its color." />
      </div>
      <div className="card" data-tour="settings-categories">
        <p className="muted settings-hint">
          Just a color and label to organize your to-do list, like a sticky-note
          color, not a section of the app. Unrelated to "Finances" below.
        </p>
        {categories.length > 0 && (
          <div className="chip-wrap">
            {categories.map((c) => (
              <CategoryChip
                key={c}
                name={c}
                color={categoryColor(c)}
                onRename={(next) => renameCategory(c, next)}
                onRemove={() => removeCategory(c)}
                onPickColor={() => setColorPickerFor(c)}
              />
            ))}
          </div>
        )}
        <div className="spread spread--gap8">
          <input
            className="input input--shrink"
            value={newCategory}
            placeholder="Add a color tag"
            aria-label="Add a color tag"
            onChange={(e) => setNewCategory(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addCategory()}
          />
          <button className="btn btn--auto" onClick={addCategory} disabled={!newCategory.trim()}>
            Add
          </button>
        </div>
      </div>

      <div className="section-title">
        Customize sections
        <HelpTip text="Hide modules you don't use to declutter the sidebar and More menu. Hidden sections keep their data and stay reachable; this only affects navigation." />
      </div>
      <div className="card card--tight" data-tour="settings-sections">
        {HIDEABLE_NAV_ITEMS.map(({ route, label, Icon, color }) => {
          const hidden = hiddenRoutes.includes(route);
          return (
            <label key={route} className="row spread row--clickable">
              <span className="settings-navrow-label" style={{ opacity: hidden ? 0.5 : 1 }}>
                <span className="hub-card__ico hub-card__ico--sm" style={{ background: color }}>
                  <Icon size={15} />
                </span>
                {label}
              </span>
              <input
                type="checkbox"
                checked={!hidden}
                onChange={() => toggleRoute(route)}
                aria-label={`Show ${label}`}
                className="settings-checkbox"
              />
            </label>
          );
        })}
      </div>

      <div className="section-title">
        Bottom bar (phone)
        <HelpTip text="Choose which shortcuts show on the bottom bar: the row of icons along the bottom of the screen. You only see this bar on your phone, or when your browser window is narrow. On a wider screen the left sidebar shows everything instead, so this section changes nothing there. Add as many as you like and the bar scrolls sideways to fit them. More always stays put as the way to reach everything else. To reorder, press and hold an icon on the bar until it jiggles, then drag." />
      </div>
      <p className="muted settings-hint">
        You only see this bar on your phone, or when your browser window is
        narrow. On a wider screen the left sidebar shows everything instead, so
        this section changes nothing there.
      </p>
      <div className="card card--tight">
        {tabBarRoutes.length === 0 && (
          <p className="muted settings-list-empty">
            No tabs added yet. The bottom bar will show only More.
          </p>
        )}
        {tabBarRoutes.map((route) => {
          const item = ALL_NAV_ITEMS.find((n) => n.route === route);
          if (!item) return null;
          return (
            <div key={route} className="row row--pad8">
              <span className="hub-card__ico hub-card__ico--sm flex-none" style={{ background: item.color }}>
                <item.Icon size={15} />
              </span>
              <div className="row__body"><div className="row__title row__title--sm">{item.label}</div></div>
              <button className="muted" aria-label={`Unpin ${item.label}`} onClick={() => removeTab(route)}>
                <IconClose size={16} />
              </button>
            </div>
          );
        })}
        {tabBarRoutes.length > 0 && (
          <p className="muted settings-pin-note">
            Tip: press and hold any icon on the bottom bar to drag it into a new order.
          </p>
        )}
      </div>
      {ALL_NAV_ITEMS.some((i) => !tabBarRoutes.includes(i.route)) && (
        <div className="card card--tight">
          <div className="muted settings-section-label">
            TAP TO ADD TO THE BOTTOM BAR
            <HelpTip text="Tap any of these to add it as a shortcut on the phone bottom bar. Add as many as you want and the bar scrolls sideways to fit." />
          </div>
          <div className="settings-chip-wrap">
            {ALL_NAV_ITEMS.filter((i) => !tabBarRoutes.includes(i.route)).map((item) => (
              <button key={item.route} className="chip" onClick={() => addTab(item.route)}>
                <item.Icon size={13} />
                {item.label}
              </button>
            ))}
          </div>
        </div>
      )}


      <div className="section-title">
        Reuse year after year
        <HelpTip text="Starting fresh? Clear out one-time task history and start clean, no duplicating the whole planner. Your recurring templates, categories, team members, and settings all stay exactly as they are." />
      </div>
      <div className="card" data-tour="settings-yearreset">
        <p className="muted settings-hint">
          Removes one-time tasks and past occurrences. Nothing is deleted until you confirm.
        </p>
        <button className="btn btn--primary" onClick={runClearHistory}>
          Clear task history
        </button>
      </div>

      <div className="section-title">Help &amp; contact</div>
      <div className="card">
        <p className="muted settings-hint">
          Questions, ideas, or something not working? We'd love to hear from you.
        </p>
        <a
          className="btn btn--primary"
          href="mailto:artivicolab@gmail.com?subject=Task%20Center"
        >
          Contact us
        </a>
      </div>

      <div className="section-title section-title--alert">Danger zone</div>
      <div className="card" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {connected && (
          <div data-tour="settings-newsheet">
            <div className="settings-card-title">Start a new sheet</div>
            <p className="muted settings-hint">
              Link a brand new, empty Google Sheet instead of this one. Your current sheet
              isn't deleted, it stays in your Drive untouched, just unlinked from the app.
            </p>
            <LockGatedButton
              label="Start a new sheet"
              busyLabel="Starting…"
              busy={startingNewSheet}
              onConfirm={handleStartNewSheet}
            />
            {newSheetError && <p className="neg settings-error">{newSheetError}</p>}
          </div>
        )}
        <div>
          <div className="settings-card-title">Start over</div>
          <p className="muted settings-hint">
            Delete all planner data on this device. This cannot be undone.
          </p>
          <LockGatedButton
            label="Start over (erase everything)"
            onConfirm={async () => {
              const ok = await confirmDialog({
                title: "Erase everything?",
                message: "Delete all planner data on this device. This cannot be undone.",
                confirmLabel: "Erase everything",
                danger: true,
              });
              if (ok) void resetEverything();
            }}
          />
        </div>
      </div>

      <div className="settings-footer">
        <div className="spread spread--gap8" style={{ justifyContent: "center" }}>
          <button className="hero__name settings-footer__link" onClick={() => navigate("privacy")}>
            Privacy
          </button>
          <button className="hero__name settings-footer__link" onClick={() => navigate("whatsnew")}>
            What's New
          </button>
        </div>
        <button className="muted settings-hint--sm settings-footer__link" onClick={() => navigate("whatsnew")}>
          {APP_NAME} · v{APP_VERSION}
          {BUILD_SHA && ` · ${BUILD_SHA}`} · your data, your device
        </button>
      </div>

      <BottomSheet open={relinkOpen} title="Link an existing sheet" onClose={() => setRelinkOpen(false)}>
        <p className="muted settings-sheet-note">
          Paste the Google Sheets link (or just its ID) from a device where you already
          connected. We'll sign in to Google to pull your real data down and read your
          product code from that sheet automatically, so you don't need to type it again.
        </p>
        <div className="field">
          <label className="field__label" htmlFor="settings-relink">Sheet link or ID</label>
          <input
            id="settings-relink"
            className="input"
            autoFocus
            value={relinkInput}
            placeholder="https://docs.google.com/spreadsheets/d/…"
            onChange={(e) => { setRelinkInput(e.target.value); setRelinkError(""); }}
            onKeyDown={(e) => e.key === "Enter" && submitRelink()}
          />
        </div>
        {relinkError && <p className="neg settings-error">{relinkError}</p>}
        <button className="btn btn--primary" disabled={busy || !relinkInput.trim()} onClick={submitRelink}>
          {busy ? "Linking…" : "Link this sheet"}
        </button>
      </BottomSheet>

      <BottomSheet open={!!colorPickerFor} title={`Color for "${colorPickerFor}"`} onClose={() => setColorPickerFor(null)}>
        <div className="chip-wrap">
          {PICKABLE_CATEGORY_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              className="settings-swatch"
              aria-label={`Use this color for ${colorPickerFor}`}
              style={{ background: color }}
              onClick={() => { if (colorPickerFor) setCategoryColor(colorPickerFor, color); setColorPickerFor(null); }}
            />
          ))}
        </div>
      </BottomSheet>
    </>
  );
}

function CategoryChip({
  name,
  color,
  onRename,
  onRemove,
  onPickColor,
}: {
  name: string;
  color: string;
  onRename: (next: string) => void;
  onRemove: () => void;
  onPickColor: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);

  function commit() {
    setEditing(false);
    if (value.trim() && value.trim() !== name) onRename(value);
    else setValue(name);
  }

  if (editing) {
    return (
      <input
        className="input settings-category-input"
        autoFocus
        value={value}
        aria-label={`Rename ${name}`}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") { setValue(name); setEditing(false); }
        }}
      />
    );
  }

  return (
    <span className="chip chip--removable">
      <button
        type="button"
        aria-label={`Change ${name}'s color`}
        className="settings-swatch settings-swatch--sm"
        style={{ background: color }}
        onClick={onPickColor}
      />
      <button onClick={() => { setValue(name); setEditing(true); }} className="btn--unstyled">
        {name}
      </button>
      <button aria-label={`Remove ${name}`} onClick={onRemove} className="chip__remove">
        <IconClose size={12} />
      </button>
    </span>
  );
}
