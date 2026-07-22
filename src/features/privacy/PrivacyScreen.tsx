import { APP_VERSION, BUILD_SHA, COPYRIGHT_HOLDER } from "../../lib/config";
import { HelpTip } from "../../components/HelpTip";
import { IconCheck } from "../../components/icons";

const POINTS = [
  "No analytics, no tracking pixels, no cookies, no ads.",
  "No account on our servers: there are no servers of ours at all.",
  "Your data lives on your device (in the browser) and, only if you choose to connect it, in your own Google Drive spreadsheet.",
  "We never see your data. Nothing is sent anywhere except directly between your browser and your own Google account.",
  "Open your browser's Network tab any time and you'll see no third-party calls.",
];

export function PrivacyScreen() {
  const year = new Date().getFullYear();

  return (
    <>
      <div className="screen-head">
        <div className="screen-head__eyebrow">Nothing to hide</div>
        <h1 className="screen-head__title">
          Privacy
          <HelpTip text="What this app does, and doesn't do, with your data. Short version: nothing leaves your device except to your own Google account, if you choose to connect it." />
        </h1>
      </div>

      <div className="card">
        <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 6 }}>
          This is a static site. Nothing is tracked.
        </div>
        <p className="muted" style={{ fontSize: 14, lineHeight: 1.55 }}>
          Task Tracker is a plain, static web app: just HTML, CSS, and JavaScript
          served to your browser. It runs entirely on your device. There is no
          backend, no database of ours, and no telemetry of any kind.
        </p>
      </div>

      <div className="card" style={{ padding: "4px 16px" }}>
        {POINTS.map((p) => (
          <div className="row" key={p} style={{ alignItems: "flex-start" }}>
            <span
              aria-hidden
              style={{
                width: 24, height: 24, borderRadius: "50%", flex: "none", marginTop: 2,
                display: "grid", placeItems: "center",
                background: "var(--success-soft)", color: "var(--success)",
              }}
            >
              <IconCheck size={14} />
            </span>
            <div className="row__body">
              <div style={{ fontSize: 14, lineHeight: 1.5, whiteSpace: "normal" }}>{p}</div>
            </div>
          </div>
        ))}
      </div>

      <p className="muted" style={{ textAlign: "center", fontSize: 13, margin: "24px 0 4px" }}>
        © {year} {COPYRIGHT_HOLDER}. All rights reserved.
      </p>
      <p className="muted" style={{ textAlign: "center", fontSize: 11, margin: "0 0 8px" }}>
        v{APP_VERSION}
        {BUILD_SHA && ` · ${BUILD_SHA}`}
      </p>
    </>
  );
}
