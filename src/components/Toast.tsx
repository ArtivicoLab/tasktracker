import { useToast } from "../stores/useToast";

// Global toast stack, rendered once at the app shell. Used for low-friction
// confirmations — e.g. "Workout added · Jul 9" with a "View" action that jumps
// to the screen and date the entry actually landed on.
export function Toaster() {
  const { toasts, dismiss } = useToast();
  if (toasts.length === 0) return null;
  return (
    <div className="toaster" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="toast">
          <span className="toast__msg">{t.message}</span>
          {t.actionLabel && (
            <button
              className="toast__action"
              onClick={() => {
                t.onAction?.();
                dismiss(t.id);
              }}
            >
              {t.actionLabel}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
