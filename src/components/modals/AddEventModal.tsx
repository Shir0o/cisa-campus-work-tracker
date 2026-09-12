import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Tag, Plus, Loader2, CalendarHeart, MapPin, Users } from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../../lib/firebase';
import { collection, addDoc } from 'firebase/firestore';
import { cn } from '../../lib/utils';
import { format } from 'date-fns';

import DatePicker from '../ui/DatePicker';
import { useLanguage } from '../LanguageProvider';
import type { Contact } from '../../types';

interface AddEventModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentEventCount: number;
  contacts?: Contact[];
}

// "Log a gathering" — a one-off Gathering. Cadence/roster-as-a-standing-thing
// lives on a Rhythm now (issue #957 / ADR 0016); "Start a Rhythm" (a separate
// entry point, CreateRhythmModal) is where those fields belong. This modal
// only ever creates a single `events` doc with no `rhythmId`.
export default function AddEventModal({ isOpen, onClose, currentEventCount, contacts = [] }: AddEventModalProps) {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(false);
  const [selectedRoster, setSelectedRoster] = useState<string[]>([]);
  const [rosterSearch, setRosterSearch] = useState('');
  const [formData, setFormData] = useState({
    name: '',
    location: '',
    date: format(new Date(), 'yyyy-MM-dd'),
  });

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleEsc);
    }
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.date) return;

    setLoading(true);
    try {
      await addDoc(collection(db, 'events'), {
        name: formData.name.trim(),
        location: formData.location.trim() || null,
        date: formData.date,
        order: currentEventCount,
        createdAt: new Date().toISOString(),
        roster: selectedRoster,
      });

      setSelectedRoster([]);
      setRosterSearch('');
      setFormData({ name: '', location: '', date: format(new Date(), 'yyyy-MM-dd') });
      onClose();
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'events');
    } finally {
      setLoading(false);
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
            className="relative w-full max-w-sm bg-surface-container rounded-3xl shadow-2xl border border-outline-variant"
          >
            {/* Header */}
            <div className="px-5 py-4 border-b border-outline-variant flex items-center gap-3 pointer-events-auto">
              <div className="w-11 h-11 rounded-full bg-primary-container text-on-primary-container flex items-center justify-center shrink-0">
                <CalendarHeart className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h2 className="font-serif text-xl text-on-surface leading-tight">{t('modals.log_a_gathering')}</h2>
                <p className="text-sm text-on-surface-variant">{t('modals.add_to_record')}</p>
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
              <div className="space-y-4">
                {/* Name */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-semibold text-on-surface-variant flex items-center gap-2 px-1  ">
                    <Tag className="w-3 h-3" /> Name
                  </label>
                  <input
                    required
                    autoFocus
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData((f) => ({ ...f, name: e.target.value }))}
                    className="w-full h-11 px-4 rounded-xl bg-surface-container-high border border-outline focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all text-on-surface text-sm"
                    placeholder="e.g. Welcome BBQ"
                  />
                </div>

                {/* Date */}
                <DatePicker
                  label={t('modals.date')}
                  value={formData.date}
                  onChange={(val) => setFormData((f) => ({ ...f, date: val }))}
                  required
                />

                {/* Location (optional) */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-semibold text-on-surface-variant flex items-center gap-2 px-1  ">
                    <MapPin className="w-3 h-3" /> Location <span className="font-semibold normal-case tracking-normal text-on-surface-variant/70">(optional)</span>
                  </label>
                  <input
                    type="text"
                    value={formData.location}
                    onChange={(e) => setFormData((f) => ({ ...f, location: e.target.value }))}
                    className="w-full h-11 px-4 rounded-xl bg-surface-container-high border border-outline focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all text-on-surface text-sm"
                    placeholder="e.g. Lower Common Room"
                  />
                </div>

                {/* Expected Roster (optional, defaults to empty) */}
                {contacts.length > 0 && (
                  <div className="space-y-2 p-3 rounded-2xl bg-surface-container-high border border-outline/30">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-semibold text-on-surface-variant flex items-center gap-2 px-1">
                        <Users className="w-3 h-3" /> {t('attendance.expected_roster', 'Expected Roster')}
                      </label>
                      <span className="text-[11px] font-medium text-accent">
                        {selectedRoster.length} selected
                      </span>
                    </div>
                    <input
                      type="text"
                      value={rosterSearch}
                      onChange={(e) => setRosterSearch(e.target.value)}
                      placeholder={t('attendance.add_attendee_or_walkin', 'Add attendee or walk-in...')}
                      className="w-full h-8 px-3 rounded-lg bg-surface border border-outline/40 text-xs text-on-surface outline-none focus:border-primary"
                    />
                    <div className="max-h-32 overflow-y-auto space-y-1 pr-1">
                      {contacts
                        .filter((c) => !rosterSearch.trim() || c.name.toLowerCase().includes(rosterSearch.toLowerCase()))
                        .slice(0, 20)
                        .map((c) => {
                          const isSelected = selectedRoster.includes(c.id);
                          return (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() =>
                                setSelectedRoster((prev) =>
                                  isSelected ? prev.filter((id) => id !== c.id) : [...prev, c.id],
                                )
                              }
                              className={cn(
                                'w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors text-left',
                                isSelected
                                  ? 'bg-primary/10 text-accent font-medium'
                                  : 'hover:bg-surface text-on-surface-variant',
                              )}
                            >
                              <span>{c.name}</span>
                              <span className="text-[10px]">{isSelected ? '✓' : '+'}</span>
                            </button>
                          );
                        })}
                    </div>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 h-10 rounded-xl font-semibold text-xs text-on-surface-variant hover:bg-surface-container-high transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  disabled={loading || !formData.name || !formData.date}
                  type="submit"
                  className="flex-[1.5] h-10 rounded-xl bg-primary text-on-primary font-semibold text-xs   hover: active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:grayscale cursor-pointer"
                >
                  {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : (
                    <>
                      <Plus className="w-3 h-3" />
                      {t('modals.log_gathering')}
                    </>
                  )}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
