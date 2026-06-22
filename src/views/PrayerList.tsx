import React, { useState, useEffect, useMemo } from 'react';
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
import { Contact, PrayerRecord } from '../types';
import { Search, Plus } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn, getUserInitials } from '../lib/utils';
import { useAuth } from '../components/AuthProvider';
import { Skeleton } from '../components/ui/Skeleton';
import { DataLoadError } from '../components/ui/DataLoadError';
import ContactDetailsModal from '../components/modals/ContactDetailsModal';

// ── week math, relative to today (Monday = start of week) ──────────────
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
const STATUS_LABEL: Record<Status, string> = {
  pending: 'Unmarked',
  ongoing: 'Ongoing',
  answered: 'Answered',
  unanswered: 'Still waiting',
};

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
  const { user } = useAuth();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [prayers, setPrayers] = useState<PrayerRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Clear state before handleFirestoreError (which throws), so the skeleton always
  // clears and the failure surfaces instead of a stuck/partial view.
  const onLoadError = (e: unknown, path: string) => {
    setError('the prayer list');
    setLoading(false);
    handleFirestoreError(e, OperationType.LIST, path);
  };

  // Contacts we've started carrying this session that have no prayer yet.
  const [startedIds, setStartedIds] = useState<Set<string>>(new Set());
  // A contact whose this-week compose should auto-open (just started carrying).
  const [composeFor, setComposeFor] = useState<string | null>(null);
  // Contact whose full profile/history is open in the modal.
  const [profileContact, setProfileContact] = useState<Contact | null>(null);

  // Load contacts
  useEffect(() => {
    const q = query(collection(db, 'contacts'), orderBy('name', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const contactData = snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as Contact[];
      setContacts(contactData);
    }, (e) => onLoadError(e, 'contacts'));
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

  const handleAddBurden = async (contactId: string, burden: string): Promise<boolean> => {
    const text = burden.trim();
    if (!contactId || !text) return false;
    try {
      await addDoc(collection(db, 'prayers'), {
        contactId,
        date: new Date().toISOString(),
        burden: text,
        status: 'pending',
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
      return true;
    } catch (error) {
      console.error('Error adding burden:', error);
      return false;
    }
  };

  const handleUpdateStatus = async (prayer: PrayerRecord, newStatus: Status) => {
    try {
      await updateDoc(doc(db, 'prayers', prayer.id), { status: newStatus, ...stamp() });
      logActivity({
        action: `marked a prayer burden as ${newStatus} for`,
        targetId: prayer.contactId,
        targetName: contactName(prayer.contactId),
        targetType: 'contact',
        type: 'edit',
        description: `Status changed to ${newStatus}`,
      });
    } catch (error) {
      console.error('Error updating status:', error);
    }
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

  // Most recent prayer dated before this week — the one "last week" surfaces.
  const lastBeforeThisWeek = (ps: PrayerRecord[]) =>
    ps
      .filter((p) => prayerMs(p) < THIS_WEEK_START)
      .sort((a, b) => prayerMs(b) - prayerMs(a))[0] || null;

  // One entry per person we're carrying (has a prayer, or we just started).
  const entries = useMemo(() => {
    const ids = new Set<string>();
    prayers.forEach((p) => ids.add(p.contactId));
    startedIds.forEach((id) => ids.add(id));

    const list: { contact: Contact; prayers: PrayerRecord[] }[] = [];
    ids.forEach((id) => {
      const contact = contacts.find((c) => c.id === id);
      if (!contact) return;
      list.push({ contact, prayers: prayers.filter((p) => p.contactId === id) });
    });

    // Needs-attention first (last-week prayer still unmarked), then most recent.
    list.sort((a, b) => {
      const aNeeds = lastBeforeThisWeek(a.prayers)?.status === 'pending' ? 1 : 0;
      const bNeeds = lastBeforeThisWeek(b.prayers)?.status === 'pending' ? 1 : 0;
      if (aNeeds !== bNeeds) return bNeeds - aNeeds;
      const aRecent = a.prayers.length ? Math.max(...a.prayers.map(prayerMs)) : Infinity;
      const bRecent = b.prayers.length ? Math.max(...b.prayers.map(prayerMs)) : Infinity;
      return bRecent - aRecent;
    });
    return list;
  }, [prayers, contacts, startedIds]);

  const filteredEntries = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter(
      (e) =>
        e.contact.name.toLowerCase().includes(q) ||
        e.contact.role?.toLowerCase().includes(q) ||
        e.contact.tags?.some((t) => t.toLowerCase().includes(q)),
    );
  }, [entries, searchQuery]);

  // Contacts not yet carried that match the search — offer to start carrying them.
  const suggestions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    const carried = new Set(entries.map((e) => e.contact.id));
    return contacts
      .filter((c) => !carried.has(c.id) && c.name.toLowerCase().includes(q))
      .slice(0, 5);
  }, [contacts, entries, searchQuery]);

  const answeredThisYear = useMemo(() => {
    const year = new Date().getFullYear();
    return prayers.filter((p) => {
      if (p.status !== 'answered') return false;
      const when = new Date(p.updatedAt || p.date);
      return when.getFullYear() === year;
    }).length;
  }, [prayers]);

  const awaiting = useMemo(
    () => entries.filter((e) => lastBeforeThisWeek(e.prayers)?.status === 'pending').length,
    [entries],
  );

  const startCarrying = (contact: Contact) => {
    setStartedIds((prev) => new Set(prev).add(contact.id));
    setComposeFor(contact.id);
    setSearchQuery('');
  };

  if (error) {
    return <DataLoadError label={error} />;
  }

  if (loading && contacts.length === 0) {
    return (
      <div className="p-6 md:p-8 max-w-5xl flex flex-col gap-8">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-5 w-full max-w-md opacity-70" />
        <div className="flex flex-col gap-4">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-40 w-full rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 max-w-5xl">
      {/* Header */}
      <header className="mb-8">
        <h1 className="font-serif text-3xl text-on-surface">Prayer Log</h1>
        <p className="text-base text-on-surface-variant leading-relaxed mt-2 max-w-2xl">
          <span className="text-success font-medium">{answeredThisYear}</span>{' '}
          {answeredThisYear === 1 ? 'prayer' : 'prayers'} answered this year.
          {awaiting > 0 && (
            <span className="text-on-surface-variant/70">
              {' '}
              {awaiting} from last week {awaiting === 1 ? 'still needs' : 'still need'} an update below.
            </span>
          )}
        </p>
      </header>

      {/* Search */}
      <div className="relative mb-6 max-w-sm">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant" />
        <input
          type="text"
          placeholder="Find someone…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10 pr-4 h-11 w-full rounded-full bg-surface border border-outline-variant focus:border-primary outline-none transition-colors text-sm text-on-surface placeholder:text-on-surface-variant/60"
        />
      </div>

      {/* Start carrying suggestions */}
      {suggestions.length > 0 && (
        <div className="mb-6 flex flex-wrap gap-2">
          {suggestions.map((c) => (
            <button
              key={c.id}
              onClick={() => startCarrying(c)}
              className="inline-flex items-center gap-2 pl-1.5 pr-3.5 py-1.5 rounded-full bg-surface border border-outline-variant hover:border-primary transition-colors text-sm text-on-surface"
            >
              <Avatar contact={c} size="sm" />
              <span>Start carrying {firstNameOf(c.name)}</span>
            </button>
          ))}
        </div>
      )}

      {/* People we're carrying */}
      <div className="flex items-center gap-3 mb-4">
        <span className="font-sans text-[11px] uppercase tracking-[0.08em] text-on-surface-variant">
          People we&rsquo;re carrying
        </span>
        <span className="font-serif text-sm text-on-surface-variant">{filteredEntries.length}</span>
        <span className="flex-1 h-px bg-outline-variant" />
      </div>

      {filteredEntries.length === 0 ? (
        <div className="text-center py-16">
          <h3 className="font-serif text-xl text-on-surface mb-1">
            {searchQuery ? 'No one matches that just yet' : 'No one to carry yet'}
          </h3>
          <p className="text-sm text-on-surface-variant">
            {searchQuery
              ? 'Try another name, or start carrying someone above.'
              : 'Find a person above to begin praying for them.'}
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
                autoCompose={composeFor === e.contact.id}
                onAddBurden={handleAddBurden}
                onUpdateStatus={handleUpdateStatus}
                onUpdateBurden={handleUpdateBurden}
                onOpenProfile={() => setProfileContact(e.contact)}
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
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
//  One person: this week, last week, and everything earlier folded away
// ─────────────────────────────────────────────────────────────────────
function PrayerThread({
  contact,
  prayers,
  autoCompose,
  onAddBurden,
  onUpdateStatus,
  onUpdateBurden,
  onOpenProfile,
}: {
  contact: Contact;
  prayers: PrayerRecord[];
  autoCompose: boolean;
  onAddBurden: (contactId: string, text: string) => Promise<boolean>;
  onUpdateStatus: (prayer: PrayerRecord, status: Status) => void;
  onUpdateBurden: (prayer: PrayerRecord, text: string) => Promise<boolean>;
  onOpenProfile: () => void;
}) {
  const [showEarlier, setShowEarlier] = useState(false);

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
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="bg-surface border border-outline-variant rounded-2xl p-5 sm:p-6 shadow-sm hover:shadow-md transition-shadow"
    >
      {/* Header: person + a quiet count of what's still open */}
      <div className="flex items-start gap-4">
        <button
          onClick={onOpenProfile}
          className="flex items-center gap-3 text-left group min-w-0"
          title="Open profile"
        >
          <Avatar contact={contact} size="lg" />
          <div className="min-w-0">
            <div className="font-serif text-lg text-on-surface leading-tight group-hover:text-primary transition-colors truncate">
              {contact.name}
            </div>
            <div className="text-[13px] text-on-surface-variant mt-0.5 truncate">
              {contact.role || 'Unassigned'}
              {contact.tags?.find((t) => t.toLowerCase().includes('year')) && (
                <>
                  <span className="mx-1.5 opacity-50">·</span>
                  {contact.tags.find((t) => t.toLowerCase().includes('year'))}
                </>
              )}
            </div>
          </div>
        </button>
        <div className="ml-auto text-right shrink-0">
          <div className={cn('font-serif text-[15px] leading-tight', ongoingCount > 0 ? 'text-stage-accent' : 'text-success')}>
            {ongoingCount > 0 ? `${ongoingCount} ongoing` : 'At rest'}
          </div>
          <div className="text-[11.5px] text-on-surface-variant">
            {prayers.length} {prayers.length === 1 ? 'prayer' : 'prayers'} in all
          </div>
        </div>
      </div>

      {/* This week */}
      <div className="mt-5">
        <SectionEyebrow label="This week" />
        {weekItem ? (
          <PrayerItem
            prayer={weekItem}
            variant="week"
            onUpdateStatus={onUpdateStatus}
            onUpdateBurden={onUpdateBurden}
          />
        ) : (
          <AddThisWeek
            firstName={firstName}
            defaultOpen={autoCompose}
            onAdd={(text) => onAddBurden(contact.id, text)}
          />
        )}
      </div>

      {/* Last week — always shown for context, with a mark to update */}
      {lastItem && (
        <div className="mt-5">
          <SectionEyebrow label="Last week" nudge={needsMark ? 'Needs an update' : undefined} />
          <PrayerItem
            prayer={lastItem}
            variant="last"
            needsMark={needsMark}
            onUpdateStatus={onUpdateStatus}
            onUpdateBurden={onUpdateBurden}
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
                'text-on-surface-variant transition-transform text-xs',
                showEarlier && 'rotate-90',
              )}
              aria-hidden
            >
              ▶
            </span>
            <span className="font-sans text-[11px] uppercase tracking-[0.08em] text-on-surface-variant group-hover:text-on-surface transition-colors">
              {showEarlier ? 'Hide' : 'Earlier'} — {earlier.length} {earlier.length === 1 ? 'prayer' : 'prayers'}
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
                />
              ))}
              {earlier.length > EARLIER_CAP && (
                <div className="text-[13px] text-on-surface-variant pt-3 pl-1">
                  {earlier.length - EARLIER_CAP} older{' '}
                  {earlier.length - EARLIER_CAP === 1 ? 'prayer' : 'prayers'} —{' '}
                  <button onClick={onOpenProfile} className="text-primary hover:underline">
                    see {firstName}&rsquo;s full history
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
      <span className="font-sans text-[11px] uppercase tracking-[0.08em] text-on-surface-variant">{label}</span>
      {nudge && (
        <span className="font-sans text-[11px] uppercase tracking-[0.08em] text-error">{nudge}</span>
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
}: {
  prayer: PrayerRecord;
  variant: 'week' | 'last' | 'earlier';
  needsMark?: boolean;
  onUpdateStatus: (prayer: PrayerRecord, status: Status) => void;
  onUpdateBurden: (prayer: PrayerRecord, text: string) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState(prayer.burden);

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

  // Toggle: clicking the active mark clears it back to unmarked (pending).
  const mark = (s: Status) => onUpdateStatus(prayer, prayer.status === s ? 'pending' : s);

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
          <span className={cn('text-[10.5px] uppercase tracking-[0.1em] font-semibold', STATUS_TONE[prayer.status])}>
            {STATUS_LABEL[prayer.status]}
          </span>
        ) : variant !== 'week' ? (
          <span className="text-[10.5px] uppercase tracking-[0.1em] font-semibold text-on-surface-variant/70">
            Unmarked
          </span>
        ) : null}
        {!editing && (
          <button onClick={startEdit} className="text-[13px] text-on-surface-variant hover:text-primary transition-colors ml-auto">
            Edit
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
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              onClick={() => {
                setDraft(prayer.burden);
                setEditing(false);
              }}
              className="px-4 py-1.5 rounded-full text-sm text-on-surface-variant hover:text-on-surface transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <p className={cn('text-sm leading-relaxed mt-1.5 whitespace-pre-wrap', dimmed ? 'text-on-surface-variant' : 'text-on-surface')}>
          {prayer.burden}
        </p>
      )}

      {/* Mark */}
      <div className="mt-2.5 flex items-center gap-2.5 flex-wrap">
        <span className="text-[11.5px] text-on-surface-variant">
          {variant === 'last' && needsMark ? 'Where did it land?' : 'Mark'}
        </span>
        <div className="flex gap-1.5 flex-wrap">
          {MARK_ORDER.map((s) => (
            <button
              key={s}
              onClick={() => mark(s)}
              className={cn(
                'text-xs px-2.5 py-1 rounded-full border transition-colors',
                prayer.status === s
                  ? MARK_ON[s]
                  : 'border-outline-variant text-on-surface-variant hover:text-on-surface hover:border-outline',
              )}
            >
              {STATUS_LABEL[s]}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// Empty state for the week: a quiet invitation to write what we're carrying.
function AddThisWeek({
  firstName,
  defaultOpen,
  onAdd,
}: {
  firstName: string;
  defaultOpen?: boolean;
  onAdd: (text: string) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(!!defaultOpen);
  const [saving, setSaving] = useState(false);
  const [val, setVal] = useState('');

  const save = async () => {
    const t = val.trim();
    if (!t) return;
    setSaving(true);
    const ok = await onAdd(t);
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
        <span>Write what we&rsquo;re carrying for {firstName} this week</span>
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
        placeholder={`What are we praying for ${firstName} this week?`}
        className="w-full p-3 rounded-xl bg-surface-container-low border border-outline-variant focus:border-primary outline-none transition-colors text-sm text-on-surface resize-none"
      />
      <div className="mt-2 flex gap-2">
        <button
          onClick={save}
          disabled={!val.trim() || saving}
          className="px-4 py-1.5 rounded-full bg-primary text-on-primary text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {saving ? 'Adding…' : 'Add prayer'}
        </button>
        <button
          onClick={() => {
            setVal('');
            setOpen(false);
          }}
          className="px-4 py-1.5 rounded-full text-sm text-on-surface-variant hover:text-on-surface transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
