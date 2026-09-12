import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Tag, MapPin, Users, Loader2, Undo2, CalendarPlus } from 'lucide-react';
import { addDoc, collection } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../lib/firebase';
import { cn, getUserInitials } from '../../lib/utils';
import { updateRhythm, deleteRhythm, extendRhythmTerm, uncancelGatheringDoc } from '../../lib/rhythms';
import { useLanguage } from '../LanguageProvider';
import { useUndoSnack } from '../../hooks/useUndoSnack';
import { UndoSnackbar } from '../UndoSnackbar';
import type { Contact, Gathering, Rhythm } from '../../types';

interface RhythmDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  rhythm: Rhythm | null;
  gatherings: Gathering[]; // every occasion belonging to this rhythm
  contacts?: Contact[];
}

// The Rhythm's own configuration — name, cadence, location, roster, extend
// term, and the cancelled-weeks list with undo (issue #957 / ADR 0016). This
// replaces inline editing via EditEventModal for Rhythm-linked rows: a
// Rhythm-linked occasion's own fields live here, not per-occasion.
export default function RhythmDrawer({ isOpen, onClose, rhythm, gatherings, contacts = [] }: RhythmDrawerProps) {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [roster, setRoster] = useState<string[]>([]);
  const [rosterSearch, setRosterSearch] = useState('');
  const [newTermEnd, setNewTermEnd] = useState('');
  const [isCreatingContact, setIsCreatingContact] = useState(false);
  const { undoSnack, showUndoSnack, closeUndoSnack } = useUndoSnack();

  useEffect(() => {
    if (isOpen && rhythm) {
      setName(rhythm.name);
      setLocation(rhythm.location ?? '');
      setRoster(rhythm.roster);
      setRosterSearch('');
      setNewTermEnd(rhythm.termEnd);
    }
  }, [isOpen, rhythm]);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    if (isOpen) window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose]);

  if (!rhythm) return null;

  const cancelledWeeks = gatherings.filter((g) => g.cancelled).sort((a, b) => a.date.localeCompare(b.date));

  const handleSave = async () => {
    if (!name.trim()) return;
    setLoading(true);
    try {
      await updateRhythm(rhythm.id, {
        name: name.trim(),
        location: location.trim() || undefined,
        roster,
      });
      onClose();
    } finally {
      setLoading(false);
    }
  };

  const handleExtend = async () => {
    if (!newTermEnd || newTermEnd <= rhythm.termEnd) return;
    setLoading(true);
    try {
      await extendRhythmTerm(rhythm, newTermEnd, gatherings);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(t('attendance.remove_rhythm_confirm', 'Remove this Rhythm? Its past gatherings stay on record.'))) return;
    await deleteRhythm(rhythm.id);
    onClose();
  };

  // Removing someone from the roster is immediate but undoable — a toast
  // offers to put them straight back on (matches useUndoSnack's existing
  // "do it now, offer to undo" pattern elsewhere in the app).
  const toggleRosterMember = (c: Contact) => {
    const isOnRoster = roster.includes(c.id);
    if (isOnRoster) {
      setRoster((prev) => prev.filter((id) => id !== c.id));
      showUndoSnack(t('attendance.removed_from_roster', 'Removed {name} from the roster').replace('{name}', c.name), () => {
        setRoster((prev) => Array.from(new Set([...prev, c.id])));
      });
    } else {
      setRoster((prev) => Array.from(new Set([...prev, c.id])));
    }
  };

  // Create a contact from typed text right from the roster search — mirrors
  // the walk-in check-in flow's inline contact creation (ADR 0005).
  const handleCreateContact = async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed || isCreatingContact) return;
    setIsCreatingContact(true);
    try {
      const docRef = await addDoc(collection(db, 'contacts'), {
        name: trimmed,
        initials: getUserInitials(trimmed),
        role: 'Student',
        stage: 'Lead',
        lastSeen: 'Just now',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      setRoster((prev) => Array.from(new Set([...prev, docRef.id])));
      setRosterSearch('');
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, 'contacts');
    } finally {
      setIsCreatingContact(false);
    }
  };

  const rosterQuery = rosterSearch.trim().toLowerCase();
  const rosterExactMatch = contacts.some((c) => c.name.trim().toLowerCase() === rosterQuery);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex justify-end">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/20 backdrop-blur-[2px]"
          />
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 260 }}
            className="relative w-full max-w-md h-full bg-surface-container shadow-2xl border-l border-outline-variant overflow-y-auto"
          >
            <div className="px-5 py-4 border-b border-outline-variant flex items-center gap-3 sticky top-0 bg-surface-container z-10">
              <div className="min-w-0">
                <h2 className="font-serif text-xl text-on-surface leading-tight">{t('attendance.rhythm_settings', 'Rhythm settings')}</h2>
                <p className="text-sm text-on-surface-variant truncate">{rhythm.name}</p>
              </div>
              <button
                onClick={onClose}
                className="ml-auto p-1.5 hover:bg-surface-container-high rounded-full transition-colors text-on-surface-variant shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-5">
              <div className="space-y-1.5">
                <label className="text-[10px] font-semibold text-on-surface-variant flex items-center gap-2 px-1">
                  <Tag className="w-3 h-3" /> {t('modals.name')}
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full h-11 px-4 rounded-xl bg-surface-container-high border border-outline focus:border-primary outline-none text-on-surface text-sm"
                />
                <p className="text-[11px] text-on-surface-variant italic px-1">
                  {t('attendance.rename_note', 'A name is identity — a rename shows up on every chip, past weeks included.')}
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-semibold text-on-surface-variant flex items-center gap-2 px-1">
                  <MapPin className="w-3 h-3" /> {t('modals.location')}
                </label>
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="w-full h-11 px-4 rounded-xl bg-surface-container-high border border-outline focus:border-primary outline-none text-on-surface text-sm"
                />
              </div>

              {/* Roster */}
              <div className="space-y-2 p-3 rounded-2xl bg-surface-container-high border border-outline/30">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-semibold text-on-surface-variant flex items-center gap-2 px-1">
                    <Users className="w-3 h-3" /> {t('attendance.expected_roster', 'Expected Roster')}
                  </label>
                  <span className="text-[11px] font-medium text-accent">{roster.length} on roster</span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={rosterSearch}
                    onChange={(e) => setRosterSearch(e.target.value)}
                    placeholder={t('attendance.add_attendee_or_walkin', 'Add attendee or walk-in...')}
                    className="w-full h-8 px-3 rounded-lg bg-surface border border-outline/40 text-xs text-on-surface outline-none focus:border-primary"
                  />
                  {rosterQuery && !rosterExactMatch && (
                    <button
                      type="button"
                      disabled={isCreatingContact}
                      onClick={() => handleCreateContact(rosterSearch)}
                      className="h-8 px-3 rounded-lg bg-primary text-on-primary text-[11px] font-medium whitespace-nowrap hover:opacity-90 disabled:opacity-50 transition-opacity"
                    >
                      {isCreatingContact ? t('attendance.creating', 'Creating...') : t('attendance.create_contact_named', 'Create contact "{name}"').replace('{name}', rosterSearch.trim())}
                    </button>
                  )}
                </div>
                <div className="max-h-40 overflow-y-auto space-y-1 pr-1">
                  {contacts
                    .filter((c) => !rosterSearch.trim() || c.name.toLowerCase().includes(rosterSearch.toLowerCase()))
                    .slice(0, 30)
                    .map((c) => {
                      const isSelected = roster.includes(c.id);
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => toggleRosterMember(c)}
                          className={cn(
                            'w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors text-left',
                            isSelected ? 'bg-primary/10 text-accent font-medium' : 'hover:bg-surface text-on-surface-variant',
                          )}
                        >
                          <span>{c.name}</span>
                          <span className="text-[10px]">{isSelected ? '✓ on roster' : '+ add'}</span>
                        </button>
                      );
                    })}
                </div>
                <p className="text-[11px] text-on-surface-variant italic px-1">
                  {t('attendance.roster_live_note', 'Takes effect for this week and every week ahead — past weeks keep the roster they were recorded with.')}
                </p>
              </div>

              <button
                onClick={handleSave}
                disabled={loading || !name.trim()}
                className="w-full h-10 rounded-xl bg-primary text-on-primary font-semibold text-xs flex items-center justify-center gap-2 disabled:opacity-50 transition-opacity"
              >
                {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : t('modals.save_changes')}
              </button>

              {/* Extend term */}
              <div className="pt-4 border-t border-outline-variant/40 space-y-2">
                <label className="text-[10px] font-semibold text-on-surface-variant flex items-center gap-2 px-1">
                  <CalendarPlus className="w-3 h-3" /> {t('attendance.extend_term', 'Extend the term')}
                </label>
                <p className="text-xs text-on-surface-variant px-1">
                  {t('attendance.term_runs_through', 'Currently runs through')} <b className="text-on-surface">{rhythm.termEnd}</b>.
                </p>
                <div className="flex gap-2">
                  <input
                    type="date"
                    value={newTermEnd}
                    min={rhythm.termEnd}
                    onChange={(e) => setNewTermEnd(e.target.value)}
                    className="flex-1 h-10 px-3 rounded-xl bg-surface-container-high border border-outline outline-none text-xs text-on-surface"
                  />
                  <button
                    onClick={handleExtend}
                    disabled={loading || !newTermEnd || newTermEnd <= rhythm.termEnd}
                    className="h-10 px-4 rounded-xl border border-outline-variant text-xs font-medium text-on-surface disabled:opacity-40"
                  >
                    {t('attendance.extend', 'Extend')}
                  </button>
                </div>
              </div>

              {/* Cancelled weeks */}
              {cancelledWeeks.length > 0 && (
                <div className="pt-4 border-t border-outline-variant/40 space-y-2">
                  <label className="text-[10px] font-semibold text-on-surface-variant px-1">
                    {t('attendance.cancelled_weeks', 'Cancelled weeks')}
                  </label>
                  <div className="space-y-1.5">
                    {cancelledWeeks.map((g) => (
                      <div
                        key={g.id}
                        className="flex items-center justify-between px-3 py-2 rounded-xl bg-surface-container-high border border-outline/30"
                      >
                        <span className="text-xs text-on-surface-variant line-through">{g.date}</span>
                        <button
                          onClick={() => uncancelGatheringDoc(g.id)}
                          className="inline-flex items-center gap-1 text-[11px] font-medium text-accent hover:opacity-80"
                        >
                          <Undo2 className="w-3 h-3" /> {t('attendance.undo', 'Undo')}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Remove the Rhythm */}
              <div className="pt-4 border-t border-outline-variant/40">
                <button
                  onClick={handleDelete}
                  className="w-full h-9 rounded-xl text-xs font-medium text-error hover:bg-error-container/40 transition-colors"
                >
                  {t('attendance.remove_rhythm', 'Remove this Rhythm')}
                </button>
              </div>
            </div>
          </motion.div>
          <UndoSnackbar undoSnack={undoSnack} onClose={closeUndoSnack} />
        </div>
      )}
    </AnimatePresence>
  );
}
