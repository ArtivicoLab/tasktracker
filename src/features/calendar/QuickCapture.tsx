// Universal quick-add for the Calendar: type a task straight into a day cell,
// with an optional category pick before it saves.
import { useRef, useState } from "react";
import { BottomSheet } from "../../components/BottomSheet";
import { Chip, ChipRow } from "../../components/Chip";
import { useSettings } from "../../stores/useSettings";
import { useToast } from "../../stores/useToast";
import { navigate } from "../../router";
import { categoryColor } from "../../lib/ui";
import { fromISO, format, todayISO } from "../../lib/dates";
import { IconTag } from "../../components/icons";
import { commitCapture } from "../../lib/capture";

interface QuickCaptureProps {
  date: string;
  placeholder?: string;
  className?: string;
  inputStyle?: React.CSSProperties;
  compact?: boolean;
  /** Seed the input (used by the coach tour to demo the category picker). */
  initialDraft?: string;
  /** Demo mode for the coach tour: shows the picker but never commits/closes. */
  demo?: boolean;
  /** Called on Escape, or on blur after a successful (or empty) commit. */
  onClose: () => void;
}

export function QuickCapture({ date, placeholder = "Type a task…", className, inputStyle, compact, initialDraft, demo, onClose }: QuickCaptureProps) {
  const { categories } = useSettings();
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(initialDraft ?? "");
  const [category, setCategory] = useState("");
  const [catPickerOpen, setCatPickerOpen] = useState(false);

  const showCategoryPicker = draft.trim() !== "";

  function resetDraft() {
    setDraft("");
    setCategory("");
  }

  function submit(collapseAfter: boolean) {
    if (demo) return; // coach demo: the picker is live to explore, but nothing saves
    const t = draft.trim();
    if (!t) {
      if (collapseAfter) onClose();
      return;
    }
    const result = commitCapture(t, date, category || undefined);
    const onDate = result.date && result.date !== todayISO();
    useToast.getState().show({
      message: onDate ? `Task added · ${format(fromISO(result.date), "MMM d")}` : "Task added",
      actionLabel: "View",
      onAction: () => navigate("tasks", { id: result.id }),
    });
    resetDraft();
    if (collapseAfter) onClose();
  }

  function cancel() {
    if (demo) return; // the coach tour owns closing the demo
    resetDraft();
    onClose();
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, width: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 4, width: "100%" }}>
        <input
          ref={inputRef}
          className={className}
          autoFocus={!demo}
          value={draft}
          placeholder={placeholder}
          aria-label={`Quick add a task for ${date}`}
          readOnly={demo}
          style={{ flex: 1, minWidth: 0, ...inputStyle }}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit(false);
            if (e.key === "Escape") cancel();
          }}
          onBlur={() => { if (!catPickerOpen) submit(true); }}
        />
        {showCategoryPicker && (
          <span className="qc-pickers" data-tour="capture-pickers">
            <button
              type="button"
              className="chip"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setCatPickerOpen(true)}
              style={{ padding: 2, flex: "none" }}
              aria-label={category ? `Category: ${category}. Tap to change.` : "Pick a category"}
              title={category || "Pick a category"}
            >
              <span className="qc-badge" style={{ background: category ? categoryColor(category) : "var(--surface-2)" }}>
                <IconTag size={13} />
              </span>
              {!compact && <span>{category || "Category"}</span>}
            </button>
          </span>
        )}
      </div>

      <BottomSheet
        open={catPickerOpen}
        title="Category"
        onClose={() => { setCatPickerOpen(false); inputRef.current?.focus(); }}
      >
        <ChipRow>
          {categories.map((c) => (
            <Chip
              key={c}
              dotColor={categoryColor(c)}
              active={c === category}
              onClick={() => { setCategory(c); setCatPickerOpen(false); inputRef.current?.focus(); }}
            >
              {c}
            </Chip>
          ))}
        </ChipRow>
      </BottomSheet>
    </div>
  );
}
