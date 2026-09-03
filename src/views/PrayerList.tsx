import React, { useReducer, useState, useEffect, useMemo, useRef } from 'react';
import {
  collection,
  onSnapshot,
  query,
  orderBy,
  doc,
  addDoc,
  updateDoc,
} from 'firebase/firestore';
import { db, logActivity, handleFirestoreError, OperationType } from '../lib/firebase';
import { Contact, PrayerRecord, VisitPhoto } from '../types';
import { Check, Clock, Image as ImageIcon, MessageSquare, Plus, Search, Trash2, UserMinus, Users, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { hasMinRole } from '../lib/permissions';
import {
  isTeamPrayer,
  isContactBrother,
  isContactSister,
  getContactGrade,
  getContactCaregiver,
  getContactAddedBy,
  sortPrayerEntries,
  isContactStale,
  getDaysSinceLastInteraction,
} from '../lib/prayers';
import { MAX_ANSWER_PHOTOS, uploadPrayerAnswerPhotos } from '../lib/prayerPhotos';
import { cn, getUserInitials, isServiceAccountName } from '../lib/utils';
import { useAuth } from '../components/AuthProvider';
import { useLanguage } from '../components/LanguageProvider';
import { prefetchTranslations } from '../lib/translator';
import { useLayout } from '../App';
import { Skeleton } from '../components/ui/Skeleton';
import { DataLoadError } from '../components/ui/DataLoadError';
import ContactDetailsModal from '../components/modals/ContactDetailsModal';
import PageContainer from '../components/layout/PageContainer';
import FromEntryTodoComposer from '../components/todos/FromEntryTodoComposer';
import type { TodoPerson } from '../lib/todos';
import { useNavigate } from 'react-router-dom';
import { useMediaQuery } from '../lib/useMediaQuery';
import PrayerListMobile from './PrayerListMobile';
import { RowActions } from '../components/ui/RowActions';
import { buildContactRowActions } from '../lib/rowActions';
import { UserEntityState } from '../lib/userEntityState';
import { Translate } from '../components/Translate';
import { UndoSnackbar } from '../components/UndoSnackbar';
import { useUndoSnack } from '../hooks/useUndoSnack';
import {
  getPendingPrayerRemovalIds,
  schedulePrayerRemoval,
  cancelPrayerRemoval,
  subscribePrayerRemovals,
} from '../lib/prayerRemoval';
import { deletePrayerRecord } from '../lib/prayers';


// ── week math
const DAY_MS = 86_400_000;
function weekStartOf(date: Date) {
  const x = new Date(date);
  const off = (x.getDay() + 6) % 7; // Monday = 0
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - off);
  return x;
}
const THIS_WEEK_START = weekStartOf(new Date()).getTime();
const THIS_WEEK_END = THIS_WEEK_START + 7 * DAY_MS;
const prayerMs = (p: PrayerRecord) => new Date(p.date).getTime();

const EARLIER_CAP = 4;

type Status = PrayerRecord['status']; // 'pending' | 'answered' | 'ongoing' | 'unanswered'

// The three marks you can set; the unmarked default is 'pending'.
const MARK_ORDER: Status[] = ['ongoing', 'answered', 'unanswered'];
// Warm tone for a status label (text only).
const STATUS_TONE: Record<Status, string> = {
  pending: 'text-on-surface-variant',
  ongoing: 'text-stage-accent',
  answered: 'text-success',
  unanswered: 'text-error',
};

// Full static class strings for the mark pills so Tailwind's scanner keeps them.
const MARK_ON: Record<Status, string> = {
  pending: '',
  ongoing: 'bg-stage-accent-soft text-stage-accent border-stage-accent/40',
  answered: 'bg-success/10 text-success border-success/40',
  unanswered: 'bg-error/10 text-error border-error/40',
};

const firstNameOf = (name: string) => name.split(' ')[0];

function formatDate(isoString: string) {
  const d = new Date(isoString);
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(d);
}

// ── shared avatar (matches Directory / Dashboard) ──────────────────────
function Avatar({ contact, size = 'md' }: { contact: Contact; size?: 'sm' | 'md' | 'lg' }) {
  const dim = size === 'sm' ? 'w-9 h-9 text-xs' : size === 'lg' ? 'w-14 h-14 text-base' : 'w-12 h-12 text-sm';
  const initials = contact.initials || getUserInitials(contact.name);
  if (contact.avatar) {
    return <img src={contact.avatar} alt={contact.name} className={cn(dim, 'rounded-full object-cover shrink-0')} />;
  }
  return (
    <div
      className={cn(
        dim,
        'rounded-full bg-primary-container text-on-primary-container font-semibold flex items-center justify-center shrink-0',
      )}
    >
      {initials}
    </div>
  );
}

