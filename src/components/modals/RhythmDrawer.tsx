import React, { useEffect, useState } from 'react';
import { Tag, MapPin, Users, CalendarPlus, Undo2 } from 'lucide-react';
import { addDoc, collection } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../lib/firebase';
import { format, parseISO, isValid } from 'date-fns';
import { cn, getUserInitials } from '../../lib/utils';
import { updateRhythm, deleteRhythm, extendRhythmTerm, uncancelGatheringDoc } from '../../lib/rhythms';
import { useLanguage } from '../LanguageProvider';
import { useUndoSnack } from '../../hooks/useUndoSnack';
import { UndoSnackbar } from '../UndoSnackbar';
import { PopupFrame, PopupSection } from '../ui/PopupFrame';
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
  // The form as it opened, so "dirty" means the person changed something and
  // closing asks before it discards the edit (spec #1444).
  const [baseline, setBaseline] = useState<{ name: string; location: string; roster: string[] } | null>(null);
  const { undoSnack, showUndoSnack, closeUndoSnack } = useUndoSnack();

  useEffect(() => {
    if (isOpen && rhythm) {
      setName(rhythm.name);
      setLocation(rhythm.location ?? '');
      setRoster(rhythm.roster);
      setRosterSearch('');
      setNewTermEnd(rhythm.termEnd);
      setBaseline({ name: rhythm.name, location: rhythm.location ?? '', roster: rhythm.roster });
    }
  }, [isOpen, rhythm]);

  if (!rhythm) return null;

  // Date-only strings, written the way the rest of the page writes dates
  // rather than as the database value they are stored as (issue 982).
  const asDate = (ymd: string): string => {
    const d = parseISO(ymd);
    return isValid(d) ? format(d, 'MMM d, yyyy') : ymd;
  };

  const cancelledWeeks = gatherings.filter((g) => g.cancelled).sort((a, b) => a.date.localeCompare(b.date));

  const handleSave = async () => {
    if (!name.trim()) return;
    setLoading(true);
    try {
      await updateRhythm(rhythm.id, {
        name: name.trim(),
        location: location.trim() || null,
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
    if (!window.confirm(t(
      'attendance.remove_rhythm_confirm',
      'Remove this Rhythm? Past gatherings stay on record as one-offs, keeping who came. Upcoming weeks are removed with it.',
    ))) return;
    await deleteRhythm(rhythm, gatherings);
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
        stage: 'Lead',
        lastSeen: 'Just now',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        // Created from a roster search with no persisted tie yet; a Trainee
        // sees it only once someone owns or shares it (#1024 phase 4).
        visibleTo: [],
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

  // Roster members first, then everyone else, each group by name — and only
  // then the display cap. Ordering after the cap is what let the drawer count
  // six on the roster while showing one of them, with no way to remove the
  // other five (issue 982).
  const ROSTER_LIST_CAP = 30;
  const matchingContacts = contacts
    .filter((c) => !rosterQuery || c.name.toLowerCase().includes(rosterQuery))
    .sort((a, b) => {
      const aOn = roster.includes(a.id);
      const bOn = roster.includes(b.id);
      if (aOn !== bOn) return aOn ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  const shownContacts = matchingContacts.slice(0, ROSTER_LIST_CAP);
  const elidedCount = matchingContacts.length - shownContacts.length;

  const dirty =
    !!baseline &&
    (name !== baseline.name ||
      location !== baseline.location ||
      roster.join('\u0000') !== baseline.roster.join('\u0000'));

  return (
    <>
      <PopupFrame
        open={isOpen}
        onClose={onClose}
        placement="side"
        size="sm"
        eyebrow={t('attendance.rhythm_eyebrow', 'Rhythm')}
        title={t('attendance.rhythm_settings', 'Rhythm settings')}
        subtitle={rhythm.name}
        dirty={dirty}
        noun={t('attendance.rhythm_noun', 'Rhythm')}
        destructive={{ label: t('attendance.remove_rhythm', 'Remove this Rhythm'), onClick: handleDelete }}
        cancelLabel={t('modals.cancel')}
        onCancel={onClose}
        primary={{
          label: t('modals.save_changes'),
          onClick: handleSave,
          disabled: !name.trim(),
          saving: loading,
          savingLabel: t('modals.saving'),
        }}
      >
        <PopupSection
          label={t('modals.name')}
          hint={t('attendance.rename_note', 'A name is identity — a rename shows up on every chip, past weeks included.')}
        >
          <label className="flex h-10 items-center gap-2 rounded-sm bg-surface-container-low px-3.5 text-on-surface-variant focus-within:border-outline border border-transparent">
            <Tag className="h-3.5 w-3.5 shrink-0" />
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-label={t('modals.name')}
              className="w-full bg-transparent text-sm text-on-surface outline-none"
            />
          </label>
        </PopupSection>

        <PopupSection label={t('modals.location')}>
          <label className="flex h-10 items-center gap-2 rounded-sm bg-surface-container-low px-3.5 text-on-surface-variant focus-within:border-outline border border-transparent">
            <MapPin className="h-3.5 w-3.5 shrink-0" />
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              aria-label={t('modals.location')}
              className="w-full bg-transparent text-sm text-on-surface outline-none"
            />
          </label>
        </PopupSection>

        <PopupSection
          label={t('attendance.expected_roster', 'Expected Roster')}
          hint={t('attendance.roster_live_note', 'Takes effect for this week and every week ahead — past weeks keep the roster they were recorded with.')}
        >
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Users className="h-3.5 w-3.5 shrink-0 text-on-surface-variant" />
              <input
                type="text"
                value={rosterSearch}
                onChange={(e) => setRosterSearch(e.target.value)}
                placeholder={t('attendance.add_attendee_or_walkin', 'Add attendee or walk-in...')}
                className="h-9 w-full rounded-sm bg-surface-container-low border border-transparent px-3 text-sm text-on-surface outline-none focus:border-outline"
              />
              {rosterQuery && !rosterExactMatch && (
                <button
                  type="button"
                  disabled={isCreatingContact}
                  onClick={() => handleCreateContact(rosterSearch)}
                  className="h-9 shrink-0 whitespace-nowrap rounded-full bg-primary px-3 text-[12px] font-medium text-on-primary transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  {isCreatingContact ? t('attendance.creating', 'Creating...') : t('attendance.create_contact_named', 'Create contact "{name}"').replace('{name}', rosterSearch.trim())}
                </button>
              )}
            </div>
            <p className="text-[12px] font-medium text-accent">
              {roster.length} on roster
            </p>
            <div className="max-h-40 space-y-1 overflow-y-auto pr-1">
              {shownContacts.map((c) => {
                const isSelected = roster.includes(c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => toggleRosterMember(c)}
                    className={cn(
                      'flex w-full items-center justify-between rounded-sm px-2.5 py-1.5 text-left text-[13px] transition-colors',
                      isSelected ? 'bg-primary/10 font-medium text-accent' : 'text-on-surface-variant hover:bg-surface-container-low',
                    )}
                  >
                    <span>{c.name}</span>
                    <span className="text-[10px]">{isSelected ? '✓ on roster' : '+ add'}</span>
                  </button>
                );
              })}
            </div>
            {elidedCount > 0 && (
              <p className="text-[11px] text-on-surface-variant">
                {t('attendance.roster_more_not_shown', '{n} more — search to narrow the list.').replace('{n}', String(elidedCount))}
              </p>
            )}
          </div>
        </PopupSection>

        <PopupSection label={t('attendance.extend_term', 'Extend the term')}>
          <div className="space-y-2">
            <p className="flex items-center gap-2 text-[13px] text-on-surface-variant">
              <CalendarPlus className="h-3.5 w-3.5 shrink-0" />
              {t('attendance.term_runs_through', 'Currently runs through')} <b className="text-on-surface">{asDate(rhythm.termEnd)}</b>.
            </p>
            <div className="flex gap-2">
              <input
                type="date"
                value={newTermEnd}
                min={rhythm.termEnd}
                onChange={(e) => setNewTermEnd(e.target.value)}
                className="h-10 flex-1 rounded-sm border border-transparent bg-surface-container-low px-3 text-sm text-on-surface outline-none focus:border-outline"
              />
              <button
                type="button"
                onClick={handleExtend}
                disabled={loading || !newTermEnd || newTermEnd <= rhythm.termEnd}
                className="h-10 shrink-0 rounded-full border border-outline-variant px-4 text-[13px] font-medium text-on-surface disabled:opacity-40"
              >
                {t('attendance.extend', 'Extend')}
              </button>
            </div>
          </div>
        </PopupSection>

        {cancelledWeeks.length > 0 && (
          <PopupSection label={t('attendance.cancelled_weeks', 'Cancelled weeks')}>
            <div className="space-y-1.5">
              {cancelledWeeks.map((g) => (
                <div
                  key={g.id}
                  className="flex items-center justify-between rounded-sm border border-outline-variant px-3 py-2"
                >
                  <span className="text-[13px] text-on-surface-variant line-through">{asDate(g.date)}</span>
                  <button
                    type="button"
                    onClick={() => uncancelGatheringDoc(g.id)}
                    className="inline-flex items-center gap-1 text-[12px] font-medium text-accent hover:opacity-80"
                  >
                    <Undo2 className="h-3 w-3" /> {t('attendance.undo', 'Undo')}
                  </button>
                </div>
              ))}
            </div>
          </PopupSection>
        )}
      </PopupFrame>
      <UndoSnackbar undoSnack={undoSnack} onClose={closeUndoSnack} />
    </>
  );
}
