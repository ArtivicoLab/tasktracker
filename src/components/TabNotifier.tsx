// Mirrors the nav badge (Sidebar/TabBar) into the browser tab itself: the
// tab title gets a "(N)" prefix and the favicon gets a small red count badge
// drawn over it, both live-updating as tasks change. Reported
// directly, 2026-07-14: "can we get the notification on the dashboard to
// show in the browser tab too? and update when as the user update their
// daily task." Matters most for a pinned tab, which shows the favicon only
// with no title text at all — a title prefix alone would be invisible there.
import { useEffect, useRef } from "react";
import { useDueToday } from "../lib/useDueToday";
import { APP_NAME } from "../lib/config";

const BASE_TITLE = APP_NAME;
const FAVICON_SRC = "/favicon-96x96.png";
const ICON_SIZE = 96;
const BADGE_LINK_ID = "tasktracker-dynamic-favicon";
const BADGE_COLOR = "#ff5ca8"; // matches --alert/--cat-pink (tokens.css), the same candy pink as the nav badge

function getOrCreateBadgeLink(): HTMLLinkElement {
  let link = document.getElementById(BADGE_LINK_ID) as HTMLLinkElement | null;
  if (!link) {
    link = document.createElement("link");
    link.id = BADGE_LINK_ID;
    link.rel = "icon";
    // Appended last so it wins over the static favicon <link>s already in
    // index.html for browsers that prefer the last-declared icon.
    document.head.appendChild(link);
  }
  return link;
}

export function TabNotifier() {
  const total = useDueToday().total;
  const baseImg = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    document.title = total > 0 ? `(${total > 99 ? "99+" : total}) ${BASE_TITLE}` : BASE_TITLE;
  }, [total]);

  useEffect(() => {
    let cancelled = false;
    if (!baseImg.current) {
      const img = new Image();
      img.src = FAVICON_SRC;
      baseImg.current = img;
    }
    const img = baseImg.current;

    function draw() {
      if (cancelled) return;
      const link = getOrCreateBadgeLink();
      if (total <= 0) {
        link.href = FAVICON_SRC;
        return;
      }
      const canvas = document.createElement("canvas");
      canvas.width = ICON_SIZE;
      canvas.height = ICON_SIZE;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, ICON_SIZE, ICON_SIZE);

      const r = ICON_SIZE * 0.34;
      const cx = ICON_SIZE - r * 0.8;
      const cy = ICON_SIZE - r * 0.8;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = BADGE_COLOR;
      ctx.fill();
      ctx.lineWidth = ICON_SIZE * 0.03;
      ctx.strokeStyle = "#fff";
      ctx.stroke();

      ctx.fillStyle = "#fff";
      ctx.font = `bold ${Math.round(r * 1.1)}px system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(total > 9 ? "9+" : String(total), cx, cy + 1);

      link.href = canvas.toDataURL("image/png");
    }

    if (img.complete && img.naturalWidth > 0) draw();
    else img.onload = draw;
    return () => {
      cancelled = true;
    };
  }, [total]);

  return null;
}
