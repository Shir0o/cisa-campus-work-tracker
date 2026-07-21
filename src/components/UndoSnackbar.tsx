// Bottom-anchored "Undo" toast — pairs with useUndoSnack. Originally built
// for MyDay.tsx's archived-prayers undo, now shared with coordination notes'
// delete-with-undo.
import { motion, AnimatePresence } from "motion/react";
import { X } from "lucide-react";
import type { UndoSnack } from "../hooks/useUndoSnack";

export function UndoSnackbar({
  undoSnack,
  onClose,
}: {
  undoSnack: UndoSnack | null;
  onClose: () => void;
}) {
  return (
    <AnimatePresence>
      {undoSnack && (
        <div className="fixed bottom-20 lg:bottom-6 left-1/2 -translate-x-1/2 z-[250] pointer-events-none w-full max-w-sm px-4">
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95, transition: { duration: 0.15 } }}
            className="pointer-events-auto bg-surface-container-highest/95 backdrop-blur-xl border border-outline-variant rounded-2xl shadow-2xl px-5 py-3.5 flex items-center justify-between gap-4 w-full ring-1 ring-white/10"
          >
            <span className="text-sm font-medium text-on-surface">
              {undoSnack.message}
            </span>
            <div className="flex items-center gap-3 shrink-0">
              <button
                onClick={() => {
                  undoSnack.onUndo();
                  onClose();
                }}
                className="px-3.5 py-1.5 rounded-xl bg-primary text-on-primary text-xs font-bold hover:opacity-90 active:scale-95 transition-all"
              >
                Undo
              </button>
              <button
                onClick={onClose}
                className="p-1 rounded-full hover:bg-surface-variant text-on-surface-variant transition-colors"
                aria-label="Close snackbar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
