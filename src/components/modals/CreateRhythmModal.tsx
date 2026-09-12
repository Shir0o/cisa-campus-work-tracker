import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Tag, Plus, Loader2, Repeat, MapPin, Users } from 'lucide-react';
import { format, addMonths, getDay } from 'date-fns';
import { cn } from '../../lib/utils';
import { createRhythm } from '../../lib/rhythms';
import { useLanguage } from '../LanguageProvider';
import { useAuth } from '../AuthProvider';
import type { Contact, Rhythm } from '../../types';

interface CreateRhythmModalProps {
  isOpen: boolean;
  onClose: () => void;
  contacts?: Contact[];
}

const DAYS = [
  { label: 'S', value: 0 },
  { label: 'M', value: 1 },
  { label: 'T', value: 2 },
  { label: 'W', value: 3 },
  { label: 'T', value: 4 },
  { label: 'F', value: 5 },
  { label: 'S', value: 6 },
];

// "Start a Rhythm" — a standing gathering (name/cadence/location/roster/term)
// as its own Firestore record (issue #957 / ADR 0016). A separate entry point
// from "Log a gathering" (AddEventModal), chosen before any form fields
// render — not a toggle inside one modal.
export default function CreateRhythmModal({ isOpen, onClose, contacts = [] }: CreateRhythmModalProps) {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [selectedRoster, setSelectedRoster] = useState<string[]>([]);
  const [rosterSearch, setRosterSearch] = useState('');
  const [formData, setFormData] = useState({
    name: '',
    location: '',
    cadenceType: 'weekly' as Rhythm['cadence']['type'],
    days: [] as number[],
    termStart: format(new Date(), 'yyyy-MM-dd'),
    termEnd: format(addMonths(new Date(), 4), 'yyyy-MM-dd'),
  });

  useEffect(() => {
    if (formData.termStart && formData.days.length === 0) {
      const day = getDay(new Date(`${formData.termStart}T00:00:00`));
      setFormData((f) => ({ ...f, days: [day] }));
    }
  }, [formData.termStart, formData.days.length]);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    if (isOpen) window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.termStart || !formData.termEnd) return;
    setLoading(true);
    try {
      await createRhythm({
        name: formData.name.trim(),
        cadence: { type: formData.cadenceType, days: formData.days },
        location: formData.location.trim() || undefined,
        roster: selectedRoster,
        termStart: formData.termStart,
        termEnd: formData.termEnd,
        createdById: user?.uid || 'unknown',
      });
      setSelectedRoster([]);
      setRosterSearch('');
      setFormData({
        name: '',
        location: '',
        cadenceType: 'weekly',
        days: [],
        termStart: format(new Date(), 'yyyy-MM-dd'),
        termEnd: format(addMonths(new Date(), 4), 'yyyy-MM-dd'),
      });
      onClose();
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
            <div className="px-5 py-4 border-b border-outline-variant flex items-center gap-3">
              <div className="w-11 h-11 rounded-full bg-primary-container text-on-primary-container flex items-center justify-center shrink-0">
                <Repeat className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h2 className="font-serif text-xl text-on-surface leading-tight">{t('modals.start_a_rhythm', 'Start a Rhythm')}</h2>
                <p className="text-sm text-on-surface-variant">{t('modals.rhythm_sub', 'A standing gathering, term-long.')}</p>
              </div>
              <button
                onClick={onClose}
                className="ml-auto p-1.5 hover:bg-surface-container-high rounded-full transition-colors text-on-surface-variant cursor-pointer shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-semibold text-on-surface-variant flex items-center gap-2 px-1">
                  <Tag className="w-3 h-3" /> Name
                </label>
                <input
                  required
                  autoFocus
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData((f) => ({ ...f, name: e.target.value }))}
                  className="w-full h-11 px-4 rounded-xl bg-surface-container-high border border-outline focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all text-on-surface text-sm"
                  placeholder={t('modals.example_rhythm_name', 'e.g. Wednesday Bible Study')}
                />
              </div>

              {/* Cadence */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-semibold text-on-surface-variant px-1">{t('modals.frequency')}</label>
                <div className="flex gap-2">
                  {(['weekly', 'monthly'] as const).map((ct) => (
                    <button
                      key={ct}
                      type="button"
                      onClick={() => setFormData((f) => ({ ...f, cadenceType: ct }))}
                      className={cn(
                        'flex-1 h-9 rounded-full border text-xs font-medium capitalize transition-colors',
                        formData.cadenceType === ct
                          ? 'bg-primary text-on-primary border-primary'
                          : 'bg-surface-container-high border-outline/40 text-on-surface-variant',
                      )}
                    >
                      {ct}
                    </button>
                  ))}
                </div>
              </div>

              {formData.cadenceType === 'weekly' && (
                <div className="space-y-2">
                  <label className="text-[10px] font-semibold text-on-surface-variant px-1">{t('modals.repeat_on')}</label>
                  <div className="flex justify-between gap-1">
                    {DAYS.map((day) => (
                      <button
                        key={day.value}
                        type="button"
                        onClick={() =>
                          setFormData((f) => {
                            const days = f.days.includes(day.value)
                              ? f.days.filter((d) => d !== day.value)
                              : [...f.days, day.value];
                            return days.length > 0 ? { ...f, days } : f;
                          })
                        }
                        className={cn(
                          'w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-semibold transition-all',
                          formData.days.includes(day.value)
                            ? 'bg-primary text-on-primary'
                            : 'bg-surface-container-high text-on-surface-variant border border-outline/30',
                        )}
                      >
                        {day.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Term */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-semibold text-on-surface-variant px-1">{t('modals.date')}</label>
                  <input
                    required
                    type="date"
                    value={formData.termStart}
                    onChange={(e) => setFormData((f) => ({ ...f, termStart: e.target.value }))}
                    className="w-full h-10 px-3 rounded-xl bg-surface-container-high border border-outline outline-none text-xs text-on-surface"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-semibold text-on-surface-variant px-1">{t('modals.end_by')}</label>
                  <input
                    required
                    type="date"
                    value={formData.termEnd}
                    onChange={(e) => setFormData((f) => ({ ...f, termEnd: e.target.value }))}
                    className="w-full h-10 px-3 rounded-xl bg-surface-container-high border border-outline outline-none text-xs text-on-surface"
                  />
                </div>
              </div>

              {/* Location (optional) */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-semibold text-on-surface-variant flex items-center gap-2 px-1">
                  <MapPin className="w-3 h-3" /> {t('modals.location', 'Location')} <span className="font-semibold normal-case tracking-normal text-on-surface-variant/70">{t('common.optional', '(optional)')}</span>
                </label>
                <input
                  type="text"
                  value={formData.location}
                  onChange={(e) => setFormData((f) => ({ ...f, location: e.target.value }))}
                  className="w-full h-11 px-4 rounded-xl bg-surface-container-high border border-outline focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all text-on-surface text-sm"
                  placeholder={t('modals.example_location', 'e.g. Lower Common Room')}
                />
              </div>

              {/* Roster */}
              {contacts.length > 0 && (
                <div className="space-y-2 p-3 rounded-2xl bg-surface-container-high border border-outline/30">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-semibold text-on-surface-variant flex items-center gap-2 px-1">
                      <Users className="w-3 h-3" /> {t('attendance.expected_roster', 'Expected Roster')}
                    </label>
                    <span className="text-[11px] font-medium text-accent">{selectedRoster.length} selected</span>
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
                              isSelected ? 'bg-primary/10 text-accent font-medium' : 'hover:bg-surface text-on-surface-variant',
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

              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 h-10 rounded-xl font-semibold text-xs text-on-surface-variant hover:bg-surface-container-high transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  disabled={loading || !formData.name.trim()}
                  type="submit"
                  className="flex-[1.5] h-10 rounded-xl bg-primary text-on-primary font-semibold text-xs hover: active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:grayscale cursor-pointer"
                >
                  {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : (
                    <>
                      <Plus className="w-3 h-3" /> {t('modals.create_schedule')}
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
