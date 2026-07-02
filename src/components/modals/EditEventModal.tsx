import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Tag, MapPin, Loader2, CalendarHeart } from 'lucide-react';
import { doc, updateDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, logActivity } from '../../lib/firebase';
import { cn } from '../../lib/utils';
import type { Event } from '../../types';
import { useGatheringTypes } from '../../lib/gatheringTypes';
import DatePicker from '../ui/DatePicker';

interface EditEventModalProps {
  isOpen: boolean;
  onClose: () => void;
  event: Event | null;
}

// Edit one gathering's details — name / kind / date / location. Who came stays as
// it is (attendance lives on contacts, keyed by event id). Recurrence is not
// edited here (a series is edited per occurrence).
export default function EditEventModal({ isOpen, onClose, event }: EditEventModalProps) {
  const gatheringTypes = useGatheringTypes();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({ name: '', type: '', location: '', date: '' });

  useEffect(() => {
    if (isOpen && event) {
      setFormData({
        name: event.name ?? '',
        type: event.type ?? '',
        location: event.location ?? '',
        date: event.date ?? '',
      });
    }
  }, [isOpen, event]);

  // Keep the selected kind valid against the managed list — if this gathering's
  // stored type was renamed/removed, fall back to the first available kind (so we
  // never re-save a non-existent type). Touches only `type`, never the edits in
  // progress. Mirrors AddEventModal.
  useEffect(() => {
    if (!isOpen || gatheringTypes.length === 0 || !formData.type) return;
    if (!gatheringTypes.some((t) => t.name === formData.type)) {
      setFormData((f) => ({ ...f, type: gatheringTypes[0].name }));
    }
  }, [isOpen, gatheringTypes, formData.type]);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    if (isOpen) window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!event || !formData.name.trim() || !formData.date) return;
    setLoading(true);
    try {
      await updateDoc(doc(db, 'events', event.id), {
        name: formData.name.trim(),
        type: formData.type || null,
        location: formData.location.trim() || null,
        date: formData.date,
      });
      logActivity({
        action: 'edited the gathering',
        targetId: event.id,
        targetName: formData.name.trim(),
        targetType: 'event',
        type: 'edit',
        description: `Updated "${formData.name.trim()}" — ${formData.date}`,
      });
      onClose();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `events/${event.id}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && event && (
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
            className="relative w-full max-w-sm bg-surface-container rounded-3xl shadow-2xl border border-outline-variant"
          >
            {/* Header */}
            <div className="px-5 py-4 border-b border-outline-variant flex items-center gap-3">
              <div className="w-11 h-11 rounded-full bg-primary-container text-on-primary-container flex items-center justify-center shrink-0">
                <CalendarHeart className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h2 className="font-serif text-xl text-on-surface leading-tight">Edit gathering</h2>
                <p className="text-sm text-on-surface-variant">Fix a detail — who came stays as it is.</p>
              </div>
              <button
                onClick={onClose}
                className="ml-auto p-1.5 hover:bg-surface-container-high rounded-full transition-colors text-on-surface-variant cursor-pointer shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              {/* Name */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-on-surface-variant flex items-center gap-2 px-1 uppercase tracking-wider">
                  <Tag className="w-3 h-3" /> Name
                </label>
                <input
                  required
                  autoFocus
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData((f) => ({ ...f, name: e.target.value }))}
                  className="w-full h-11 px-4 rounded-xl bg-surface-container-high border border-outline focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all text-on-surface text-sm"
                  placeholder="e.g. Friday Night Gathering"
                />
              </div>

              {/* Type pills */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-on-surface-variant px-1 uppercase tracking-wider">Type</label>
                <div className="flex flex-wrap gap-2">
                  {gatheringTypes.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setFormData((f) => ({ ...f, type: t.name }))}
                      className={cn(
                        'px-3.5 h-9 rounded-full border text-xs font-medium transition-colors cursor-pointer',
                        formData.type === t.name
                          ? 'bg-primary text-on-primary border-primary'
                          : 'bg-surface-container-high border-outline/40 text-on-surface-variant hover:border-outline',
                      )}
                    >
                      {t.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Date */}
              <DatePicker
                label="Date"
                value={formData.date}
                onChange={(val) => setFormData((f) => ({ ...f, date: val }))}
                required
              />

              {/* Location */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-on-surface-variant flex items-center gap-2 px-1 uppercase tracking-wider">
                  <MapPin className="w-3 h-3" /> Location <span className="font-bold normal-case tracking-normal text-on-surface-variant/70">(optional)</span>
                </label>
                <input
                  type="text"
                  value={formData.location}
                  onChange={(e) => setFormData((f) => ({ ...f, location: e.target.value }))}
                  className="w-full h-11 px-4 rounded-xl bg-surface-container-high border border-outline focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all text-on-surface text-sm"
                  placeholder="e.g. Lower Common Room"
                />
              </div>

              {/* Actions */}
              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 h-10 rounded-xl font-bold text-xs text-on-surface-variant hover:bg-surface-container-high transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  disabled={loading || !formData.name.trim() || !formData.date}
                  type="submit"
                  className="flex-[1.5] h-10 rounded-xl bg-primary text-on-primary font-bold text-xs shadow-md shadow-primary/20 hover:shadow-primary/30 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:grayscale cursor-pointer"
                >
                  {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Save changes'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
