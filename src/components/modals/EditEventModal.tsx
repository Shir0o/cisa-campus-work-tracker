import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Tag, MapPin, Loader2, CalendarHeart, Users } from 'lucide-react';
import { doc, updateDoc, writeBatch } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, logActivity } from '../../lib/firebase';
import { cn } from '../../lib/utils';
import type { Contact, Event } from '../../types';
import { useGatheringTypes } from '../../lib/gatheringTypes';
import { getRecurringSeriesEventIdsToUpdate } from '../../lib/attendanceRoster';
import DatePicker from '../ui/DatePicker';
import { useLanguage } from '../LanguageProvider';

interface EditEventModalProps {
  isOpen: boolean;
  onClose: () => void;
  event: Event | null;
  contacts?: Contact[];
  allEvents?: Event[];
}

// Edit one gathering's details — name / kind / date / location / expected roster.
export default function EditEventModal({ isOpen, onClose, event, contacts = [], allEvents = [] }: EditEventModalProps) {
  const { t } = useLanguage();
  const gatheringTypes = useGatheringTypes();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({ name: '', type: '', location: '', date: '' });
  const [selectedRoster, setSelectedRoster] = useState<string[]>([]);
  const [rosterSearch, setRosterSearch] = useState('');
  const [applyToSeries, setApplyToSeries] = useState(false);

  useEffect(() => {
    if (isOpen && event) {
      setFormData({
        name: event.name ?? '',
        type: event.type ?? '',
        location: event.location ?? '',
        date: event.date ?? '',
      });
      setSelectedRoster(event.roster ?? []);
      setRosterSearch('');
      setApplyToSeries(false);
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

  const isRecurringEvent = !!(event?.isRecurring || event?.parentEventId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!event || !formData.name.trim() || !formData.date) return;
    setLoading(true);
    try {
      const updatePayload: Record<string, unknown> = {
        name: formData.name.trim(),
        type: formData.type || null,
        location: formData.location.trim() || null,
        date: formData.date,
        roster: selectedRoster,
      };

      if (applyToSeries && isRecurringEvent && allEvents.length > 0) {
        const eventIds = getRecurringSeriesEventIdsToUpdate(event, allEvents);
        const batch = writeBatch(db);
        for (const evId of eventIds) {
          batch.update(doc(db, 'events', evId), {
            name: formData.name.trim(),
            type: formData.type || null,
            location: formData.location.trim() || null,
            roster: selectedRoster,
          });
        }
        await batch.commit();
      } else {
        await updateDoc(doc(db, 'events', event.id), updatePayload);
      }

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
                <h2 className="font-serif text-xl text-on-surface leading-tight">{t('modals.edit_gathering')}</h2>
                <p className="text-sm text-on-surface-variant">{t('modals.fix_detail')}</p>
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
                <label className="text-[10px] font-semibold text-on-surface-variant flex items-center gap-2 px-1  ">
                  <Tag className="w-3 h-3" /> {t('modals.name')}
                </label>
                <input
                  required
                  autoFocus
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData((f) => ({ ...f, name: e.target.value }))}
                  className="w-full h-11 px-4 rounded-xl bg-surface-container-high border border-outline focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all text-on-surface text-sm"
                  placeholder={t('modals.event_name_placeholder')}
                />
              </div>

              {/* Type pills */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-semibold text-on-surface-variant px-1  ">{t('modals.type')}</label>
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
                label={t('modals.date')}
                value={formData.date}
                onChange={(val) => setFormData((f) => ({ ...f, date: val }))}
                required
              />

              {/* Location */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-semibold text-on-surface-variant flex items-center gap-2 px-1  ">
                  <MapPin className="w-3 h-3" /> {t('modals.location')} <span className="font-semibold normal-case tracking-normal text-on-surface-variant/70">{t('modals.optional')}</span>
                </label>
                <input
                  type="text"
                  value={formData.location}
                  onChange={(e) => setFormData((f) => ({ ...f, location: e.target.value }))}
                  className="w-full h-11 px-4 rounded-xl bg-surface-container-high border border-outline focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all text-on-surface text-sm"
                  placeholder={t('modals.location_placeholder')}
                />
              </div>

              {/* Expected Roster (optional) */}
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

                  {isRecurringEvent && (
                    <div className="pt-2 mt-2 border-t border-outline/20 flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="edit-apply-to-series"
                        checked={applyToSeries}
                        onChange={(e) => setApplyToSeries(e.target.checked)}
                        className="rounded border-outline text-primary focus:ring-primary"
                      />
                      <label htmlFor="edit-apply-to-series" className="text-xs text-on-surface-variant cursor-pointer select-none">
                        {t('attendance.apply_to_future_series', 'All future in series')}
                      </label>
                    </div>
                  )}
                </div>
              )}

              {/* Actions */}
              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 h-10 rounded-xl font-semibold text-xs text-on-surface-variant hover:bg-surface-container-high transition-all cursor-pointer"
                >
                  {t('modals.cancel')}
                </button>
                <button
                  disabled={loading || !formData.name.trim() || !formData.date}
                  type="submit"
                  className="flex-[1.5] h-10 rounded-xl bg-primary text-on-primary font-semibold text-xs   hover: active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:grayscale cursor-pointer"
                >
                  {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : t('modals.save_changes')}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
