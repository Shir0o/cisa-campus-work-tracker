import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Plus, Trash2, Loader2, CalendarHeart } from 'lucide-react';
import type { GatheringType } from '../../types';
import {
  addGatheringType,
  removeGatheringType,
  updateGatheringType,
} from '../../lib/gatheringTypes';

interface ManageGatheringTypesModalProps {
  isOpen: boolean;
  onClose: () => void;
  types: GatheringType[];
}

interface Row {
  key: string;
  id?: string; // present = existing type
  origName?: string;
  name: string;
}

export default function ManageGatheringTypesModal({ isOpen, onClose, types }: ManageGatheringTypesModalProps) {
  const [rows, setRows] = useState<Row[]>([]);
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);
  const nextKey = useRef(0); // unique keys for freshly-added rows (per instance)

  // Snapshot the live types into an editable draft each time the modal opens.
  useEffect(() => {
    if (isOpen) {
      setRows(types.map((t) => ({ key: `k${t.id}`, id: t.id, origName: t.name, name: t.name })));
      setNewName('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    if (isOpen) window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose]);

  const setRow = (key: string, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const removeRow = (key: string) => setRows((rs) => rs.filter((r) => r.key !== key));

  const nameExists = (name: string) =>
    rows.some((r) => r.name.trim().toLowerCase() === name.trim().toLowerCase());

  const addRow = () => {
    const name = newName.trim();
    if (!name || nameExists(name)) return;
    setRows((rs) => [...rs, { key: `n${nextKey.current++}`, name }]);
    setNewName('');
  };

  const handleSave = async () => {
    const keep = rows.filter((r) => r.name.trim());
    setSaving(true);
    try {
      const keptIds = new Set(keep.map((r) => r.id).filter(Boolean));
      const ops: Promise<void>[] = [];

      // Removals: existing types no longer in the draft.
      types.forEach((t) => { if (!keptIds.has(t.id)) ops.push(removeGatheringType(t.id)); });

      // Renames + additions.
      keep.forEach((r, i) => {
        const name = r.name.trim();
        if (!r.id) {
          ops.push(addGatheringType({ name, order: types.length + i }));
        } else if (name !== r.origName) {
          ops.push(updateGatheringType(r.id, { name }, r.origName));
        }
      });

      await Promise.all(ops);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-start justify-center pt-24 px-6 overflow-y-auto pb-12">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/20 backdrop-blur-[2px] z-[-1]"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -20 }}
            className="relative w-full max-w-md bg-surface-container rounded-3xl shadow-2xl border border-outline-variant"
          >
            {/* Header */}
            <div className="px-5 py-4 border-b border-outline-variant flex items-center gap-3">
              <div className="w-11 h-11 rounded-full bg-primary-container text-on-primary-container flex items-center justify-center shrink-0">
                <CalendarHeart className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h2 className="font-serif text-xl text-on-surface leading-tight">Kinds of gathering</h2>
                <p className="text-sm text-on-surface-variant">The ways your fellowship comes together.</p>
              </div>
              <button
                onClick={onClose}
                className="ml-auto p-1.5 hover:bg-surface-container-high rounded-full transition-colors text-on-surface-variant cursor-pointer shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="p-5 space-y-2 max-h-[50vh] overflow-y-auto">
              {rows.length === 0 && (
                <p className="text-sm text-on-surface-variant italic py-2">No kinds yet — add one below.</p>
              )}
              {rows.map((r) => (
                <div key={r.key} className="flex items-center gap-2">
                  <input
                    value={r.name}
                    onChange={(e) => setRow(r.key, { name: e.target.value })}
                    placeholder="Name"
                    className="flex-1 min-w-0 h-10 px-3 rounded-xl bg-surface-container-high border border-outline focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all text-on-surface text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => removeRow(r.key)}
                    title="Remove this kind"
                    className="p-2 rounded-full text-on-surface-variant hover:bg-error-container hover:text-on-error-container transition-colors shrink-0 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}

              {/* Add row */}
              <div className="flex items-center gap-2 pt-2 mt-1 border-t border-outline-variant/50">
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') addRow(); }}
                  placeholder="New kind, e.g. Workshop"
                  className="flex-1 min-w-0 h-10 px-3 rounded-xl bg-surface-container-high border border-outline focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all text-on-surface text-sm"
                />
                <button
                  type="button"
                  onClick={addRow}
                  disabled={!newName.trim()}
                  className="inline-flex items-center gap-1 px-3 h-10 rounded-xl bg-surface-container-high border border-outline/40 text-on-surface text-xs font-bold hover:border-outline transition-colors disabled:opacity-50 shrink-0 cursor-pointer"
                >
                  <Plus className="w-3 h-3" /> Add
                </button>
              </div>
            </div>

            {/* Footer */}
            <div className="px-5 py-4 border-t border-outline-variant flex items-center gap-2">
              <span className="text-[11px] text-on-surface-variant mr-auto">Renaming a kind updates past gatherings too.</span>
              <button
                type="button"
                onClick={onClose}
                className="h-10 px-4 rounded-xl font-bold text-xs text-on-surface-variant hover:bg-surface-container-high transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="h-10 px-5 rounded-xl bg-primary text-on-primary font-bold text-xs shadow-md shadow-primary/20 hover:shadow-primary/30 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
              >
                {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Save'}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
