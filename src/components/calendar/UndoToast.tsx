import { useEffect, useState } from 'react';
import { dismissTop, popAndApply, useUndoStack } from "../../lib/calendar/undo";

const AUTO_DISMISS_MS = 7000;

export const UndoToast = () => {
  const stack = useUndoStack();
  const top = stack[stack.length - 1] ?? null;
  const [busy, setBusy] = useState(false);

  // Auto-dismiss when a new top entry appears. Resets via top.id dep.
  useEffect(() => {
    if (!top) return;
    const t = setTimeout(() => dismissTop(), AUTO_DISMISS_MS);
    return () => clearTimeout(t);
  }, [top?.id]);

  if (!top) return null;

  const handleUndo = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await popAndApply();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        left: 16,
        bottom: 16,
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '8px 12px',
        background: 'var(--surface)',
        color: 'var(--ink)',
        border: '1px solid var(--border-2)',
        borderRadius: 8,
        boxShadow: '0 6px 18px rgba(0,0,0,0.15)',
        fontSize: 13,
        maxWidth: 360,
      }}
    >
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {top.label}
      </span>
      <button
        onClick={handleUndo}
        disabled={busy}
        style={{
          appearance: 'none',
          background: 'transparent',
          color: 'var(--accent)',
          border: 'none',
          padding: '2px 6px',
          fontWeight: 600,
          cursor: busy ? 'wait' : 'pointer',
          fontSize: 13,
        }}
      >
        {busy ? 'Undoing…' : 'Undo'}
      </button>
    </div>
  );
};
