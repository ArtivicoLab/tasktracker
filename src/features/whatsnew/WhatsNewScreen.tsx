// What's New: quiet, Tesla-style release notes. Deliberately pull-based —
// there is no badge, popup, or nag anywhere; users find this from the version
// line in Settings when they're curious. The one proactive surface stays the
// tiny "Update available" toast (UpdatePrompt), which only appears when a new
// build is genuinely deployed and waiting.
import { useState } from "react";
import { HelpTip } from "../../components/HelpTip";
import { IconCheck } from "../../components/icons";
import { CHANGELOG } from "../../lib/changelog";
import { APP_VERSION, BUILD_SHA } from "../../lib/config";

export function WhatsNewScreen() {
  const [checking, setChecking] = useState(false);

  async function checkForUpdates() {
    setChecking(true);
    try {
      const reg = await navigator.serviceWorker?.getRegistration();
      await reg?.update();
    } finally {
      // Reload either way: a fresh fetch of index.html + a re-checked sw.js is
      // the only way to be sure you're not on a stale cache. If a new worker
      // was found, main.tsx's controllerchange listener takes over from here.
      window.location.reload();
    }
  }

  return (
    <>
      <div className="screen-head">
        <div className="screen-head__eyebrow">Always improving</div>
        <h1 className="screen-head__title">
          What's New
          <HelpTip text="Everything we've improved, release by release. Updates arrive on their own the next time you open the app: there's nothing to install and nothing to buy." />
        </h1>
      </div>

      <div className="card">
        <div className="spread">
          <div>
            <div className="txt-strong">You're on version {APP_VERSION}</div>
            <p className="muted settings-hint" style={{ margin: "4px 0 0" }}>
              Updates are free and arrive on their own. No installs, no add-ons,
              nothing extra to buy.
            </p>
          </div>
        </div>
        <button className="btn btn--stack" style={{ marginTop: 12 }} disabled={checking} onClick={checkForUpdates}>
          {checking ? "Checking…" : "Check for updates now"}
        </button>
      </div>

      {CHANGELOG.map((rel) => (
        <div key={rel.version}>
          <div className="section-title">
            v{rel.version} · {rel.date}
          </div>
          <div className="card">
            <div className="txt-strong" style={{ marginBottom: 8 }}>{rel.title}</div>
            {rel.items.map((item) => (
              <div className="row" key={item} style={{ alignItems: "flex-start", padding: "8px 0" }}>
                <span
                  aria-hidden
                  style={{
                    width: 22, height: 22, borderRadius: "50%", flex: "none", marginTop: 1,
                    display: "grid", placeItems: "center",
                    background: "var(--success-soft)", color: "var(--success)",
                  }}
                >
                  <IconCheck size={13} />
                </span>
                <div className="row__body">
                  <div style={{ fontSize: 14, lineHeight: 1.5, whiteSpace: "normal" }}>{item}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      <p className="muted" style={{ textAlign: "center", fontSize: 11, margin: "24px 0 8px" }}>
        v{APP_VERSION}
        {BUILD_SHA && ` · ${BUILD_SHA}`}
      </p>
    </>
  );
}
