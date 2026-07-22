// Mobile "More" hub — a grouped grid of every module (matches the reference's
// Overview / Organization / Finances / Wellness sections).
import { navigate } from "../../router";
import { NAV } from "../../nav";
import { HelpTip } from "../../components/HelpTip";
import { useSettings } from "../../stores/useSettings";
import { IconChevron, IconSettings, IconHeart } from "../../components/icons";

const ACCOUNT = [
  { route: "settings" as const, label: "Settings", Icon: IconSettings },
  { route: "privacy" as const, label: "Privacy", Icon: IconHeart },
];

export function MoreScreen() {
  const { hiddenRoutes } = useSettings();
  const groups = NAV.map((group) => ({
    ...group,
    items: group.items.filter((i) => !hiddenRoutes.includes(i.route)),
  })).filter((group) => group.items.length > 0);

  return (
    <>
      <div className="screen-head">
        <div className="screen-head__eyebrow">All-in-one</div>
        <h1 className="screen-head__title">
          Everything
          <HelpTip text="Every module in the app, grouped the same way as the sidebar on desktop. Tap any card to jump straight there. Hide ones you don't use in Settings." />
        </h1>
      </div>

      {groups.map((group) => (
        <div key={group.title}>
          <div className="section-title">{group.title}</div>
          <div className="hub-grid" data-tour="more-hub">
            {group.items.map(({ route, label, Icon, color }) => (
              <button key={route} className="hub-card" onClick={() => navigate(route)}>
                <span className="hub-card__ico" style={{ background: color }}>
                  <Icon size={22} />
                </span>
                <span className="hub-card__label">{label}</span>
              </button>
            ))}
          </div>
        </div>
      ))}

      <div className="section-title">Account</div>
      <div className="card" style={{ padding: "4px 16px" }}>
        {ACCOUNT.map(({ route, label, Icon }) => (
          <button key={route} className="row spread" style={{ width: "100%" }} onClick={() => navigate(route)}>
            <span style={{ display: "inline-flex", gap: 10, alignItems: "center", fontWeight: 600 }}>
              <span className="hub-card__ico" style={{ width: 34, height: 34, background: "var(--surface-2)" }}>
                <Icon size={18} />
              </span>
              {label}
            </span>
            <IconChevron size={18} style={{ color: "var(--muted)" }} />
          </button>
        ))}
      </div>
    </>
  );
}
