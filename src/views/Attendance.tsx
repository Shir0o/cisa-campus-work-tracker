import React, { useState, useEffect, useMemo } from 'react';
import {
  Plus,
  Download,
  FileSpreadsheet,
  Mail,
  Trash2,
  CalendarDays,
  ChevronDown,
  Users,
  Pencil,
  Settings2,
  CheckSquare,
} from 'lucide-react';
import { motion } from 'motion/react';
import { collection, onSnapshot, query, orderBy, doc, updateDoc, deleteDoc, addDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, logActivity } from '../lib/firebase';
import { subscribeEventRsvps } from '../lib/rsvp';
import { useGatheringTypes, seedDefaultGatheringTypesIfEmpty } from '../lib/gatheringTypes';
import { buildContactActivityPatch, shouldTouchActivityForAttendance } from '../lib/contactActivity';
import {
  getSessionRoster,
  calculateMissedContacts,
  getRecurringSeriesEventIdsToUpdate,
} from '../lib/attendanceRoster';
import {
  buildGatheringViewModel,
  type ChipState,
  type OneOffGathering,
  type RhythmRow,
} from '../lib/gatheringViewModel';
import { cn, getUserInitials, isServiceAccountName } from '../lib/utils';
import { useAuth } from '../components/AuthProvider';
import { Contact, Event } from '../types';
import { Skeleton } from '../components/ui/Skeleton';
import { DataLoadError } from '../components/ui/DataLoadError';
import AddEventModal from '../components/modals/AddEventModal';
import EditEventModal from '../components/modals/EditEventModal';
import ManageGatheringTypesModal from '../components/modals/ManageGatheringTypesModal';
import ContactDetailsModal from '../components/modals/ContactDetailsModal';
import SyncSheetModal from '../components/modals/SyncSheetModal';
import FromEntryTodoComposer from '../components/todos/FromEntryTodoComposer';
import type { TodoPerson } from '../lib/todos';
import PageContainer from '../components/layout/PageContainer';
import { format, parseISO, isValid } from 'date-fns';
import { useMediaQuery } from '../lib/useMediaQuery';
import { usePreserveScroll } from '../lib/usePreserveScroll';
import AttendanceMobile from './AttendanceMobile';
import { useLanguage } from '../components/LanguageProvider';
import {
  useCalendarSync,
  calStartOfDay,
  calAddDays,
  canSeeCalendarSync,
  type UnifiedGathering,
  type CalContextItem,
} from '../lib/calendar/calendarSync';

const DAY_MS = 86_400_000;

// Event dates are date-only ('yyyy-MM-dd'); parseISO reads them as LOCAL midnight
// (new Date(...) would treat them as UTC and shift a day in negative-offset zones).
const evtDate = (s?: string | null): Date | null => {
  if (!s) return null;
  const d = parseISO(s);
  return isValid(d) ? d : null;
};
const evtMs = (s?: string | null): number | null => evtDate(s)?.getTime() ?? null;
const isFutureEventDate = (s?: string | null): boolean => {
  const ms = evtMs(s);
  return ms != null && ms > Date.now();
};

/** Stamp `attendanceTakenAt`/`By`/`ById` on the event the first time anyone
 *  records attendance for it. Subsequent edits leave the original stamp
 *  alone. Skips future-dated Gatherings (you can't have taken attendance for
 *  something that hasn't happened). Per ADR 0005, "attendance taken" is a
 *  fact on the Gathering, not a derivation from contact attendance.
 */
async function stampAttendanceTaken(event: Event, by: { uid: string | null; name: string }): Promise<void> {
  if (event.attendanceTakenAt || isFutureEventDate(event.date)) return;
  try {
    await updateDoc(doc(db, 'events', event.id), {
      attendanceTakenAt: new Date().toISOString(),
      attendanceTakenBy: by.name,
      attendanceTakenById: by.uid,
    });
  } catch (e) {
    handleFirestoreError(e, OperationType.UPDATE, `events/${event.id}`);
  }
}
// Read-only "who's coming" count for an upcoming event, fed by member RSVPs.
function RsvpCount({ eventId }: { eventId: string }) {
  const [count, setCount] = useState(0);
  useEffect(() => subscribeEventRsvps(eventId, (rsvps) => setCount(rsvps.length)), [eventId]);
  if (count === 0) return null;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-on-surface-variant whitespace-nowrap shrink-0">
      <Users className="w-3.5 h-3.5" /> {count} going
    </span>
  );
}

// ── shared warm bits (mirror Dashboard.tsx) ──
function Avatar({ contact, size = 'md' }: { contact: Contact; size?: 'sm' | 'md' }) {
  const dim = size === 'sm' ? 'w-8 h-8 text-xs' : 'w-11 h-11 text-sm';
  const initials = contact.initials || getUserInitials(contact.name);
  if (contact.avatar) {
    return (
      <img src={contact.avatar} alt={contact.name} className={cn(dim, 'rounded-full object-cover shrink-0')} />
    );
  }
  return (
    <div
      className={cn(
        dim,
      )}
    >
      {initials}
    </div>
  );
}

function Figure({ n, label }: { n: number | string; label: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-serif text-2xl text-on-surface leading-none">{n}</span>
      <span className="text-xs text-on-surface-variant">{label}</span>
    </div>
  );
}

/** The three figures card, used in both the missed-section sidebar and the
 *  quiet-figures row when nobody has gone quiet. Hairline separators between
 *  figures so each reads as its own line. Same shape in both branches. */
function FiguresCard({
  eventsCount,
  avgPer,
  missedCount,
}: {
  eventsCount: number;
  avgPer: number;
  missedCount: number;
}) {
  return (
    <div className="bg-surface rounded-3xl border border-outline-variant/60 px-6 py-5 divide-y divide-outline-variant/40">
      <div className="pb-3 first:pt-0">
        <Figure n={eventsCount} label="gatherings" />
      </div>
      <div className="py-3">
        <Figure n={avgPer} label="come, on average" />
      </div>
      <div className="py-3">
        <Figure n={missedCount} label="gone quiet" />
      </div>
      <p className="text-sm text-on-surface-variant italic pt-3 mb-0">
        Counting heads is just a way of noticing who's missing.
      </p>
    </div>
  );
}

const SectionHead = ({ title, sub }: { title: string; sub?: string }) => (
  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-4">
    <h2 className="font-serif text-2xl text-on-surface">{title}</h2>
    {sub && <span className="text-sm text-on-surface-variant">{sub}</span>}
  </div>
);

