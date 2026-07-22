// Dashboard hero: a colored day banner with a greeting and an inline-editable
// name. Zero friction — tap the name (or "add your name") to set it; saves instantly.
import { useEffect, useRef, useState } from "react";
import { IconEdit } from "../../components/icons";
import { useSettings } from "../../stores/useSettings";

function greetingWord(d = new Date()): string {
  const h = d.getHours();
  if (h < 5) return "Good night";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

export function DashboardHero({ context }: { context?: string }) {
  const { name, update } = useSettings();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  function save() {
    update({ name: draft.trim() });
    setEditing(false);
  }

  const dateLabel = new Date()
    .toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })
    .toUpperCase();

  return (
    <div className="hero">
      {/* Decoration only, never between the user and data — 2 static
          sparkles, the app's one indulgence per screen. */}
      <svg className="sparkle" style={{ top: 14, right: 74 }} width="20" height="20" viewBox="0 0 24 24" aria-hidden>
        <path d="M12 1l2.2 8.8L23 12l-8.8 2.2L12 23l-2.2-8.8L1 12l8.8-2.2z" fill="var(--cat-butter)" stroke="var(--outline)" strokeWidth="1.4" />
      </svg>
      <svg className="sparkle" style={{ bottom: 10, right: 18 }} width="13" height="13" viewBox="0 0 24 24" aria-hidden>
        <path d="M12 1l2.2 8.8L23 12l-8.8 2.2L12 23l-2.2-8.8L1 12l8.8-2.2z" fill="var(--cat-sky)" stroke="var(--outline)" strokeWidth="1.6" />
      </svg>
      <div className="hero__date">{dateLabel}</div>
      <div className="hero__greet">
        {greetingWord()}
        {editing ? (
          <>
            <span>, </span>
            <input
              ref={inputRef}
              className="hero__nameinput"
              value={draft}
              maxLength={24}
              placeholder="your name"
              aria-label="Your name"
              onChange={(e) => setDraft(e.target.value)}
              onBlur={save}
              onKeyDown={(e) => {
                if (e.key === "Enter") save();
                if (e.key === "Escape") {
                  setDraft(name);
                  setEditing(false);
                }
              }}
            />
          </>
        ) : name ? (
          <button
            className="hero__setname"
            aria-label={`Edit name (${name})`}
            onClick={() => {
              setDraft(name);
              setEditing(true);
            }}
          >
            , {name}
            <IconEdit size={14} className="hero__editicon" />
          </button>
        ) : (
          <button
            className="hero__addname"
            onClick={() => {
              setDraft("");
              setEditing(true);
            }}
          >
            + add your name
          </button>
        )}
      </div>
      {context && <div className="hero__context">{context}</div>}
    </div>
  );
}
