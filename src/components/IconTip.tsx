// Makes an icon-only button's meaning discoverable on a phone. A bare `title`
// attribute only ever shows on mouse hover, which never happens on a
// touchscreen — so on touch this reveals a small label bubble on a
// long-press, without firing the button's own tap action, while a normal
// quick tap still performs it exactly as before. Desktop mouse users keep
// the native `title` hover tooltip already on the wrapped button.
import { useLayoutEffect, useRef, useState, type ReactNode, type MouseEvent as RMouseEvent, type PointerEvent as RPointerEvent } from "react";
import { createPortal } from "react-dom";

const LONG_PRESS_MS = 420;
const AUTO_HIDE_MS = 1800;
const EDGE_MARGIN = 12;

export function IconTip({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number } | null>(null);
  const timer = useRef<number | null>(null);
  const hideTimer = useRef<number | null>(null);
  const longPressed = useRef(false);

  function clearPressTimer() {
    if (timer.current) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  }

  function onPointerDown(e: RPointerEvent) {
    if (e.pointerType === "mouse") return; // hover + native title already covers mouse
    longPressed.current = false;
    clearPressTimer();
    timer.current = window.setTimeout(() => {
      longPressed.current = true;
      setOpen(true);
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
      hideTimer.current = window.setTimeout(() => setOpen(false), AUTO_HIDE_MS);
    }, LONG_PRESS_MS);
  }
  function onPointerUp() {
    clearPressTimer();
  }
  function onClickCapture(e: RMouseEvent) {
    if (longPressed.current) {
      e.preventDefault();
      e.stopPropagation();
      longPressed.current = false;
    }
  }

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    function place() {
      const anchor = wrapRef.current?.getBoundingClientRect();
      const bubble = bubbleRef.current?.getBoundingClientRect();
      if (!anchor || !bubble) return;
      let left = anchor.left + anchor.width / 2 - bubble.width / 2;
      const maxLeft = window.innerWidth - bubble.width - EDGE_MARGIN;
      left = Math.min(Math.max(left, EDGE_MARGIN), Math.max(EDGE_MARGIN, maxLeft));
      const fitsAbove = anchor.top - 8 - bubble.height >= 0;
      setPos(
        fitsAbove
          ? { left, bottom: window.innerHeight - anchor.top + 8 }
          : { left, top: anchor.bottom + 8 }
      );
    }
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  return (
    <span
      ref={wrapRef}
      className="icontip"
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
      onPointerCancel={onPointerUp}
      onClickCapture={onClickCapture}
    >
      {children}
      {open &&
        createPortal(
          <div
            ref={bubbleRef}
            className="icontip__bubble"
            role="tooltip"
            style={
              pos
                ? { left: pos.left, top: pos.top, bottom: pos.bottom, visibility: "visible" }
                : { left: 0, top: 0, visibility: "hidden" }
            }
          >
            {label}
          </div>,
          document.body
        )}
    </span>
  );
}