export default function Attendance() {
  const { user, isAdmin } = useAuth();
  const { t } = useLanguage();
  const isMobile = useMediaQuery("(max-width: 768px)");
  const gatheringTypes = useGatheringTypes();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAddEventModalOpen, setIsAddEventModalOpen] = useState(false);
  const [isManageTypesOpen, setIsManageTypesOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<Event | null>(null);
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [typeFilter, setTypeFilter] = useState<string>('All');
  const [openId, setOpenId] = useState<string | null>(null);
  const [team, setTeam] = useState<TodoPerson[]>([]);
  const [todoFor, setTodoFor] = useState<{ contact: Contact; event: Event } | null>(null);

  // Seed the default kinds the first time an admin opens Gatherings (mirrors how
  // OutreachBoard seeds the default stages). One-shot; no-op once any kind exists.
  useEffect(() => {
    if (isAdmin) void seedDefaultGatheringTypesIfEmpty();
  }, [isAdmin]);

  // A filter pointing at a kind that was just renamed/removed falls back to All.
  const activeFilter =
    typeFilter !== 'All' && gatheringTypes.some((t) => t.name === typeFilter) ? typeFilter : 'All';

  useEffect(() => {
    // Clear state before handleFirestoreError (which throws), so the skeleton always
    // clears and the failure surfaces instead of a stuck/partial view.
    const onLoadError = (e: unknown, path: string) => {
      setError('attendance');
      setLoading(false);
      handleFirestoreError(e, OperationType.LIST, path);
    };

    const unsubscribeContacts = onSnapshot(
      collection(db, 'contacts'),
      (snapshot) => {
        setContacts(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as Contact[]);
      },
      (e) => onLoadError(e, 'contacts'),
    );

    const qEvents = query(collection(db, 'events'), orderBy('date', 'asc'), orderBy('order', 'asc'));
    const unsubscribeEvents = onSnapshot(
      qEvents,
      (snapshot) => {
        setEvents(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as Event[]);
        setTimeout(() => setLoading(false), 600);
      },
      (e) => onLoadError(e, 'events'),
    );

    // Team for the "make a to-do" affordance — who can be assigned the check-in.
    const unsubscribeUsers = onSnapshot(
      query(collection(db, 'users')),
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

    return () => {
      unsubscribeContacts();
      unsubscribeEvents();
      unsubscribeUsers();
    };
  }, []);

  const handleExport = () => {
    if (contacts.length === 0 || events.length === 0) return;

    const headers = [t('attendance.csv_name'), t('attendance.csv_role'), ...events.map((e) => `${e.name} (${e.date})`)];
    const rows = contacts.map((c) => [
      c.name,
      c.role,
      ...events.map((e) => {
        const s = c.attendance?.[e.id];
        return s === true ? t('attendance.present') : s === 'late' ? t('attendance.late') : s === 'absent' ? t('attendance.absent') : t('attendance.none');
      }),
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.map((v) => `"${v}"`).join(','))].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `attendance_report_${format(new Date(), 'yyyy-MM-dd')}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDeleteEvent = async (eventId: string, eventName: string) => {
    if (
      !isAdmin ||
      !window.confirm(
        t('attendance.remove_gathering_confirm').replace('{name}', eventName),
      )
    )
      return;

    try {
      await deleteDoc(doc(db, 'events', eventId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `events/${eventId}`);
    }
  };

  // here = present
  const here = (c: Contact, eventId: string) => {
    const s = c.attendance?.[eventId];
    return s === true;
  };

  // Tapping a name cycles present → absent → present.
  // Anyone "missed" (absent or unmarked) jumps to present on first tap.
  // The first record on a Gathering stamps `attendanceTakenAt`/`By`/`ById`
  // on the event — the spec rejects deriving "taken" from a non-empty
  // present list because an empty room reads the same as no record at all.
  // Story 21: a Gathering nobody came to can be recorded as held. Without this
  // the stamp is only ever reachable by marking someone present, so an empty
  // room stays indistinguishable from a Gathering nobody has opened.
  const markAttendanceTaken = async (event: Event) => {
    await stampAttendanceTaken(event, {
      uid: user?.uid || null,
      name: user?.displayName || user?.email?.split('@')[0] || t('attendance.unknown_user'),
    });
  };

  const cycleAttendance = async (contact: Contact, eventId: string) => {
    try {
      const current = contact.attendance?.[eventId];
      const next: boolean | 'absent' = current === true ? 'absent' : true;

      const newAttendance = { ...(contact.attendance || {}) };
      newAttendance[eventId] = next;

      const event = events.find((e) => e.id === eventId);
      const label = (v: boolean | 'late' | 'absent' | undefined) =>
        v === true ? t('attendance.present') : v === 'late' ? t('attendance.late') : v === 'absent' ? t('attendance.absent') : t('attendance.none');

      const userName = user?.displayName || user?.email?.split('@')[0] || t('attendance.unknown_user');
      const userUid = user?.uid || null;

      const updateData: Record<string, unknown> = {
        attendance: newAttendance,
        updatedAt: new Date().toISOString(),
        updatedBy: userUid,
        updatedByName: userName,
      };

      if (shouldTouchActivityForAttendance(next) && event?.date) {
        const activityPatch = buildContactActivityPatch({
          date: event.date,
          by: { uid: userUid, name: userName },
          type: 'attendance',
        });
        Object.assign(updateData, activityPatch);
      }

      await updateDoc(doc(db, 'contacts', contact.id), updateData);
      // Stamp the event the first time attendance is recorded for it.
      // stampAttendanceTaken already no-ops when the event is already stamped.
      const wasUnmarked = current === undefined;
      if (wasUnmarked && event) await stampAttendanceTaken(event, { uid: userUid, name: userName });
      logActivity({
        action: `updated attendance for "${event?.name || 'a gathering'}" to ${label(next)} for`,
        targetId: contact.id,
        targetName: contact.name,
        targetType: 'contact',
        type: 'edit',
        description: `Attendance [${event?.name}]: ${label(current)} → ${label(next)}`,
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `contacts/${contact.id}`);
    }
  };

   const handleCreateWalkInContact = async (name: string, event: Event) => {
    const trimmed = name.trim();
    if (!trimmed || isCreatingContact) return;
    setIsCreatingContact(true);
    try {
      const initials = getUserInitials(trimmed);
      const userName = user?.displayName || user?.email?.split('@')[0] || t('attendance.unknown_user');
      const userUid = user?.uid || null;

      const newContactData: Record<string, unknown> = {
        name: trimmed,
        initials,
        role: 'Student',
        stage: 'Lead',
        lastSeen: 'Just now',
        lastContactedDate: event.date || new Date().toISOString(),
        lastContactedBy: userName,
        lastContactedById: userUid,
        hasNewActivity: true,
        attendance: {
          [event.id]: true,
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: userUid,
      };

      const docRef = await addDoc(collection(db, 'contacts'), newContactData);

      // Stamp the event the first time attendance is recorded for it.
      await stampAttendanceTaken(event, { uid: userUid, name: userName });
      logActivity({
        action: 'added new contact via gathering walk-in',
        targetId: docRef.id,
        targetName: trimmed,
        targetType: 'contact',
        type: 'create',
        description: `Created contact "${trimmed}" from gathering "${event.name}"`,
      });

      // Clear search query for this session
      setWalkInQuery((prev) => ({ ...prev, [event.id]: '' }));
    } finally {
      setIsCreatingContact(false);
    }
  };

   const handleToggleRoster = async (event: Event, contactId: string, addToRoster: boolean) => {
    if (!isAdmin) return;
    try {
      const currentRoster = event.roster || [];
      const newRoster = addToRoster
        ? Array.from(new Set([...currentRoster, contactId]))
        : currentRoster.filter((id) => id !== contactId);

      const isRecurring = !!(event.isRecurring || event.parentEventId);
      let applySeries = false;
      if (isRecurring && events.length > 1) {
        applySeries = window.confirm(
          t('attendance.apply_to_future_series', 'Apply roster update to all future gatherings in this series?'),
        );
      }

      if (applySeries) {
        const eventIds = getRecurringSeriesEventIdsToUpdate(event, events);
        for (const evId of eventIds) {
          await updateDoc(doc(db, 'events', evId), { roster: newRoster });
        }
      } else {
        await updateDoc(doc(db, 'events', event.id), { roster: newRoster });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `events/${event.id}`);
    }
  };

  const [walkInQuery, setWalkInQuery] = useState<{ [eventId: string]: string }>({});
  const [isCreatingContact, setIsCreatingContact] = useState(false);

  // newest gatherings first
  const sessionsNewestFirst = useMemo(
    () =>
      [...events].sort((a, b) => {
        const am = evtMs(a.date) ?? 0;
        const bm = evtMs(b.date) ?? 0;
        return bm - am || (b.order ?? 0) - (a.order ?? 0);
      }),
    [events],
  );

  // Who we've missed: attended before, bounded by first appearance and roster.
  const missed = useMemo(() => {
    return calculateMissedContacts(contacts, sessionsNewestFirst);
  }, [contacts, sessionsNewestFirst]);

  // gatherings to mark / review — newest first, filtered by type
  const sessions = useMemo(
    () => sessionsNewestFirst.filter((s) => activeFilter === 'All' || s.type === activeFilter),
    [sessionsNewestFirst, activeFilter],
  );

  // upcoming gatherings — ours, plus the shared calendar's
  const { role } = useAuth();
  const calOn = canSeeCalendarSync(role);
  const { getMergedGatherings, getItemsBetween } = useCalendarSync(contacts);
  const upFrom = useMemo(() => calStartOfDay(new Date()), []);
  const upTo = useMemo(() => calAddDays(upFrom, 30), [upFrom]);

  const upcoming: UnifiedGathering[] = useMemo(() => {
    if (calOn) {
      return getMergedGatherings(events, upFrom, upTo).slice(0, 4);
    }
    const now = Date.now() - DAY_MS;
    return events
      .filter((ev) => {
        const ms = evtMs(ev.date);
        return ms != null && ms >= now;
      })
      .map((ev) => ({
        id: ev.id,
        title: ev.name,
        name: ev.name,
        type: ev.type || '',
        date: new Date(ev.date),
        location: ev.location,
        attended: [],
        synced: false,
      }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(0, 4);
  }, [calOn, getMergedGatherings, events, upFrom, upTo]);

  const calContext: CalContextItem[] = useMemo(() => {
    return calOn ? getItemsBetween(upFrom, upTo).context.slice(0, 4) : [];
  }, [calOn, getItemsBetween, upFrom, upTo]);

  // quiet figures
  const avgPer = useMemo(() => {
    if (events.length === 0) return 0;
    let slots = 0;
    contacts.forEach((c) => events.forEach((e) => { if (here(c, e.id)) slots++; }));
    return Math.round(slots / events.length);
  }, [contacts, events]);

  // The full view model: this-week band, Rhythms with chips, and one-offs.
  // The view below is a renderer of this model and holds no grouping,
  // week-bounding or chip-state logic of its own.
  const viewModel = useMemo(
    () => buildGatheringViewModel({ events, contacts, now: new Date() }),
    [events, contacts],
  );

  // Apply the type filter at the row level so the "kind filters keep working
  // over the new grouping". One-offs inherit the filter too.
  const filteredRhythms = useMemo(
    () => viewModel.rhythms.filter((r) => activeFilter === 'All' || r.type === activeFilter),
    [viewModel.rhythms, activeFilter],
  );
  const filteredOneOffs = useMemo(
    () => viewModel.oneOffs.filter((g) => activeFilter === 'All' || g.type === activeFilter),
    [viewModel.oneOffs, activeFilter],
  );

  // Per-rhythm override: clicking a chip selects it; "back to current week"
  // clears the override so the model's default (current-week chip) returns.
  const [chipOverride, setChipOverride] = useState<Record<string, string>>({});

  const selectChip = (rhythmId: string, chipId: string) => {
    setChipOverride((prev) => ({ ...prev, [rhythmId]: chipId }));
  };
  const resetChipSelection = (rhythmId: string) => {
    setChipOverride((prev) => {
      const next = { ...prev };
      delete next[rhythmId];
      return next;
    });
  };

   const openContact = (c: Contact) => setSelectedContact(c);

  const openTodoFor = (contact: Contact, event: Event) => setTodoFor({ contact, event });

  // People detail is a full page (the design's ContactDetail), not a popup.
  usePreserveScroll(!!selectedContact);
  if (selectedContact) {
    return (
      <ContactDetailsModal
        isOpen
        onClose={() => setSelectedContact(null)}
        contact={selectedContact}
      />
    );
  }

  if (error) {
    return <DataLoadError label={error} />;
  }

  if (loading) {
    return (
      <PageContainer variant="wide" className="space-y-8 animate-pulse">
        <div className="space-y-3">
          <Skeleton className="h-4 w-64 opacity-70" />
          <Skeleton className="h-10 w-72" />
          <Skeleton className="h-16 w-full max-w-2xl opacity-70" />
        </div>
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full rounded-2xl" />
          ))}
        </div>
      </PageContainer>
    );
  }

  if (isMobile && !loading && !error) {
    return (
      <>
        <AttendanceMobile
          contacts={contacts}
          events={events}
          sessions={sessions}
          upcoming={upcoming}
          calContext={calContext}
          missed={missed}
          avgPer={avgPer}
          activeFilter={activeFilter}
          setTypeFilter={setTypeFilter}
          gatheringTypes={gatheringTypes}
          isAdmin={isAdmin}
          onOpenContact={openContact}
          onLogGathering={() => setIsAddEventModalOpen(true)}
          onManageTypes={() => setIsManageTypesOpen(true)}
          onEditSession={(session) => setEditingEvent(session)}
          onDeleteSession={async (id, name) => { await handleDeleteEvent(id, name); }}
          cycleAttendance={cycleAttendance}
          here={here}
          RsvpCountComponent={RsvpCount}
          team={team}
          onOpenTodo={openTodoFor}
        />
        {todoFor && (
          <FromEntryTodoComposer
            text={`Check on ${todoFor.contact.name.split(' ')[0]}`}
            contactId={todoFor.contact.id}
            contactName={todoFor.contact.name}
            source={{ interactionId: todoFor.event.id, interactionTitle: todoFor.event.name }}
            team={team}
            meUid={user?.uid ?? ''}
            meName={user?.displayName || user?.email?.split('@')[0] || t('prayers.someone')}
            onClose={() => setTodoFor(null)}
          />
        )}
      </>
    );
  }

  return (
    <>
      <PageContainer variant="wide">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
      >
        {/* ── Greeting + state of things ── */}
        <header className="flex flex-col sm:flex-row sm:items-end gap-4 sm:gap-6">
          <div className="flex-1">
            <p className="text-sm text-on-surface-variant">{format(new Date(), 'EEEE, MMMM d')}</p>
            <h1 className="font-serif text-3xl sm:text-4xl text-on-surface mt-1">{t('nav.gatherings')}</h1>
            <p className="text-base text-on-surface-variant leading-relaxed mt-3 max-w-2xl">
              We've come together{' '}
              <b className="text-on-surface font-semibold">
                {events.length} {events.length === 1 ? 'time' : 'times'}
              </b>
              {events.length > 0 && (
                <>
                  {' '}— about <span className="text-on-surface font-medium">{avgPer}</span>{' '}
                  {avgPer === 1 ? 'person' : 'people'} each time
                </>
              )}
              .
              {missed.length > 0 && ' A few faces have gone quiet lately; they’re the first thing below.'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            {isAdmin && (
              <button
                onClick={() => setIsAddEventModalOpen(true)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary text-on-primary text-sm font-medium hover:opacity-90 transition-opacity"
              >
                <Plus className="w-4 h-4" /> Log a gathering
              </button>
            )}
          </div>
        </header>

        {/* quiet admin actions */}
        <div className="flex flex-wrap gap-2 mt-4">
          {isAdmin && (
            <button
              onClick={() => setIsSyncModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-outline-variant text-xs font-medium text-on-surface-variant hover:bg-surface-variant transition-colors"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" /> Sync sheet
            </button>
          )}
          <button
            onClick={handleExport}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-outline-variant text-xs font-medium text-on-surface-variant hover:bg-surface-variant transition-colors"
          >
            <Download className="w-3.5 h-3.5" /> Export
          </button>
        </div>

        {/* ── Who we've missed lately, beside a figures side column ──
           * Heading spans both columns; figures card stops stretching and
           * stays in view while the list scrolls; hairlines separate the
           * three figures. */}
        {missed.length > 0 ? (
          <div className="mt-12">
            <SectionHead
              title="Who we've missed lately"
              sub="They used to come, but it's been a few gatherings."
            />
            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px] gap-6 items-start">
              <section className="min-w-0">
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                  {missed.map(({ contact, since, lastSeen }) => (
                    <div
                      key={contact.id}
                      onClick={() => openContact(contact)}
                      className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-4 bg-surface rounded-3xl border border-outline-variant/60 p-5 hover:border-primary/40 transition-colors cursor-pointer"
                    >
                      <div className="flex gap-4 min-w-0">
                        <Avatar contact={contact} />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-on-surface">{contact.name}</span>
                            <StageChip stage={contact.stage} />
                          </div>
                          <div className="text-sm text-accent font-medium mt-0.5">
                            Last with us at {lastSeen.name} · {formatEventDate(lastSeen.date)} — {since} gatherings ago
                          </div>
                          {contact.role && (
                            <p className="text-sm text-on-surface-variant mt-1">
                              {contact.role}
                            </p>
                          )}
                        </div>
                      </div>
                      <div
                        className="flex sm:flex-col gap-2 items-start sm:items-end"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {contact.email && (
                          <a
                            href={`mailto:${contact.email}`}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-outline-variant text-xs font-medium text-on-surface hover:bg-surface-variant transition-colors"
                          >
                            <Mail className="w-3.5 h-3.5" /> Reach out
                          </a>
                        )}
                        <button
                          onClick={() => openContact(contact)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-primary text-on-primary text-xs font-medium hover:opacity-90 transition-opacity"
                        >
                          Open
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
              <aside className="self-start lg:sticky lg:top-4">
                <FiguresCard
                  eventsCount={events.length}
                  avgPer={avgPer}
                  missedCount={missed.length}
                />
              </aside>
            </div>
          </div>
        ) : null}

        {/* ── When we met ── */}
        {/* ── This week: the first thing on the page when there's something on. ──
           * Groups by date; two Rhythms on one day share a heading, each keeping
           * its own roster and attendance. Empty weeks say so plainly. */}
        <section className="mt-12">
          <SectionHead title="This week" sub="What we're gathering for." />
          {viewModel.thisWeekEmpty ? (
            <div className="bg-surface rounded-3xl border border-outline-variant/60 p-10 text-center">
              <CalendarDays className="w-10 h-10 text-on-surface-variant/30 mx-auto mb-3" />
              <p className="text-sm text-on-surface-variant">
                Nothing on this week — the schedule starts up again next week.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {viewModel.thisWeek.map((group) => {
                const groupActive = group.gatherings.some(
                  (g) => activeFilter === 'All' || g.type === activeFilter,
                );
                if (!groupActive) return null;
                const groupGatherings = group.gatherings.filter(
                  (g) => activeFilter === 'All' || g.type === activeFilter,
                );
                const d = parseISO(group.date);
                return (
                  <div key={group.id} className="bg-surface rounded-2xl border border-outline-variant/60 p-5">
                    <div className="flex items-baseline gap-3 mb-3">
                      <span className="font-serif text-xl text-on-surface leading-none">
                        {isValid(d) ? format(d, 'EEEE') : group.date}
                      </span>
                      <span className="text-sm text-on-surface-variant">
                        {isValid(d) ? format(d, 'MMMM d') : ''}
                      </span>
                    </div>
                    <div className="space-y-2">
                      {groupGatherings.map((g) => (
                        <ThisWeekGatheringRow
                          key={g.id}
                          gathering={g}
                          events={events}
                          contacts={contacts}
                          here={here}
                          cycleAttendance={cycleAttendance}
                          isAdmin={isAdmin}
                          openContact={openContact}
                          openTodoFor={openTodoFor}
                          walkInQuery={walkInQuery}
                          setWalkInQuery={setWalkInQuery}
                          isCreatingContact={isCreatingContact}
                          handleCreateWalkInContact={handleCreateWalkInContact}
                          handleToggleRoster={handleToggleRoster}
                          markAttendanceTaken={markAttendanceTaken}
                          handleDeleteEvent={handleDeleteEvent}
                          setEditingEvent={setEditingEvent}
                          openId={openId}
                          setOpenId={setOpenId}
                          t={t}
                          parseISO={parseISO}
                          isValid={isValid}
                          format={format}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* ── When we met — the term, folded into Rhythms. ──
           * A Rhythm is one row carrying the term as a chip strip. Future
           * Gatherings live above (in the This-week band as the week arrives);
           * here is the long-arc view of how the term unfolded. */}
        <section className="mt-12">
          <SectionHead title={t('attendance.when_we_met')} sub={t('attendance.tap_gathering_sub')} />

          <div className="flex flex-wrap items-center gap-2 mb-4">
            {[t('attendance.all'), ...gatheringTypes.map((x) => x.name)].map((kind) => (
              <button
                key={kind}
                onClick={() => setTypeFilter(kind)}
                className={cn(
                  'h-9 px-4 rounded-full border text-sm font-medium transition-colors',
                  activeFilter === kind
                    ? 'bg-primary text-on-primary border-primary'
                    : 'border-outline-variant text-on-surface hover:bg-surface-variant',
                )}
              >
                {kind}
              </button>
            ))}
            {isAdmin && (
              <button
                onClick={() => setIsManageTypesOpen(true)}
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-full border border-dashed border-outline-variant text-xs font-medium text-on-surface-variant hover:bg-surface-variant transition-colors"
              >
                <Settings2 className="w-3.5 h-3.5" /> {t('attendance.manage_kinds')}
              </button>
            )}
          </div>

          {filteredRhythms.length === 0 && filteredOneOffs.length === 0 ? (
            <div className="bg-surface rounded-3xl border border-outline-variant/60 p-10 text-center">
              <CalendarDays className="w-10 h-10 text-on-surface-variant/30 mx-auto mb-3" />
              <p className="text-sm text-on-surface-variant">
                {events.length === 0
                  ? t('attendance.no_gatherings_recorded')
                  : t('attendance.no_gatherings_of_kind')}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredRhythms.map((r) => (
                <RhythmRowCard
                  key={r.id}
                  rhythm={r}
                  events={events}
                  contacts={contacts}
                  selectedChipId={chipOverride[r.id] ?? r.selectedChipId}
                  onSelectChip={(chipId) => selectChip(r.id, chipId)}
                  onResetSelection={() => resetChipSelection(r.id)}
                  here={here}
                  cycleAttendance={cycleAttendance}
                  isAdmin={isAdmin}
                  openContact={openContact}
                  openTodoFor={openTodoFor}
                  walkInQuery={walkInQuery}
                  setWalkInQuery={setWalkInQuery}
                  isCreatingContact={isCreatingContact}
                  handleCreateWalkInContact={handleCreateWalkInContact}
                  handleToggleRoster={handleToggleRoster}
                  markAttendanceTaken={markAttendanceTaken}
                  handleDeleteEvent={handleDeleteEvent}
                  setEditingEvent={setEditingEvent}
                  setOpenId={setOpenId}
                  openId={openId}
                  t={t}
                  parseISO={parseISO}
                  isValid={isValid}
                  format={format}
                />
              ))}
              {filteredOneOffs.length > 0 && (
                <div className="mt-6">
                  <h3 className="font-serif text-lg text-on-surface mb-3">One-offs</h3>
                  <div className="space-y-2">
                    {filteredOneOffs.map((g) => (
                      <OneOffGatheringRow
                        key={g.id}
                        gathering={g}
                        events={events}
                        contacts={contacts}
                        here={here}
                        cycleAttendance={cycleAttendance}
                        isAdmin={isAdmin}
                        openContact={openContact}
                        openTodoFor={openTodoFor}
                        walkInQuery={walkInQuery}
                        setWalkInQuery={setWalkInQuery}
                        isCreatingContact={isCreatingContact}
                        handleCreateWalkInContact={handleCreateWalkInContact}
                        handleToggleRoster={handleToggleRoster}
                        markAttendanceTaken={markAttendanceTaken}
                        handleDeleteEvent={handleDeleteEvent}
                        setEditingEvent={setEditingEvent}
                        openId={openId}
                        setOpenId={setOpenId}
                        t={t}
                        parseISO={parseISO}
                        isValid={isValid}
                        format={format}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>

        {/* ── Coming up ── */}
        {upcoming.length > 0 && (
          <section className="mt-12">
            <SectionHead title={t('attendance.coming_up')} sub={t('attendance.coming_up_sub')} />
            <div className="bg-surface rounded-2xl border border-outline-variant/60 px-5">
              {upcoming.map((ev, i) => {
                const d = new Date(ev.date);
                return (
                  <div
                    key={ev.id}
                    className={cn(
                      'flex items-center gap-4 py-4',
                      i > 0 && 'border-t border-outline-variant/40',
                    )}
                  >
                    <div className="text-center w-11 shrink-0">
                      <div className="font-serif text-2xl text-on-surface leading-none">
                        {isValid(d) ? format(d, 'd') : '–'}
                      </div>
                      <div className="text-[11px] text-on-surface-variant mt-1">
                        {isValid(d) ? format(d, 'MMM') : ''}
                      </div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-on-surface truncate">
                        {ev.title || ev.name}
                        {ev.synced && <span className="cal-mark s">{t('calendar.badge', 'calendar')}</span>}
                      </div>
                      <div className="text-xs text-on-surface-variant mt-0.5 truncate">
                        {[isValid(d) ? format(d, 'EEEE') : '', ev.time, ev.location].filter(Boolean).join(' · ')}
                      </div>
                    </div>
                    {!ev.synced && <RsvpCount eventId={ev.id} />}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ── Dates worth knowing about. Not gatherings, so no roster. ── */}
        {calContext.length > 0 && (
          <section className="mt-8">
            <SectionHead title={t('calendar.also_on_calendar', 'Also on the calendar')} sub={t('attendance.also_on_calendar_sub', 'Not gatherings — just worth knowing.')} />
            <div className="bg-surface rounded-2xl border border-outline-variant/60 px-5">
              {calContext.map((it, i) => {
                const d = new Date(it.date);
                return (
                  <div
                    key={it.id}
                    className={cn(
                      'cal-ctx flex items-center gap-4 py-4',
                      i > 0 && 'border-t border-outline-variant/40',
                    )}
                  >
                    <div className="text-center w-11 shrink-0">
                      <div className="font-serif text-2xl text-on-surface leading-none">
                        {isValid(d) ? format(d, 'd') : '–'}
                      </div>
                      <div className="text-[11px] text-on-surface-variant mt-1">
                        {isValid(d) ? format(d, 'MMM') : ''}
                      </div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="tw-title font-medium text-on-surface truncate">{it.title}</div>
                      <div className="text-xs text-on-surface-variant mt-0.5 truncate">
                        {[it.time, it.catLabel].filter(Boolean).join(' · ')}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ── Quiet figures: present, but never the headline ──
           * Same card as the missed-section sidebar — one figures treatment. */}
        {missed.length === 0 && (
          <div className="mt-12 max-w-sm">
            <FiguresCard
              eventsCount={events.length}
              avgPer={avgPer}
              missedCount={missed.length}
            />
          </div>
        )}
      </motion.div>
      </PageContainer>

      <SyncSheetModal isOpen={isSyncModalOpen} onClose={() => setIsSyncModalOpen(false)} contacts={contacts} />
      <AddEventModal
        isOpen={isAddEventModalOpen}
        onClose={() => setIsAddEventModalOpen(false)}
        currentEventCount={events.length}
        contacts={contacts}
      />
      <EditEventModal
        isOpen={editingEvent !== null}
        onClose={() => setEditingEvent(null)}
        event={editingEvent}
        contacts={contacts}
        allEvents={events}
      />
      <ManageGatheringTypesModal
        isOpen={isManageTypesOpen}
        onClose={() => setIsManageTypesOpen(false)}
        types={gatheringTypes}
      />

      {todoFor && (
        <FromEntryTodoComposer
          text={`Check on ${todoFor.contact.name.split(' ')[0]}`}
          contactId={todoFor.contact.id}
          contactName={todoFor.contact.name}
          source={{ interactionId: todoFor.event.id, interactionTitle: todoFor.event.name }}
          team={team}
          meUid={user?.uid ?? ''}
          meName={user?.displayName || user?.email?.split('@')[0] || t('prayers.someone')}
          onClose={() => setTodoFor(null)}
        />
      )}
    </>
  );

  function formatEventDate(dateStr: string) {
    const d = evtDate(dateStr);
    return d ? format(d, 'MMM d') : dateStr;
  }
}

function StageChip({ stage }: { stage?: string }) {
  if (!stage) return null;
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap bg-surface-variant text-on-surface-variant">
      {stage}
    </span>
  );
}

// ── Chip styling, derived from ChipState. ──
const chipStyle = (state: ChipState): string => {
  switch (state) {
    case 'taken':
      return 'bg-primary text-on-primary border-primary';
    case 'happened-not-taken':
      return 'bg-surface text-on-surface-variant border-outline-variant';
    case 'current-week':
      return 'bg-primary-container text-on-primary-container border-primary ring-2 ring-primary/40';
    case 'ahead':
      return 'bg-surface text-on-surface-variant/60 border-outline-variant/60 border-dashed';
  }
};

// ── Shared props for any expandable Gathering row. ──
interface GatheringRowProps {
  events: Event[];
  contacts: Contact[];
  here: (c: Contact, eventId: string) => boolean;
  cycleAttendance: (c: Contact, eventId: string) => Promise<void>;
  isAdmin: boolean;
  openContact: (c: Contact) => void;
  openTodoFor: (c: Contact, e: Event) => void;
  walkInQuery: Record<string, string>;
  setWalkInQuery: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  isCreatingContact: boolean;
  handleCreateWalkInContact: (name: string, event: Event) => Promise<void>;
  handleToggleRoster: (event: Event, contactId: string, add: boolean) => Promise<void>;
  markAttendanceTaken: (event: Event) => Promise<void>;
  handleDeleteEvent: (id: string, name: string) => Promise<void>;
  setEditingEvent: (e: Event | null) => void;
  openId: string | null;
  setOpenId: React.Dispatch<React.SetStateAction<string | null>>;
  t: (key: string, fallback?: string) => string;
  parseISO: (s: string) => Date;
  isValid: (d: unknown) => boolean;
  format: (d: Date | string | number, fmt: string) => string;
}

/** Expandable attendance panel — the per-Gathering present/missed/walk-in flow
 *  the old flat list used. Hoisted into one component so Rhythm rows, one-offs
 *  and This-week rows all share the same interaction. */
function GatheringExpansion({
  gathering,
  events,
  contacts,
  ...rest
}: GatheringRowProps & { gathering: { id: string } }) {
  const {
    cycleAttendance,
    isAdmin,
    openTodoFor,
    walkInQuery,
    setWalkInQuery,
    isCreatingContact,
    handleCreateWalkInContact,
    handleToggleRoster,
    markAttendanceTaken,
    parseISO,
    isValid,
    format,
    t,
  } = rest;
  const ev = events.find((e) => e.id === gathering.id);
  if (!ev) return null;
  const { present, absent, nonRoster } = getSessionRoster(ev, contacts);
  const queryText = walkInQuery[ev.id] || '';
  const filteredNonRoster = queryText.trim()
    ? nonRoster.filter((c) => c.name.toLowerCase().includes(queryText.trim().toLowerCase()))
    : [];
  const exactMatch = nonRoster.some(
    (c) => c.name.trim().toLowerCase() === queryText.trim().toLowerCase(),
  );
  const takenAt = ev.attendanceTakenAt ? parseISO(ev.attendanceTakenAt) : null;
  const takenOn = takenAt && isValid(takenAt) ? format(takenAt, 'MMM d') : '';

  return (
    <div className="px-5 pb-5 border-t border-outline-variant/40 pt-4 space-y-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-on-surface-variant">
        <span className="inline-flex items-center gap-1.5">
          <i className="w-2 h-2 rounded-full bg-primary inline-block" /> {t('attendance.here')}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <i className="w-2 h-2 rounded-full bg-outline inline-block" /> {t('attendance.missed')}
        </span>
        <span className="italic">{t('attendance.tap_name_to_update')}</span>
      </div>

      {/* Whether anyone has recorded this Gathering — and who. A blank week
          reads as an empty room only once someone has said so. */}
      <div className="flex flex-wrap items-center gap-3 text-xs">
        {ev.attendanceTakenAt ? (
          <span className="text-on-surface-variant">
            {t('attendance.taken_by', 'Attendance taken by')}{' '}
            <b className="text-on-surface font-medium">
              {ev.attendanceTakenBy || t('attendance.unknown_user')}
            </b>
            {takenOn ? ` · ${takenOn}` : ''}
          </span>
        ) : (
          <>
            <span className="text-on-surface-variant italic">
              {t('attendance.not_taken_yet', 'nobody has recorded this one yet')}
            </span>
            {!isFutureEventDate(ev.date) && (
              <button
                type="button"
                onClick={() => markAttendanceTaken(ev)}
                className="px-3 py-1.5 rounded-full border border-outline-variant text-xs font-medium text-on-surface hover:bg-surface-variant transition-colors"
              >
                {t('attendance.nobody_came', 'We met — nobody came')}
              </button>
            )}
          </>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
        <div>
          <div className="text-xs font-semibold text-on-surface   mb-2">
            {t('attendance.attended_header')} <span className="text-on-surface-variant">{present.length}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {present.length === 0 && (
              <span className="text-sm text-on-surface-variant italic">{t('attendance.no_one_marked_yet')}</span>
            )}
            {present.map((c) => {
              const isOnRoster = (ev.roster || []).includes(c.id);
              return (
                <div
                  key={c.id}
                  className="inline-flex items-center gap-1.5 pl-1 pr-2.5 py-1 rounded-full border transition-colors bg-primary-container/50 border-primary/30 text-on-surface"
                >
                  <button onClick={() => cycleAttendance(c, ev.id)} className="inline-flex items-center gap-2">
                    <Avatar contact={c} size="sm" />
                    <span className="text-sm">{c.name}</span>
                  </button>
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => handleToggleRoster(ev, c.id, !isOnRoster)}
                      title={isOnRoster ? t('attendance.remove_from_roster', 'Remove from roster') : t('attendance.add_to_roster', 'Add to roster')}
                      className={cn(
                        'text-[10px] px-1.5 py-0.5 rounded-full font-medium transition-colors',
                        isOnRoster ? 'text-on-surface-variant/70 hover:text-error' : 'bg-primary/20 text-accent hover:bg-primary/30',
                      )}
                    >
                      {isOnRoster ? '★' : '+ Roster'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        <div>
          <div className="text-xs font-semibold text-on-surface-variant   mb-2">
            {t('attendance.we_missed')} <span>{absent.length}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {absent.length === 0 && (
              <span className="text-sm text-on-surface-variant italic">{t('attendance.everyone_came_period')}</span>
            )}
            {absent.map((c) => (
              <span key={c.id} className="inline-flex items-center gap-1 pl-1 pr-1.5 py-1 rounded-full border border-outline-variant text-on-surface-variant">
                <button
                  onClick={() => cycleAttendance(c, ev.id)}
                  className="inline-flex items-center gap-2"
                  title={t('attendance.tap_to_mark_present')}
                >
                  <Avatar contact={c} size="sm" />
                  <span className="text-sm">{c.name}</span>
                </button>
                <button
                  onClick={() => openTodoFor(c, ev)}
                  title={t('attendance.make_a_todo_check_on').replace('{name}', c.name)}
                  aria-label={t('attendance.make_a_todo_for').replace('{name}', c.name)}
                  className="p-1.5 rounded-full hover:bg-surface-variant hover:text-accent transition-colors"
                >
                  <CheckSquare className="w-3.5 h-3.5" />
                </button>
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="pt-3 border-t border-outline-variant/30">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={queryText}
            onChange={(e) => setWalkInQuery((prev) => ({ ...prev, [ev.id]: e.target.value }))}
            placeholder={t('attendance.add_attendee_or_walkin', 'Add attendee or walk-in...')}
            className="w-full max-w-sm h-8 px-3 rounded-xl bg-surface-variant/50 border border-outline/30 text-xs text-on-surface outline-none focus:border-primary"
          />
          {queryText.trim() && !exactMatch && (
            <button
              type="button"
              disabled={isCreatingContact}
              onClick={() => handleCreateWalkInContact(queryText, ev)}
              className="h-8 px-3 rounded-xl bg-primary text-on-primary text-xs font-medium whitespace-nowrap hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {isCreatingContact
                ? t('attendance.creating', 'Creating...')
                : t('attendance.create_contact_named', 'Create contact "{name}"').replace('{name}', queryText.trim())}
            </button>
          )}
        </div>

        {queryText.trim() && filteredNonRoster.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {filteredNonRoster.slice(0, 10).map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={async () => {
                  await cycleAttendance(c, ev.id);
                  setWalkInQuery((prev) => ({ ...prev, [ev.id]: '' }));
                }}
                className="inline-flex items-center gap-1.5 pl-1.5 pr-2.5 py-1 rounded-lg bg-surface border border-outline-variant text-xs hover:border-primary text-on-surface transition-colors"
              >
                <Avatar contact={c} size="sm" />
                <span>{c.name}</span>
                <span className="text-[10px] text-accent">+ Check in</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** A one-off Gathering row — same shape as a single Gathering card from the
 *  old list, but listed under the "One-offs" heading rather than flattened
 *  into "When we met" alongside future dates. */
function OneOffGatheringRow(
  props: GatheringRowProps & { gathering: OneOffGathering },
) {
  const { gathering, events, openId, setOpenId, t, setEditingEvent, isAdmin, handleDeleteEvent, parseISO, isValid, format } = props;
  const ev = events.find((e) => e.id === gathering.id);
  if (!ev) return null;
  const isOpen = openId === ev.id;
  const d = parseISO(ev.date);
  const { present } = getSessionRoster(ev, props.contacts);
  return (
    <div className="bg-surface rounded-2xl border border-outline-variant/60 overflow-hidden">
      <button
        onClick={() => setOpenId(isOpen ? null : ev.id)}
        className="w-full flex items-center gap-3 sm:gap-4 p-4 sm:p-5 text-left hover:bg-surface-variant/40 transition-colors group/header"
      >
        <div className="text-center w-12 shrink-0">
          <div className="text-[11px] text-on-surface-variant">{d && isValid(d) ? format(d, 'EEE') : ''}</div>
          <div className="font-serif text-2xl text-on-surface leading-none">{d && isValid(d) ? format(d, 'd') : '–'}</div>
          <div className="text-[11px] text-on-surface-variant">{d && isValid(d) ? format(d, 'MMM') : ''}</div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-on-surface truncate">{ev.name}</div>
          <div className="text-sm text-on-surface-variant truncate">{ev.type || t('attendance.a_time_together')}</div>
        </div>
        <div className="text-sm text-on-surface-variant whitespace-nowrap shrink-0">
          <b className="text-on-surface font-semibold">{present.length}</b> {t('attendance.came')}
        </div>
        <ChevronDown className={cn('w-4 h-4 text-on-surface-variant transition-transform shrink-0', isOpen && 'rotate-180')} />
        {isAdmin && (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => { e.stopPropagation(); setEditingEvent(ev); }}
            className="p-1.5 rounded-full text-on-surface-variant opacity-0 group-hover/header:opacity-100 hover:bg-surface-variant hover:text-on-surface transition-all shrink-0"
            title={t('attendance.edit_gathering')}
          >
            <Pencil className="w-3.5 h-3.5" />
          </span>
        )}
        {isAdmin && (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => { e.stopPropagation(); handleDeleteEvent(ev.id, ev.name); }}
            className="p-1.5 rounded-full text-on-surface-variant opacity-0 group-hover/header:opacity-100 hover:bg-error-container hover:text-on-error-container transition-all shrink-0"
            title={t('attendance.remove_gathering')}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </span>
        )}
      </button>
      {isOpen && <GatheringExpansion {...props} gathering={{ id: ev.id }} />}
    </div>
  );
}

/** A Gathering listed in the This-week band. Compact: header + one-line
 *  attendance affordances inline so a Full-timer opening the page on a
 *  gathering day can mark attendance right from the band. */
function ThisWeekGatheringRow(
  props: GatheringRowProps & { gathering: OneOffGathering },
) {
  const { gathering, events, openId, setOpenId, t, setEditingEvent, isAdmin } = props;
  const ev = events.find((e) => e.id === gathering.id);
  if (!ev) return null;
  const isOpen = openId === ev.id;
  const { present } = getSessionRoster(ev, props.contacts);
  return (
    <div className="bg-surface-variant/30 rounded-xl border border-outline-variant/30 overflow-hidden">
      <button
        onClick={() => setOpenId(isOpen ? null : ev.id)}
        className="w-full flex items-center gap-3 p-3 text-left hover:bg-surface-variant/50 transition-colors group/header"
      >
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-on-surface truncate">{ev.name}</div>
          <div className="text-xs text-on-surface-variant truncate">{ev.type || t('attendance.a_time_together')}</div>
        </div>
        <div className="text-xs text-on-surface-variant whitespace-nowrap shrink-0">
          <b className="text-on-surface font-semibold">{present.length}</b> {t('attendance.came')}
        </div>
        <ChevronDown className={cn('w-4 h-4 text-on-surface-variant transition-transform shrink-0', isOpen && 'rotate-180')} />
        {isAdmin && (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => { e.stopPropagation(); setEditingEvent(ev); }}
            className="p-1 rounded-full text-on-surface-variant opacity-0 group-hover/header:opacity-100 hover:bg-surface-variant hover:text-on-surface transition-all shrink-0"
            title={t('attendance.edit_gathering')}
          >
            <Pencil className="w-3 h-3" />
          </span>
        )}
      </button>
      {isOpen && <GatheringExpansion {...props} gathering={{ id: ev.id }} />}
    </div>
  );
}

/** A Rhythm row: name + counts + a horizontally-scrollable chip strip
 *  carrying every Gathering in the term. Click a chip to view that
 *  Gathering's attendance in the expansion below. */
function RhythmRowCard({
  rhythm,
  events,
  selectedChipId,
  onSelectChip,
  onResetSelection,
  openId,
  setOpenId,
  t,
  isAdmin,
  setEditingEvent,
  ...rest
}: GatheringRowProps & {
  rhythm: RhythmRow;
  selectedChipId: string;
  onSelectChip: (chipId: string) => void;
  onResetSelection: () => void;
}) {
  const selectedChip = rhythm.chips.find((c) => c.id === selectedChipId) ?? rhythm.chips[0];
  const ev = events.find((e) => e.id === selectedChip?.id);
  const isOpen = openId === rhythm.id;
  const currentWeekChip = rhythm.chips.find((c) => c.state === 'current-week');
  const overrideActive = currentWeekChip ? currentWeekChip.id !== selectedChipId : false;

  return (
    <div className="bg-surface rounded-2xl border border-outline-variant/60 overflow-hidden">
      <button
        onClick={() => setOpenId(isOpen ? null : rhythm.id)}
        className="w-full flex items-center gap-3 sm:gap-4 p-4 sm:p-5 text-left hover:bg-surface-variant/40 transition-colors"
      >
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-on-surface truncate">{rhythm.name}</div>
          <div className="text-sm text-on-surface-variant truncate">{rhythm.type || t('attendance.a_time_together')}</div>
        </div>
        {rhythm.expectedCount > 0 && (
          <div className="text-sm text-on-surface-variant whitespace-nowrap shrink-0">
            <b className="text-on-surface font-semibold">{selectedChip?.presentCount ?? 0}</b> / {rhythm.expectedCount} {t('attendance.came')}
          </div>
        )}
        {rhythm.expectedCount === 0 && selectedChip && (
          <div className="text-sm text-on-surface-variant whitespace-nowrap shrink-0">
            <b className="text-on-surface font-semibold">{selectedChip.presentCount}</b> {t('attendance.came')}
          </div>
        )}
        <ChevronDown className={cn('w-4 h-4 text-on-surface-variant transition-transform shrink-0', isOpen && 'rotate-180')} />
        {isAdmin && ev && (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => { e.stopPropagation(); setEditingEvent(ev); }}
            className="p-1.5 rounded-full text-on-surface-variant opacity-0 hover:opacity-100 group-hover:opacity-100 hover:bg-surface-variant hover:text-on-surface transition-all shrink-0"
            title={t('attendance.edit_gathering')}
          >
            <Pencil className="w-3.5 h-3.5" />
          </span>
        )}
      </button>

      {/* Chip strip — the term at a glance. Horizontally scrollable for
          long terms; a year-long Rhythm keeps its strip usable. */}
      <div className="px-4 sm:px-5 pb-3 flex items-center gap-2 overflow-x-auto">
        {rhythm.chips.map((chip) => {
          const d = new Date(chip.date + 'T00:00:00');
          const isSelected = chip.id === selectedChipId;
          return (
            <button
              key={chip.id}
              onClick={(e) => { e.stopPropagation(); onSelectChip(chip.id); }}
              title={`${chip.date}${chip.state === 'taken' && chip.takenByName ? ` · marked by ${chip.takenByName}` : ''}`}
              className={cn(
                'shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-xs font-medium transition-colors',
                chipStyle(chip.state),
                isSelected && 'ring-2 ring-primary',
              )}
            >
              <span className="font-serif text-sm leading-none">{d.getDate()}</span>
              <span className="text-[10px] uppercase tracking-wide">{format(d, 'MMM')}</span>
            </button>
          );
        })}
        {overrideActive && (
          <button
            onClick={(e) => { e.stopPropagation(); onResetSelection(); }}
            className="shrink-0 ml-1 inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-primary text-on-primary text-xs font-medium hover:opacity-90 transition-opacity"
            title="Return the strip to this week's chip"
          >
            This week
          </button>
        )}
      </div>

      {isOpen && ev && (
        <GatheringExpansion
          {...rest}
          events={events}
          isAdmin={isAdmin}
          setEditingEvent={setEditingEvent}
          openId={openId}
          setOpenId={setOpenId}
          t={t}
          gathering={{ id: ev.id }}
        />
      )}
    </div>
  );
}