export default function PrayerList() {
  const { user, role } = useAuth();
  const { setSelectedContact } = useLayout();
  const isOperator = hasMinRole(role, 'operator');
  // Clear-prayer (#706): the firestore delete rule for prayers/{id} is
  // isManager (Full-timer + Trainee); mirror that here.
  const isManager = hasMinRole(role, 'manager');
  const navigate = useNavigate();
  const isMobile = useMediaQuery("(max-width: 768px)");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [prayers, setPrayers] = useState<PrayerRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  // Brothers/Sisters filter (#265) — filter the roster by the contact's gender.
  const [genderFilter, setGenderFilter] = useState<'all' | 'brothers' | 'sisters'>('all');

  const [hiddenIds, setHiddenIds] = useState<Set<string>>(() => {
    try {
      const s = localStorage.getItem('cisa.prayer.hidden');
      if (s) return new Set(JSON.parse(s));
    } catch (e) {}
    return new Set();
  });

  // Team for the "make a to-do" affordance — who can be assigned the follow-up.
  const [team, setTeam] = useState<TodoPerson[]>([]);
  const [todoFor, setTodoFor] = useState<{ prayer: PrayerRecord; contact: Contact } | null>(null);

  // Clear state before handleFirestoreError (which throws), so the skeleton always
  // clears and the failure surfaces instead of a stuck/partial view.
  const onLoadError = (e: unknown, path: string) => {
    setError('the prayer list');
    setLoading(false);
    handleFirestoreError(e, OperationType.LIST, path);
  };

  // Contacts we've started holding this session that have no prayer yet.
  const [startedIds, setStartedIds] = useState<Set<string>>(new Set());
  // A contact whose this-week compose should auto-open (just started holding).
  const [composeFor, setComposeFor] = useState<string | null>(null);
  // Contact whose full profile/history is open in the modal.
  const [profileContact, setProfileContact] = useState<Contact | null>(null);
  // Whether the "Choose people" picker is open.
  const [picking, setPicking] = useState(false);
  const { language, t } = useLanguage();

  // Warm the translation cache for visible prayer text when Spanish is active.
  useEffect(() => {
    if (language !== 'es') return;
    void prefetchTranslations(
      prayers.flatMap((p) => [p.burden, p.answer]),
      language,
    );
  }, [prayers, language]);

  // Load contacts
  useEffect(() => {
    const q = query(collection(db, 'contacts'), orderBy('name', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const contactData = snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as Contact[];
      setContacts(contactData);
    }, (e) => onLoadError(e, 'contacts'));
    return () => unsubscribe();
  }, []);

  // Load team for the "make a to-do" affordance.
  useEffect(() => {
    const q = query(collection(db, 'users'));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) =>
        setTeam(
          snapshot.docs
            .map((d) => ({ uid: d.id, ...(d.data() as { approved?: boolean; displayName?: string; photoURL?: string; role?: string }) }))
            .filter((u) => u.approved !== false && !!u.displayName && !isServiceAccountName(u.displayName))
            .map((u) => ({ uid: u.uid, name: u.displayName as string, photoURL: u.photoURL, role: u.role }) as TodoPerson)
            .sort((a, b) => a.name.localeCompare(b.name)),
        ),
      (e) => onLoadError(e, 'users'),
    );
    return () => unsubscribe();
  }, []);

  // Load prayers (with legacy mapping)
  useEffect(() => {
    const q = query(collection(db, 'prayers'), orderBy('date', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const prayerData: PrayerRecord[] = [];
      snapshot.docs.forEach((d) => {
        const data = d.data();
        if (data.date && data.burden) {
          prayerData.push({ id: d.id, ...data } as PrayerRecord);
        } else if (data.prayedFor) {
          // Legacy mapping
          prayerData.push({
            id: d.id,
            contactId: data.contactId,
            date: data.updatedAt || new Date().toISOString(),
            burden: data.prayedFor,
            status: data.unanswered ? 'unanswered' : 'pending',
            updatedAt: data.updatedAt || new Date().toISOString(),
            updatedBy: data.updatedBy,
            updatedByName: data.updatedByName,
          } as PrayerRecord);
        }
      });
      setPrayers(prayerData);
      setLoading(false);
    }, (e) => onLoadError(e, 'prayers'));
    return () => unsubscribe();
  }, []);

  const contactName = (contactId: string) => contacts.find((c) => c.id === contactId)?.name || 'someone';

  const stamp = () => ({
    updatedAt: new Date().toISOString(),
    updatedBy: user?.uid,
    updatedByName: user?.displayName || user?.email?.split('@')[0],
  });

  // Remove a contact from the hidden set (React state + localStorage).
  // Extracted so both startHolding and handleAddBurden can reuse it.
  const unhideContact = (contactId: string) => {
    setHiddenIds((prev) => {
      const next = new Set(prev);
      next.delete(contactId);
      try {
        localStorage.setItem('cisa.prayer.hidden', JSON.stringify([...next]));
      } catch (e) {}
      return next;
    });
  };

  const handleAddBurden = async (contactId: string, burden: string): Promise<boolean> => {
    const text = burden.trim();
    if (!contactId || !text) return false;
    try {
      await addDoc(collection(db, 'prayers'), {
        contactId,
        date: new Date().toISOString(),
        burden: text,
        status: 'pending',
        prayerPage: true,
        ...stamp(),
      } as Omit<PrayerRecord, 'id'>);
      logActivity({
        action: 'added a prayer burden for',
        targetId: contactId,
        targetName: contactName(contactId),
        targetType: 'contact',
        type: 'comment',
        description: text,
      });
      // Auto-unhide the contact so they appear in the roster (#565)
      unhideContact(contactId);
      return true;
    } catch (error) {
      console.error('Error adding burden:', error);
      return false;
    }
  };

  const handleUpdateStatus = async (
    prayer: PrayerRecord,
    newStatus: Status,
    answer?: string,
    answeredAt?: string,
    answeredPhotos?: VisitPhoto[],
    archiveReason?: string,
  ) => {
    try {
      const clean: Record<string, any> = { status: newStatus, ...stamp() };
      if (answer !== undefined) clean.answer = answer;
      if (answeredAt !== undefined) clean.answeredAt = answeredAt;
      if (answeredPhotos !== undefined) clean.answeredPhotos = answeredPhotos;
      if (archiveReason !== undefined) clean.archiveReason = archiveReason;
      await updateDoc(doc(db, 'prayers', prayer.id), clean);
      let desc = `Status changed to ${newStatus}`;
      if (newStatus === 'answered' && answer) {
        desc = `Answered: "${answer}"`;
      } else if (newStatus === 'unanswered' && archiveReason) {
        desc = `Archived: "${archiveReason}"`;
      }
      logActivity({
        action: `marked a prayer burden as ${newStatus} for`,
        targetId: prayer.contactId,
        targetName: contactName(prayer.contactId),
        targetType: 'contact',
        type: 'edit',
        description: desc,
      });
    } catch (error) {
      console.error('Error updating status:', error);
    }
  };

  const openTodoFor = (prayer: PrayerRecord) => {
    const contact = contacts.find((c) => c.id === prayer.contactId);
    if (contact) setTodoFor({ prayer, contact });
  };

  const handleUpdateBurden = async (prayer: PrayerRecord, burden: string): Promise<boolean> => {
    const text = burden.trim();
    if (!text) return false;
    if (text === prayer.burden) return true; // no change — fine to close the editor
    try {
      await updateDoc(doc(db, 'prayers', prayer.id), { burden: text, ...stamp() });
      logActivity({
        action: 'edited a prayer burden for',
        targetId: prayer.contactId,
        targetName: contactName(prayer.contactId),
        targetType: 'contact',
        type: 'edit',
        description: text,
      });
      return true;
    } catch (error) {
      console.error('Error editing burden:', error);
      return false;
    }
  };

  // Clear-prayer affordance (#706). Two-beat gesture matching
  // `interactionRemoval.ts`: the row leaves the UI immediately, the
  // Firestore deleteDoc (and audit entry) only commit after the Undo
  // window. Undo cancels the pending delete and the row stays.
  // `getPendingPrayerRemovalIds` lets `visiblePrayers` drop rows the user
  // has already cleared but Firestore hasn't synced yet.
  const [prayersTick, bumpPrayers] = useReducer((n: number) => n + 1, 0);
  useEffect(() => subscribePrayerRemovals(bumpPrayers), []);
  const { undoSnack, showUndoSnack, closeUndoSnack } = useUndoSnack();
  const pendingRemovalIds = useMemo(
    () => new Set(getPendingPrayerRemovalIds()),
    // bumpPrayers makes this re-derive on every registry notification.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [prayersTick],
  );
  const visiblePrayers = useMemo(
    () => prayers.filter((p) => !pendingRemovalIds.has(p.id)),
    [prayers, pendingRemovalIds],
  );
  const contactNameById = useMemo(() => {
    const m = new Map<string, string>();
    contacts.forEach((c) => m.set(c.id, c.name));
    return m;
  }, [contacts]);
  const handleClearPrayer = (prayer: PrayerRecord) => {
    const contactName = contactNameById.get(prayer.contactId) ?? '';
    showUndoSnack(t('prayers.clear_prayer_undone'), () =>
      cancelPrayerRemoval(prayer.id),
    );
    schedulePrayerRemoval(prayer.id, () => {
      void deletePrayerRecord(prayer.id, {
        contactId: prayer.contactId,
        contactName,
        burden: prayer.burden,
      });
    });
  };

  // Most recent prayer dated before this week — the one "last week" surfaces.
  const lastBeforeThisWeek = (ps: PrayerRecord[]) =>
    ps
      .filter((p) => prayerMs(p) < THIS_WEEK_START)
      .sort((a, b) => prayerMs(b) - prayerMs(a))[0] || null;

  // Burdens someone kept to themselves in the phone's log sheet never reach
  // this page — they live on their own contact's Prayer tab. Prayers written
  // before that toggle existed carry no flag and stay here (`isTeamPrayer`).
  const teamPrayers = useMemo(() => visiblePrayers.filter(isTeamPrayer), [visiblePrayers]);

  // One entry per person we're holding (has a prayer, or we just started),
  // sorted by last name then first name — a stable, roster-style order that
  // marking a prayer never disturbs, so no display-order freeze is needed.
  const sortedEntries = useMemo(() => {
    const ids = new Set<string>();
    teamPrayers.forEach((p) => {
      if (!hiddenIds.has(p.contactId)) ids.add(p.contactId);
    });
    startedIds.forEach((id) => {
      if (!hiddenIds.has(id)) ids.add(id);
    });

    const list: { contact: Contact; prayers: PrayerRecord[] }[] = [];
    ids.forEach((id) => {
      const contact = contacts.find((c) => c.id === id);
      if (!contact) return;
      list.push({ contact, prayers: teamPrayers.filter((p) => p.contactId === id) });
    });

    return sortPrayerEntries(list);
  }, [teamPrayers, contacts, startedIds, hiddenIds]);

  const entries = useMemo(() => sortedEntries, [sortedEntries]);

  const filteredEntries = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return entries.filter((e) => {
      if (q) {
        const matches =
          e.contact.name.toLowerCase().includes(q) ||
          e.contact.role?.toLowerCase().includes(q) ||
          e.contact.tags?.some((t) => t.toLowerCase().includes(q));
        if (!matches) return false;
      }
      if (genderFilter === 'all') return true;
      return genderFilter === 'brothers' ? isContactBrother(e.contact) : isContactSister(e.contact);
    });
  }, [entries, searchQuery, genderFilter]);

  // Contacts not yet held that match the search — offer to start holding them.
  const suggestions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    const held = new Set(entries.map((e) => e.contact.id));
    return contacts
      .filter((c) => !held.has(c.id) && c.name.toLowerCase().includes(q))
      .slice(0, 5);
  }, [contacts, entries, searchQuery]);

  const answeredThisYear = useMemo(() => {
    const year = new Date().getFullYear();
    return teamPrayers.filter((p) => {
      if (p.status !== 'answered') return false;
      const when = new Date(p.updatedAt || p.date);
      return when.getFullYear() === year;
    }).length;
  }, [teamPrayers]);

  const awaiting = useMemo(
    () => entries.filter((e) => lastBeforeThisWeek(e.prayers)?.status === 'pending').length,
    [entries],
  );

  const startHolding = (contact: Contact) => {
    setStartedIds((prev) => new Set(prev).add(contact.id));
    unhideContact(contact.id);
    setComposeFor(contact.id);
    setSearchQuery('');
  };

  const stopHolding = (contactId: string) => {
    setHiddenIds((prev) => {
      const next = new Set(prev);
      next.add(contactId);
      try {
        localStorage.setItem('cisa.prayer.hidden', JSON.stringify([...next]));
      } catch (e) {}
      return next;
    });
  };

  // Taking someone off the page (#715). Nothing is deleted — the id joins the
  // `cisa.prayer.hidden` set in this browser, the same bookkeeping "Choose
  // people" does when you untick a name — so it happens at once and the Undo
  // snackbar holds the way back, rather than costing every removal a confirm.
  const removeFromPrayerList = (contact: Contact) => {
    stopHolding(contact.id);
    showUndoSnack(
      t('prayers.removed_from_your_list').replace('{name}', firstNameOf(contact.name)),
      () => unhideContact(contact.id),
    );
  };

  // "Choose people" — the added become empty this-week composers; the removed
  // are hidden from the page (same bookkeeping as startHolding/stopHolding).
  const applyPick = (added: string[], removed: string[]) => {
    if (added.length) setStartedIds((prev) => new Set([...prev, ...added]));
    if (added.length || removed.length) {
      setHiddenIds((prev) => {
        const next = new Set(prev);
        removed.forEach((id) => next.add(id));
        added.forEach((id) => next.delete(id));
        try {
          localStorage.setItem('cisa.prayer.hidden', JSON.stringify([...next]));
        } catch (e) {}
        return next;
      });
    }
    setPicking(false);
    setSearchQuery('');
  };

  if (error) {
    return <DataLoadError label={error} />;
  }

  if (loading && contacts.length === 0) {
    return (
      <PageContainer variant="wide" className="flex flex-col gap-8">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-5 w-full max-w-md opacity-70" />
        <div className="flex flex-col gap-4">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-40 w-full rounded-2xl" />
          ))}
        </div>
      </PageContainer>
    );
  }

  const openContact = (contact: Contact) => {
    setSelectedContact(contact);
    setProfileContact(contact);
  };

  if (isMobile && !loading && !error) {
    return (
      <>
        <PrayerListMobile
          contacts={contacts}
          prayers={teamPrayers}
          entries={filteredEntries}
          team={team}
          suggestions={suggestions}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          genderFilter={genderFilter}
          setGenderFilter={setGenderFilter}
          startHolding={startHolding}
          onAddBurden={handleAddBurden}
          onUpdateStatus={handleUpdateStatus}
          onUpdateBurden={handleUpdateBurden}
          onOpenContact={openContact}
          answeredThisYear={answeredThisYear}
          awaiting={awaiting}
          composeFor={composeFor}
          setComposeFor={setComposeFor}
          onRemoveFromPrayerList={removeFromPrayerList}
          isOperator={isOperator}
          onMakeTodo={openTodoFor}
          isManager={isManager}
          onClearPrayer={handleClearPrayer}
         />
        <ContactDetailsModal
          isOpen={!!profileContact}
          onClose={() => setProfileContact(null)}
          contact={profileContact}
        />
        {todoFor && (
          <FromEntryTodoComposer
            text={todoFor.prayer.burden}
            contactId={todoFor.contact.id}
            contactName={todoFor.contact.name}
            source={{ interactionId: todoFor.prayer.id, interactionTitle: t('prayers.prayer_for_name').replace('{name}', todoFor.contact.name.split(' ')[0]) }}
            team={team}
            meUid={user?.uid ?? ''}
            meName={user?.displayName || user?.email?.split('@')[0] || t('prayers.someone')}
            onClose={() => setTodoFor(null)}
          />
        )}
        <UndoSnackbar undoSnack={undoSnack} onClose={closeUndoSnack} />
       </>
    );
  }

  return (
    <PageContainer variant="wide">
      {/* Header */}
      <header className="ans-head">
        <div className="ans-eyebrow">
          <span className="ans-lit" /> {t('answered.on_our_hearts')}
        </div>
        <div className="ans-head-row">
          <div>
            <h1 className="ans-h1">{t('nav.prayers')}</h1>
            <p className="ans-sub text-base text-on-surface-variant leading-relaxed mt-2 max-w-2xl">
              <span className="text-success font-medium">{answeredThisYear}</span>{' '}
              {answeredThisYear === 1 ? t('prayers.answered_this_year_one') : t('prayers.answered_this_year_many')}.
              {awaiting > 0 && (
                <span className="text-on-surface-variant/70">
                  {' '}
                  {awaiting} {awaiting === 1 ? t('prayers.awaiting_update_one_below') : t('prayers.awaiting_update_many_below')}
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="ans-toggle">
          <button className="ans-toggle-opt on">{t('nav.prayers')}</button>
          <button className="ans-toggle-opt" onClick={() => navigate('/answered')}>
            {t('answered.title')}
          </button>
        </div>
      </header>

      {/* Search + choose people */}
      <div className="flex items-center gap-3 mb-6">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant" />
          <input
            type="text"
            placeholder={t('prayers.find_someone')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 pr-4 h-11 w-full rounded-full bg-surface border border-outline-variant focus:border-primary outline-none transition-colors text-sm text-on-surface placeholder:text-on-surface-variant/60"
          />
        </div>
        <div className="flex items-center gap-1 rounded-full border border-outline-variant bg-surface p-1 shrink-0">
          {(['all', 'brothers', 'sisters'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setGenderFilter(v)}
              className={cn(
                'px-3 h-8 rounded-full text-[13px] font-medium transition-colors cursor-pointer',
                genderFilter === v
                  ? 'bg-primary text-on-primary'
                  : 'text-on-surface-variant hover:text-on-surface',
              )}
            >
              {v === 'all' ? t('prayers.all') : v === 'brothers' ? t('prayers.brothers') : t('prayers.sisters')}
            </button>
          ))}
        </div>
        {isOperator && (
          <button
            onClick={() => setPicking(true)}
            className="inline-flex items-center gap-2 px-4 h-11 rounded-full border border-outline-variant hover:border-primary text-sm text-on-surface transition-colors shrink-0"
          >
            <Users className="w-4 h-4" /> {t('prayers.choose_people')}
          </button>
        )}
      </div>

      {/* Start holding suggestions */}
      {isOperator && suggestions.length > 0 && (
        <div className="mb-6 flex flex-wrap gap-2">
          {suggestions.map((c) => (
            <button
              key={c.id}
              onClick={() => startHolding(c)}
              className="inline-flex items-center gap-2 pl-1.5 pr-3.5 py-1.5 rounded-full bg-surface border border-outline-variant hover:border-primary transition-colors text-sm text-on-surface"
            >
              <Avatar contact={c} size="sm" />
              <span>{t('prayers.start_holding').replace('{name}', firstNameOf(c.name))}</span>
            </button>
          ))}
        </div>
      )}

      {/* People we're holding */}
      <div className="flex items-center gap-3 mb-4">
        <span className="font-sans text-[11px]   text-on-surface-variant">
          {t('prayers.people_we_are_holding')}
        </span>
        <span className="font-serif text-sm text-on-surface-variant">{filteredEntries.length}</span>
        <span className="flex-1 h-px bg-outline-variant" />
      </div>

      {filteredEntries.length === 0 ? (
        <div className="text-center py-16">
          <h3 className="font-serif text-xl text-on-surface mb-1">
            {searchQuery
              ? t('prayers.no_matches')
              : genderFilter !== 'all'
                ? genderFilter === 'brothers'
                  ? t('prayers.no_brothers_to_hold_yet')
                  : t('prayers.no_sisters_to_hold_yet')
                : t('prayers.no_one_to_hold')}
          </h3>
          <p className="text-sm text-on-surface-variant">
            {searchQuery
              ? t('prayers.try_another_name')
              : genderFilter !== 'all'
                ? t('prayers.try_all_to_see')
                : t('prayers.find_person_above')}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <AnimatePresence initial={false}>
            {filteredEntries.map((e) => (
              <PrayerThread
                key={e.contact.id}
                contact={e.contact}
                prayers={e.prayers}
                team={team}
                autoCompose={composeFor === e.contact.id}
                onAddBurden={handleAddBurden}
                onUpdateStatus={handleUpdateStatus}
                onUpdateBurden={handleUpdateBurden}
                onOpenProfile={() => openContact(e.contact)}
                onRemoveFromPrayerList={removeFromPrayerList}
                isOperator={isOperator}
                onMakeTodo={openTodoFor}
                meUid={user?.uid ?? ''}
                isManager={isManager}
               />
            ))}
          </AnimatePresence>
        </div>
      )}

      <ContactDetailsModal
        isOpen={!!profileContact}
        onClose={() => setProfileContact(null)}
        contact={profileContact}
      />

      {picking && (
        <PickHeldModal
          contacts={contacts}
          heldIds={entries.map((e) => e.contact.id)}
          onClose={() => setPicking(false)}
          onApply={applyPick}
        />
      )}

      {todoFor && (
        <FromEntryTodoComposer
          text={todoFor.prayer.burden}
          contactId={todoFor.contact.id}
          contactName={todoFor.contact.name}
          source={{ interactionId: todoFor.prayer.id, interactionTitle: t('prayers.prayer_for_name').replace('{name}', todoFor.contact.name.split(' ')[0]) }}
          team={team}
          meUid={user?.uid ?? ''}
          meName={user?.displayName || user?.email?.split('@')[0] || t('prayers.someone')}
          onClose={() => setTodoFor(null)}
        />
      )}
      <UndoSnackbar undoSnack={undoSnack} onClose={closeUndoSnack} />
     </PageContainer>
  );
}

// ─────────────────────────────────────────────────────────────────────
//  One person: this week, last week, and everything earlier folded away
// ─────────────────────────────────────────────────────────────────────
function PrayerThread({
  contact,
  prayers,
  team,
  autoCompose,
  onAddBurden,
  onUpdateStatus,
  onUpdateBurden,
  onOpenProfile,
  onRemoveFromPrayerList,
  isOperator,
  onMakeTodo,
  meUid,
  isManager,
  onClearPrayer,
}: {
  contact: Contact;
  prayers: PrayerRecord[];
  team?: TodoPerson[];
  autoCompose: boolean;
  onAddBurden: (contactId: string, text: string) => Promise<boolean>;
  onUpdateStatus: (prayer: PrayerRecord, status: Status, answer?: string, answeredAt?: string, answeredPhotos?: VisitPhoto[], archiveReason?: string) => void;
  onUpdateBurden: (prayer: PrayerRecord, text: string) => Promise<boolean>;
  onOpenProfile: () => void;
  onRemoveFromPrayerList: (contact: Contact) => void;
  isOperator: boolean;
  onMakeTodo?: (prayer: PrayerRecord) => void;
  meUid?: string;
  isManager: boolean;
  onClearPrayer?: (prayer: PrayerRecord) => void;
}) {
  const { t } = useLanguage();
  const { openLogInteraction } = useLayout();
   const [showEarlier, setShowEarlier] = useState(false);

  const isStale = isContactStale(contact);
  const daysSinceInteraction = getDaysSinceLastInteraction(contact);

  const caregiver = getContactCaregiver(contact, team);
  const addedBy = getContactAddedBy(contact, team);

  const sorted = useMemo(() => [...prayers].sort((a, b) => prayerMs(b) - prayerMs(a)), [prayers]);
  const weekItem = sorted.find((p) => prayerMs(p) >= THIS_WEEK_START && prayerMs(p) < THIS_WEEK_END) || null;
  const rest = sorted.filter((p) => p !== weekItem);
  const lastItem = rest[0] || null;
  const earlier = rest.slice(1);

  const ongoingCount = prayers.filter((p) => p.status === 'ongoing').length;
  const needsMark = !!lastItem && lastItem.status === 'pending';
  const firstName = firstNameOf(contact.name);

  return (
    <motion.article
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="bg-surface border border-outline-variant rounded-3xl p-5 sm:p-6   transition-shadow"
    >
      {/* Header: person + a quiet count of what's still open */}
      <div className="flex items-start gap-4">
        <button
          onClick={onOpenProfile}
          className="flex items-center gap-3 text-left group min-w-0"
          title={t('prayers.open_profile')}
        >
          <Avatar contact={contact} size="lg" />
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="font-serif text-lg text-on-surface leading-tight group-hover:text-accent transition-colors truncate">
                {contact.name}
              </div>
              {isStale && (
                <span
                  data-testid="stale-badge"
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-800 dark:text-amber-300 border border-amber-500/20 shrink-0"
                >
                  <Clock className="w-3 h-3" />
                  {daysSinceInteraction !== null
                    ? t('prayers.no_interaction_days', `No contact in ${daysSinceInteraction}d`).replace('{n}', String(daysSinceInteraction))
                    : t('prayers.no_interaction_recorded', 'No interactions')}
                </span>
              )}
            </div>
            <div className="text-[13px] text-on-surface-variant mt-0.5 truncate">
              {[
                contact.role,
                getContactGrade(contact),
                caregiver ? t('prayers.cared_for_by_name', `Cared for by ${caregiver}`).replace('{name}', caregiver) : undefined,
                addedBy ? t('prayers.added_by_name', `Added by ${addedBy}`).replace('{name}', addedBy) : undefined,
              ].filter(Boolean).join(' · ') || t('directory.unassigned')}
            </div>
          </div>
        </button>
        <div className="ml-auto flex items-center gap-2 shrink-0">
          <div className="text-right">
            <div className={cn(
              'font-serif text-[15px] leading-tight',
              ongoingCount > 0 ? 'text-stage-accent' : prayers.length === 0 ? 'text-on-surface-variant' : 'text-success'
            )}>
              {ongoingCount > 0 ? t('prayers.ongoing_count').replace('{n}', String(ongoingCount)) : prayers.length === 0 ? t('prayers.no_prayers_yet') : t('prayers.all_answered')}
            </div>
            <div className="text-[11.5px] text-on-surface-variant">
              {t('prayers.prayers_in_all').replace('{n}', String(prayers.length)).replace('{unit}', prayers.length === 1 ? t('prayers.prayer') : t('prayers.prayers'))}
            </div>
          </div>
          <RowActions
            label={t('prayers.more_for_name').replace('{name}', contact.name)}
            items={[
              ...buildContactRowActions({
                contact,
                onOpen: onOpenProfile,
                onMakeTodo: () => {
                  const latest = weekItem || lastItem || sorted[0];
                  if (latest) onMakeTodo?.(latest);
                },
                onFollowUp: () => {
                  if (!meUid) return;
                  UserEntityState.markDone(meUid, `contact:${contact.id}`);
                  UserEntityState.markDone(meUid, contact.id);
                },
                hide: ['share'],
              }),
              // This page's own destructive row (#715). Not "Archive": on this
              // page "Archived" already names a prayer's own mark, so archiving
              // read as if it acted on the prayers (#714).
              ...(isOperator
                ? [
                    {
                      id: 'remove-prayer',
                      label: t('prayers.remove_from_prayer_list').replace('{name}', firstName),
                      icon: UserMinus,
                      danger: true,
                      separated: true,
                      onSelect: () => onRemoveFromPrayerList(contact),
                    },
                  ]
                : []),
            ]}
          />
        </div>
      </div>

      {/* Stale Contact Quick Actions */}
      {isStale && isOperator && (
        <div
          data-testid="stale-quick-actions"
          className="mt-3 p-3 bg-surface-container-low/60 rounded-2xl border border-outline-variant/60 flex items-center justify-between gap-3 flex-wrap text-xs"
        >
          <div className="text-on-surface-variant font-medium flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
            <span>
              {daysSinceInteraction !== null
                ? t('prayers.no_interaction_days', `No contact in ${daysSinceInteraction}d`).replace('{n}', String(daysSinceInteraction))
                : t('prayers.no_interaction_recorded', 'No interactions')}
            </span>
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={() => openLogInteraction(contact.id)}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-primary/10 hover:bg-primary/15 text-primary text-xs font-semibold transition-colors"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>{t('prayers.log_interaction', 'Log Interaction')}</span>
            </button>
          </div>
        </div>
      )}

      {/* This week */}
      <div className="mt-5">
        <SectionEyebrow label={t('prayers.this_week')} />
        {weekItem ? (
          <PrayerItem
            prayer={weekItem}
            variant="week"
            onUpdateStatus={onUpdateStatus}
            onUpdateBurden={onUpdateBurden}
            isOperator={isOperator}
            onMakeTodo={onMakeTodo}
            isManager={isManager}
            onClearPrayer={onClearPrayer}
          />
        ) : isOperator ? (
          <AddThisWeek
            firstName={firstName}
            defaultOpen={autoCompose}
            onAdd={(text) => onAddBurden(contact.id, text)}
          />
        ) : (
          <div className="text-sm text-on-surface-variant/60 italic pl-3">
            {t('prayers.no_prayer_this_week')}
          </div>
        )}
      </div>

      {/* Last week — always shown for context, with a mark to update */}
      {lastItem && (
        <div className="mt-5">
          <SectionEyebrow label={t('prayers.last_week')} nudge={needsMark ? t('prayers.needs_update') : undefined} />
          <PrayerItem
            prayer={lastItem}
            variant="last"
            needsMark={needsMark}
            onUpdateStatus={onUpdateStatus}
            onUpdateBurden={onUpdateBurden}
            isOperator={isOperator}
            onMakeTodo={onMakeTodo}
            isManager={isManager}
            onClearPrayer={onClearPrayer}
          />
        </div>
      )}
 
      {/* Earlier — folded away, expands inline (capped) */}
      {earlier.length > 0 && (
        <div className="mt-5">
          <button
            onClick={() => setShowEarlier((v) => !v)}
            className="flex items-center gap-3 w-full group"
          >
            <span
              className={cn(
                'text-on-surface-variant transition-transform duration-[160ms] text-[9px] opacity-70',
                showEarlier && 'rotate-90',
              )}
              aria-hidden
            >
              ▶
            </span>
            <span className="font-sans text-[11px]   text-on-surface-variant group-hover:text-on-surface transition-colors">
              {showEarlier ? t('prayers.hide') : t('prayers.earlier')} — {earlier.length} {earlier.length === 1 ? t('prayers.prayer') : t('prayers.prayers')}
            </span>
            <span className="flex-1 h-px bg-outline-variant" />
          </button>
          {showEarlier && (
            <div className="mt-2">
              {earlier.slice(0, EARLIER_CAP).map((p) => (
                <PrayerItem
                  key={p.id}
                  prayer={p}
                  variant="earlier"
                  onUpdateStatus={onUpdateStatus}
                  onUpdateBurden={onUpdateBurden}
                  isOperator={isOperator}
                  onMakeTodo={onMakeTodo}
                  isManager={isManager}
                  onClearPrayer={onClearPrayer}
                />
              ))}
              {earlier.length > EARLIER_CAP && (
                 <div className="text-[13px] text-on-surface-variant pt-3 pl-1">
                  {earlier.length - EARLIER_CAP} {t('prayers.older')}{' '}
                  {earlier.length - EARLIER_CAP === 1 ? t('prayers.prayer') : t('prayers.prayers')} —{' '}
                  <button onClick={onOpenProfile} className="text-accent hover:underline">
                    {t('prayers.see_full_history').replace('{name}', firstName)}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </motion.article>
  );
}

function SectionEyebrow({ label, nudge }: { label: string; nudge?: string }) {
  return (
    <div className="flex items-center gap-3 mb-2">
      <span className="font-sans text-[11px]   text-on-surface-variant">{label}</span>
      {nudge && (
        <span className="font-sans text-[11px]   text-error">{nudge}</span>
      )}
      <span className="flex-1 h-px bg-outline-variant" />
    </div>
  );
}

// One individual prayer: date, status, inline edit, and a single mark (toggleable).
function PrayerItem({
  prayer,
  variant,
  needsMark,
  onUpdateStatus,
  onUpdateBurden,
  isOperator,
  onMakeTodo,
  isManager,
  onClearPrayer,
}: {
  prayer: PrayerRecord;
  variant: 'week' | 'last' | 'earlier';
  needsMark?: boolean;
  onUpdateStatus: (prayer: PrayerRecord, status: Status, answer?: string, answeredAt?: string, answeredPhotos?: VisitPhoto[], archiveReason?: string) => void;
  onUpdateBurden: (prayer: PrayerRecord, text: string) => Promise<boolean>;
  isOperator: boolean;
  onMakeTodo?: (prayer: PrayerRecord) => void;
  isManager?: boolean;
  onClearPrayer?: (prayer: PrayerRecord) => void;
}) {
  const { t } = useLanguage();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState(prayer.burden);
  const [answering, setAnswering] = useState(false);
  const [howDraft, setHowDraft] = useState(prayer.answer || '');
  const [answerPhotos, setAnswerPhotos] = useState<VisitPhoto[]>(prayer.answeredPhotos || []);
  const [newPhotoFiles, setNewPhotoFiles] = useState<File[]>([]);
  const [savingAnswer, setSavingAnswer] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [archiveReasonDraft, setArchiveReasonDraft] = useState(prayer.archiveReason || '');
  const [savingArchiveReason, setSavingArchiveReason] = useState(false);
  const answerFileRef = useRef<HTMLInputElement>(null);
  const today = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" });

  const startEdit = () => {
    setDraft(prayer.burden);
    setEditing(true);
  };
  const save = async () => {
    setSaving(true);
    const ok = await onUpdateBurden(prayer, draft);
    setSaving(false);
    if (ok) setEditing(false);
  };

  // Answer photos — previews for the files just picked; revoked when the set
  // changes or the item unmounts (same hygiene as LogVisitModal).
  const newPhotoUrls = useMemo(() => newPhotoFiles.map((f) => URL.createObjectURL(f)), [newPhotoFiles]);
  useEffect(() => () => newPhotoUrls.forEach((u) => URL.revokeObjectURL(u)), [newPhotoUrls]);

  const totalAnswerPhotos = answerPhotos.length + newPhotoFiles.length;

  const openAnswerComposer = () => {
    setHowDraft(prayer.answer || '');
    setAnswerPhotos(prayer.answeredPhotos || []);
    setNewPhotoFiles([]);
    setAnswering(true);
  };

  const openArchiveComposer = () => {
    setArchiveReasonDraft(prayer.archiveReason || '');
    setArchiving(true);
  };

  const addAnswerFiles = (files: FileList | null) => {
    if (!files) return;
    const remaining = MAX_ANSWER_PHOTOS - answerPhotos.length - newPhotoFiles.length;
    if (remaining <= 0) return;
    setNewPhotoFiles((prev) => [...prev, ...Array.from(files)].slice(0, remaining));
  };

  const saveAnswer = async () => {
    setSavingAnswer(true);
    let photos = answerPhotos;
    if (newPhotoFiles.length) {
      const uploaded = await uploadPrayerAnswerPhotos(prayer.id, newPhotoFiles);
      photos = [...answerPhotos, ...uploaded];
    }
    onUpdateStatus(prayer, 'answered', howDraft.trim(), prayer.answeredAt || today, photos);
    setSavingAnswer(false);
    setAnswering(false);
  };

  const saveArchiveReason = () => {
    setSavingArchiveReason(true);
    onUpdateStatus(prayer, 'unanswered', undefined, undefined, undefined, archiveReasonDraft.trim());
    setSavingArchiveReason(false);
    setArchiving(false);
  };

  const dimmed = prayer.status === 'answered' || variant === 'earlier';

  return (
    <div
      className={cn(
        'pl-3 border-l-2',
        variant === 'week'
          ? 'border-l-primary'
          : prayer.status === 'answered'
            ? 'border-l-success/50'
            : 'border-l-outline-variant',
      )}
    >
      <div className="flex items-baseline gap-3 flex-wrap">
        <span className="text-[13px] text-on-surface-variant">{formatDate(prayer.date)}</span>
        {prayer.status !== 'pending' ? (
          <span className={cn('text-[10.5px]   font-semibold', STATUS_TONE[prayer.status])}>
            {t('prayers.status_' + prayer.status)}
          </span>
        ) : variant !== 'week' ? (
          <span className="text-[10.5px]   font-semibold text-on-surface-variant/70">
            {t('prayers.status_pending')}
          </span>
        ) : null}
        {!editing && isOperator && (
          <button onClick={startEdit} className="text-[13px] text-on-surface-variant hover:text-accent transition-colors ml-auto">
            {t('actions.edit')}
          </button>
        )}
        {!editing && onMakeTodo && (
          <button
            onClick={() => onMakeTodo(prayer)}
            title={t('prayers.make_todo_from_prayer')}
            className="text-[13px] text-on-surface-variant hover:text-accent transition-colors"
          >
            {t('prayers.make_a_todo')}
          </button>
        )}
        {!editing && isManager && onClearPrayer && (
          <button
            onClick={() => onClearPrayer(prayer)}
            title={t('prayers.clear_prayer')}
            className="inline-flex items-center gap-1 text-[13px] text-on-surface-variant hover:text-error transition-colors prt-prayer-clear"
          >
            <Trash2 className="w-3 h-3" />
            <span>{t('prayers.clear_prayer')}</span>
          </button>
        )}
      </div>

      {editing ? (
        <div className="mt-2">
          <textarea
            autoFocus
            rows={3}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="w-full p-3 rounded-xl bg-surface-container-low border border-outline-variant focus:border-primary outline-none transition-colors text-sm text-on-surface resize-none"
          />
          <div className="mt-2 flex gap-2">
            <button
              onClick={save}
              disabled={!draft.trim() || saving}
              className="px-4 py-1.5 rounded-full bg-primary text-on-primary text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {saving ? t('prayers.saving') : t('actions.save')}
            </button>
            <button
              onClick={() => {
                setDraft(prayer.burden);
                setEditing(false);
              }}
              className="px-4 py-1.5 rounded-full text-sm text-on-surface-variant hover:text-on-surface transition-colors"
            >
              {t('actions.cancel')}
            </button>
          </div>
        </div>
      ) : (
        <p className={cn('text-sm leading-relaxed mt-1.5 whitespace-pre-wrap', dimmed ? 'text-on-surface-variant' : 'text-on-surface')}>
          <Translate text={prayer.burden} />
        </p>
      )}

      {/* Answer testimony display */}
      {!editing && !answering && prayer.status === 'answered' && (prayer.answer || prayer.answeredAt) && (
        <div className="mt-2 text-sm bg-success/5 border border-success/15 rounded-xl p-3 max-w-xl">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-success  ">
              {t('prayers.status_answered')}{prayer.answeredAt ? ` · ${prayer.answeredAt}` : ""}
            </span>
            {isOperator && (
              <button
                onClick={openAnswerComposer}
                className="text-[11px] text-on-surface-variant hover:text-accent font-medium"
              >
                {t('prayers.edit_testimony')}
              </button>
            )}
          </div>
          {prayer.answer && (
            <p className="font-serif text-[15px] text-on-surface mt-1 leading-relaxed italic">
              "<Translate text={prayer.answer} />"
            </p>
          )}
          {(prayer.answeredPhotos || []).length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {prayer.answeredPhotos!.map((ph) =>
                ph.url ? (
                  <img
                    key={ph.path}
                    src={ph.url}
                    alt={ph.name || 'photo'}
                    className="w-16 h-16 object-cover rounded-lg border border-outline-variant"
                  />
                ) : (
                  <span
                    key={ph.path}
                    title={ph.name}
                    className="w-16 h-16 grid place-items-center rounded-lg border border-outline-variant text-on-surface-variant"
                  >
                    <ImageIcon className="w-4 h-4" />
                  </span>
                ),
              )}
            </div>
          )}
        </div>
      )}

      {/* Archive reason display */}
      {!editing && !archiving && prayer.status === 'unanswered' && prayer.archiveReason && (
        <div className="mt-2 text-sm bg-surface-variant/40 border border-outline-variant/60 rounded-xl p-3 max-w-xl">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-on-surface-variant">
              {t('prayers.archive_reason', 'Archive reason')}
            </span>
            {isOperator && (
              <button
                onClick={openArchiveComposer}
                className="text-[11px] text-on-surface-variant hover:text-accent font-medium"
              >
                {t('prayers.edit_archive_reason', 'Edit Reason')}
              </button>
            )}
          </div>
          <p className="font-serif text-[15px] text-on-surface mt-1 leading-relaxed italic">
            "<Translate text={prayer.archiveReason} />"
          </p>
        </div>
      )}

      {/* Testimony compose box */}
      {answering && (
        <div className="mt-3 p-3 bg-surface-variant/30 rounded-2xl border border-outline-variant max-w-xl">
          <label className="block text-[11px]   font-semibold text-on-surface-variant mb-1">
            {t('prayers.how_was_it_answered')}
          </label>
          <textarea
            className="w-full p-2.5 rounded-xl bg-surface border border-outline-variant focus:border-primary outline-none text-sm text-on-surface resize-none"
            autoFocus
            rows={2}
            value={howDraft}
            onChange={(e) => setHowDraft(e.target.value)}
            placeholder={t('prayers.answer_placeholder')}
          />
          <button
            type="button"
            onClick={() => answerFileRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              addAnswerFiles(e.dataTransfer.files);
            }}
            className="mt-2 w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-dashed border-outline-variant text-xs text-on-surface-variant hover:border-primary hover:text-on-surface transition-colors"
          >
            <ImageIcon className="w-4 h-4" />
            {totalAnswerPhotos
              ? t('prayers.photo_count_add_another')
                  .replace('{count}', String(totalAnswerPhotos))
                  .replace('{unit}', totalAnswerPhotos === 1 ? t('prayers.photo') : t('prayers.photos'))
              : t('prayers.add_photo_optional')}
          </button>
          <input
            ref={answerFileRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            data-testid="prayer-answer-photo-input"
            onChange={(e) => addAnswerFiles(e.target.files)}
          />
          {totalAnswerPhotos > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {answerPhotos.map((ph) => (
                <span key={ph.path} className="relative">
                  <img
                    src={ph.url}
                    alt={ph.name || 'photo'}
                    className="w-16 h-16 object-cover rounded-lg border border-outline-variant"
                  />
                  <button
                    onClick={() => setAnswerPhotos((x) => x.filter((y) => y.path !== ph.path))}
                    aria-label={t('prayers.remove_photo').replace('{name}', ph.name || t('prayers.photo'))}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 grid place-items-center rounded-full bg-surface border border-outline-variant text-on-surface-variant hover:text-error transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
              {newPhotoFiles.map((f, i) => (
                <span key={`${f.name}-${i}`} className="relative">
                  <img
                    src={newPhotoUrls[i]}
                    alt={f.name}
                    className="w-16 h-16 object-cover rounded-lg border border-primary/30"
                  />
                  <button
                    onClick={() => setNewPhotoFiles((x) => x.filter((_, j) => j !== i))}
                    aria-label={t('prayers.remove_photo').replace('{name}', f.name)}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 grid place-items-center rounded-full bg-surface border border-outline-variant text-on-surface-variant hover:text-error transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              className="px-3 py-1 rounded-full text-xs text-on-surface-variant hover:bg-surface-variant"
              onClick={() => setAnswering(false)}
            >
              {t('prayers.skip')}
            </button>
            <button
              type="button"
              className="px-3 py-1 rounded-full text-xs bg-primary text-on-primary disabled:opacity-50"
              disabled={savingAnswer}
              onClick={saveAnswer}
            >
              {savingAnswer ? t('prayers.saving') : t('actions.save')}
            </button>
          </div>
        </div>
      )}

      {/* Archive reason compose box */}
      {archiving && (
        <div className="mt-3 p-3 bg-surface-variant/30 rounded-2xl border border-outline-variant max-w-xl">
          <label className="block text-[11px]   font-semibold text-on-surface-variant mb-1">
            {t('prayers.why_is_it_archived', 'Why is this archived?')}
          </label>
          <textarea
            className="w-full p-2.5 rounded-xl bg-surface border border-outline-variant focus:border-primary outline-none text-sm text-on-surface resize-none"
            autoFocus
            rows={2}
            value={archiveReasonDraft}
            onChange={(e) => setArchiveReasonDraft(e.target.value)}
            placeholder={t('prayers.archive_reason_placeholder', 'A note on why this is archived (optional)')}
          />
          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              className="px-3 py-1 rounded-full text-xs text-on-surface-variant hover:bg-surface-variant"
              onClick={() => setArchiving(false)}
            >
              {t('prayers.skip')}
            </button>
            <button
              type="button"
              className="px-3 py-1 rounded-full text-xs bg-primary text-on-primary disabled:opacity-50"
              disabled={savingArchiveReason}
              onClick={saveArchiveReason}
            >
              {savingArchiveReason ? t('prayers.saving') : t('actions.save')}
            </button>
          </div>
        </div>
      )}

      {/* Mark */}
      {isOperator && (
        <div className="mt-2.5 flex items-center gap-2.5 flex-wrap">
          <span className="text-[11.5px] text-on-surface-variant">
            {variant === 'last' && needsMark ? t('prayers.where_did_it_land') : t('prayers.mark')}
          </span>
          <div className="flex gap-1.5 flex-wrap">
            {MARK_ORDER.map((s) => (
              <button
                key={s}
                onClick={() => {
                  if (s === 'answered') {
                    setArchiving(false);
                    if (prayer.status === 'answered') {
                      onUpdateStatus(prayer, 'pending', undefined, undefined);
                      setAnswering(false);
                    } else {
                      onUpdateStatus(prayer, 'answered', prayer.answer || undefined, prayer.answeredAt || today);
                      if (!prayer.answer) {
                        openAnswerComposer();
                      }
                    }
                  } else if (s === 'unanswered') {
                    setAnswering(false);
                    if (prayer.status === 'unanswered') {
                      onUpdateStatus(prayer, 'pending', undefined, undefined);
                      setArchiving(false);
                    } else {
                      onUpdateStatus(prayer, 'unanswered', undefined, undefined, undefined, prayer.archiveReason || undefined);
                      if (!prayer.archiveReason) {
                        openArchiveComposer();
                      }
                    }
                  } else {
                    setAnswering(false);
                    setArchiving(false);
                    onUpdateStatus(prayer, prayer.status === s ? 'pending' : s, undefined, undefined);
                  }
                }}
                className={cn(
                  'text-xs px-2.5 py-1 rounded-full border transition-colors',
                  prayer.status === s
                    ? MARK_ON[s]
                    : 'border-outline-variant text-on-surface-variant hover:text-on-surface hover:border-outline',
                )}
              >
                {t('prayers.status_' + s)}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Empty state for the week: a quiet invitation to write what we're holding.
function AddThisWeek({
  firstName,
  defaultOpen,
  onAdd,
}: {
  firstName: string;
  defaultOpen?: boolean;
  onAdd: (text: string) => Promise<boolean>;
}) {
  const { t: translate } = useLanguage();
  const [open, setOpen] = useState(!!defaultOpen);
  const [saving, setSaving] = useState(false);
  const [val, setVal] = useState('');

  const save = async () => {
    const textValue = val.trim();
    if (!textValue) return;
    setSaving(true);
    const ok = await onAdd(textValue);
    setSaving(false);
    if (ok) {
      setVal('');
      setOpen(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 w-full px-4 py-3 rounded-xl border border-dashed border-outline-variant hover:border-primary text-sm text-on-surface-variant hover:text-on-surface transition-colors"
      >
        <Plus className="w-4 h-4 shrink-0" />
        <span>{translate('prayers.write_what_holding').replace('{name}', firstName)}</span>
      </button>
    );
  }

  return (
    <div>
      <textarea
        autoFocus
        rows={3}
        value={val}
        onChange={(e) => setVal(e.target.value)}
        placeholder={translate('prayers.what_praying_for').replace('{name}', firstName)}
        className="w-full p-3 rounded-xl bg-surface-container-low border border-outline-variant focus:border-primary outline-none transition-colors text-sm text-on-surface resize-none"
      />
      <div className="mt-2 flex gap-2">
        <button
          onClick={save}
          disabled={!val.trim() || saving}
          className="px-4 py-1.5 rounded-full bg-primary text-on-primary text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {saving ? translate('prayers.adding') : translate('prayers.add_prayer')}
        </button>
        <button
          onClick={() => {
            setVal('');
            setOpen(false);
          }}
          className="px-4 py-1.5 rounded-full text-sm text-on-surface-variant hover:text-on-surface transition-colors"
        >
          {translate('actions.cancel')}
        </button>
      </div>
    </div>
  );
}

// ── "Choose people" — tick who shows up on this page (design PickHeldModal) ──
function PickHeldModal({
  contacts,
  heldIds,
  onClose,
  onApply,
}: {
  contacts: Contact[];
  heldIds: string[];
  onClose: () => void;
  onApply: (added: string[], removed: string[]) => void;
}) {
  const { t } = useLanguage();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<string[]>(() => heldIds.slice());

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const list = useMemo(() => {
    const sorted = [...contacts].sort((a, b) => a.name.localeCompare(b.name));
    const needle = q.trim().toLowerCase();
    if (!needle) return sorted;
    return sorted.filter((c) =>
      `${c.name} ${c.role || ''} ${(c.tags || []).join(' ')}`.toLowerCase().includes(needle),
    );
  }, [contacts, q]);

  const toggle = (id: string) =>
    setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const added = sel.filter((id) => !heldIds.includes(id));
  const removed = heldIds.filter((id) => !sel.includes(id));
  const changed = added.length + removed.length;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t('prayers.who_are_we_holding')}
    >
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md max-h-[85vh] bg-surface-container rounded-[2rem] shadow-2xl border border-outline-variant flex flex-col overflow-hidden">
        <div className="p-6 border-b border-outline-variant bg-surface-container-high/50">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="font-serif text-2xl text-on-surface">{t('prayers.who_are_we_holding')}</h2>
              <p className="text-xs text-on-surface-variant mt-1">{t('prayers.tick_people_you_want')}</p>
            </div>
            <button
              onClick={onClose}
              aria-label={t('actions.close')}
              className="p-2 rounded-full hover:bg-surface-variant transition-colors shrink-0"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="relative mt-4">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant" />
            <input
              autoFocus
              type="text"
              placeholder={t('prayers.search_people_you_know')}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="pl-10 pr-4 h-11 w-full rounded-full bg-surface border border-outline-variant focus:border-primary outline-none transition-colors text-sm text-on-surface placeholder:text-on-surface-variant/60"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3">
          {list.length === 0 && (
            <p className="text-center py-6 text-xs text-on-surface-variant italic">{t('prayers.no_one_matches_name')}</p>
          )}
          {list.map((c) => {
            const checked = sel.includes(c.id);
            const wasHeld = heldIds.includes(c.id);
            return (
              <button
                key={c.id}
                onClick={() => toggle(c.id)}
                aria-pressed={checked}
                className="w-full flex items-center gap-3 px-2.5 py-2.5 rounded-xl hover:bg-surface-variant text-left transition-colors"
              >
                <span
                  className={cn(
                    'w-5 h-5 rounded border flex items-center justify-center shrink-0 transition-colors',
                    checked ? 'bg-primary border-primary text-on-primary' : 'border-outline-variant',
                  )}
                >
                  {checked && <Check className="w-3 h-3" />}
                </span>
                <Avatar contact={c} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-on-surface truncate">{c.name}</span>
                  <span className="block text-xs text-on-surface-variant truncate mt-0.5">
                    {[c.role].filter(Boolean).join(' · ')}
                  </span>
                </span>
                {wasHeld && <span className="text-[11px] text-on-surface-variant shrink-0">{t('prayers.already_held')}</span>}
              </button>
            );
          })}
        </div>

        <div className="p-4 border-t border-outline-variant flex items-center gap-3 bg-surface-container-high/50">
          <span className="text-xs text-on-surface-variant">
            {t('prayers.people_on_our_hearts')
              .replace('{count}', String(sel.length))
              .replace('{unit}', sel.length === 1 ? t('prayers.person') : t('prayers.people'))}
            {changed > 0 && (
              <span className="text-accent font-medium">
                {added.length > 0 ? ` · +${added.length}` : ''}
                {removed.length > 0 ? ` · −${removed.length}` : ''}
              </span>
            )}
          </span>
          <button
            onClick={onClose}
            className="ml-auto px-4 py-2 rounded-full text-sm text-on-surface-variant hover:text-on-surface transition-colors"
          >
            {t('actions.cancel')}
          </button>
          <button
            onClick={() => onApply(added, removed)}
            disabled={!changed}
            className="px-5 py-2 rounded-full bg-primary text-on-primary text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
          >
            {t('actions.save')}
          </button>
        </div>
      </div>
    </div>
  );
}
