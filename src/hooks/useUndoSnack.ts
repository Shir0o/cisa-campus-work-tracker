// A small "do the action now, offer to undo it" state machine — the action
// being undone already happened (e.g. a soft-delete), and `onUndo` just does
// the reverse. Originally built for MyDay.tsx's archived-prayers undo, now
// shared with coordination notes' delete-with-undo.
import { useEffect, useRef, useState } from "react";

export interface UndoSnack {
  message: string;
  onUndo: () => void;
}

export function useUndoSnack(duration = 5000) {
  const [undoSnack, setUndoSnack] = useState<UndoSnack | null>(null);
  const snackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showUndoSnack = (message: string, onUndo: () => void) => {
    if (snackTimerRef.current) {
      clearTimeout(snackTimerRef.current);
    }
    setUndoSnack({ message, onUndo });
    snackTimerRef.current = setTimeout(() => {
      setUndoSnack(null);
    }, duration);
  };

  const closeUndoSnack = () => {
    if (snackTimerRef.current) {
      clearTimeout(snackTimerRef.current);
      snackTimerRef.current = null;
    }
    setUndoSnack(null);
  };

  useEffect(() => {
    return () => {
      if (snackTimerRef.current) {
        clearTimeout(snackTimerRef.current);
      }
    };
  }, []);

  return { undoSnack, showUndoSnack, closeUndoSnack };
}
