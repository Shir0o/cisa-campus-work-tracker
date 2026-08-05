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
} from 'lucide-react';
import { motion } from 'motion/react';
import { collection, onSnapshot, query, orderBy, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, logActivity } from '../lib/firebase';
import { subscribeEventRsvps } from '../lib/rsvp';
import { useGatheringTypes, seedDefaultGatheringTypesIfEmpty } from '../lib/gatheringTypes';
import { cn, getUserInitials } from '../lib/utils';
import { useAuth } from '../components/AuthProvider';
import { Contact, Event } from '../types';
import { Skeleton } from '../components/ui/Skeleton';
import { DataLoadError } from '../components/ui/DataLoadError';
import AddEventModal from '../components/modals/AddEventModal';
import EditEventModal from '../components/modals/EditEventModal';
import ManageGatheringTypesModal from '../components/modals/ManageGatheringTypesModal';
import ContactDetailsModal from '../components/modals/ContactDetailsModal';
import SyncSheetModal from '../components/modals/SyncSheetModal';
import PageContainer from '../components/layout/PageContainer';
import { format, parseISO, isValid } from 'date-fns';
import { useMediaQuery } from '../lib/useMediaQuery';
import AttendanceMobile from './AttendanceMobile';

const DAY_MS = 86_400_000;

// Event dates are date-only ('yyyy-MM-dd'); parseISO reads them as LOCAL midnight
// (new Date(...) would treat them as UTC and shift a day in negative-offset zones).
const evtDate = (s?: string | null): Date | null => {
  if (!s) return null;
  const d = parseISO(s);
  return isValid(d) ? d : null;
};
const evtMs = (s?: string | null): number | null => evtDate(s)?.getTime() ?? null;

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
        'rounded-full bg-primary-container text-on-primary-container font-semibold flex items-center justify-center shrink-0',
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

const SectionHead = ({ title, sub }: { title: string; sub?: string }) => (
  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-4">
    <h2 className="font-serif text-2xl text-on-surface">{title}</h2>
    {sub && <span className="text-sm text-on-surface-variant">{sub}</span>}
  </div>
);

export default function Attendance() {
  const { user, isAdmin } = useAuth();
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

    return () => {
      unsubscribeContacts();
      unsubscribeEvents();
    };
  }, []);

  const handleExport = () => {
    if (contacts.length === 0 || events.length === 0) return;

    const headers = ['Name', 'Role', ...events.map((e) => `${e.name} (${e.date})`)];
    const rows = contacts.map((c) => [
      c.name,
      c.role,
      ...events.map((e) => {
        const s = c.attendance?.[e.id];
        return s === true ? 'Present' : s === 'late' ? 'Late' : s === 'absent' ? 'Absent' : 'None';
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
        `Remove the gathering "${eventName}"? This also clears who was marked present or absent for it.`,
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
  const cycleAttendance = async (contact: Contact, eventId: string) => {
    try {
      const current = contact.attendance?.[eventId];
      const next: boolean | 'absent' = current === true ? 'absent' : true;

      const newAttendance = { ...(contact.attendance || {}) };
      newAttendance[eventId] = next;

      const event = events.find((e) => e.id === eventId);
      const label = (v: boolean | 'late' | 'absent' | undefined) =>
        v === true ? 'Present' : v === 'late' ? 'Late' : v === 'absent' ? 'Absent' : 'None';

      await updateDoc(doc(db, 'contacts', contact.id), {
        attendance: newAttendance,
        updatedAt: new Date().toISOString(),
        updatedBy: user?.uid,
        updatedByName: user?.displayName || user?.email?.split('@')[0] || 'Unknown User',
      });

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

  // Who we've missed: attended before, but not in the most recent gatherings.
  const missed = useMemo(() => {
    const out: { contact: Contact; since: number; lastSeen: Event }[] = [];
    contacts.forEach((c) => {
      let since = 0;
      let lastSeen: Event | null = null;
      for (const s of sessionsNewestFirst) {
        if (here(c, s.id)) {
          lastSeen = s;
          break;
        }
        since++;
      }
      if (lastSeen && since >= 2) out.push({ contact: c, since, lastSeen });
    });
    return out.sort((a, b) => b.since - a.since).slice(0, 4);
  }, [contacts, sessionsNewestFirst]);

  // gatherings to mark / review — newest first, filtered by type
  const sessions = useMemo(
    () => sessionsNewestFirst.filter((s) => activeFilter === 'All' || s.type === activeFilter),
    [sessionsNewestFirst, activeFilter],
  );

  // coming up — today or later, soonest first
  const upcoming = useMemo(() => {
    const now = Date.now() - DAY_MS;
    return [...events]
      .map((ev) => ({ ev, ms: evtMs(ev.date) }))
      .filter((x): x is { ev: Event; ms: number } => x.ms != null && x.ms >= now)
      .sort((a, b) => a.ms - b.ms)
      .slice(0, 3);
  }, [events]);

  // quiet figures
  const avgPer = useMemo(() => {
    if (events.length === 0) return 0;
    let slots = 0;
    contacts.forEach((c) => events.forEach((e) => { if (here(c, e.id)) slots++; }));
    return Math.round(slots / events.length);
  }, [contacts, events]);

  const openContact = (c: Contact) => setSelectedContact(c);

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
      <AttendanceMobile
        contacts={contacts}
        events={events}
        sessions={sessions}
        upcoming={upcoming}
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
      />
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
            <h1 className="font-serif text-3xl sm:text-4xl text-on-surface mt-1">Gatherings</h1>
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

        {/* ── Who we've missed lately ── */}
        {missed.length > 0 && (
          <section className="mt-12">
            <SectionHead
              title="Who we've missed lately"
              sub="They used to come, but it's been a few gatherings."
            />
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
              {missed.map(({ contact, since, lastSeen }) => (
                <div
                  key={contact.id}
                  onClick={() => openContact(contact)}
                  className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-4 bg-surface rounded-2xl border border-outline-variant/60 p-5 hover:border-primary/40 transition-colors cursor-pointer"
                >
                  <div className="flex gap-4 min-w-0">
                    <Avatar contact={contact} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-on-surface">{contact.name}</span>
                        <StageChip stage={contact.stage} />
                      </div>
                      <div className="text-sm text-primary font-medium mt-0.5">
                        Last with us at {lastSeen.name} · {formatEventDate(lastSeen.date)} — {since} gatherings ago
                      </div>
                      {(contact.role || contact.location) && (
                        <p className="text-sm text-on-surface-variant mt-1">
                          {[contact.role, contact.location].filter(Boolean).join(' · ')}
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
        )}

        {/* ── When we met ── */}
        <section className="mt-12">
          <SectionHead
            title="When we met"
            sub="Tap a gathering to see who came — and mark anyone you remember."
          />

          <div className="flex flex-wrap items-center gap-2 mb-4">
            {['All', ...gatheringTypes.map((t) => t.name)].map((t) => (
              <button
                key={t}
                onClick={() => setTypeFilter(t)}
                className={cn(
                  'h-9 px-4 rounded-full border text-sm font-medium transition-colors',
                  activeFilter === t
                    ? 'bg-primary text-on-primary border-primary'
                    : 'border-outline-variant text-on-surface hover:bg-surface-variant',
                )}
              >
                {t}
              </button>
            ))}
            {isAdmin && (
              <button
                onClick={() => setIsManageTypesOpen(true)}
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-full border border-dashed border-outline-variant text-xs font-medium text-on-surface-variant hover:bg-surface-variant transition-colors"
              >
                <Settings2 className="w-3.5 h-3.5" /> Manage kinds
              </button>
            )}
          </div>

          {sessions.length > 0 ? (
            <div className="space-y-3">
              {sessions.map((s) => {
                const present = contacts.filter((c) => here(c, s.id));
                const absent = contacts.filter((c) => !here(c, s.id));
                const isOpen = openId === s.id;
                const d = evtDate(s.date);
                return (
                  <div
                    key={s.id}
                    className="bg-surface rounded-2xl border border-outline-variant/60 overflow-hidden"
                  >
                    <button
                      onClick={() => setOpenId(isOpen ? null : s.id)}
                      className="w-full flex items-center gap-3 sm:gap-4 p-4 sm:p-5 text-left hover:bg-surface-variant/40 transition-colors group/header"
                    >
                      <div className="text-center w-12 shrink-0">
                        <div className="text-[11px] uppercase tracking-wide text-on-surface-variant">
                          {d ? format(d, 'EEE') : ''}
                        </div>
                        <div className="font-serif text-2xl text-on-surface leading-none">
                          {d ? format(d, 'd') : '–'}
                        </div>
                        <div className="text-[11px] uppercase tracking-wide text-on-surface-variant">
                          {d ? format(d, 'MMM') : ''}
                        </div>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-on-surface truncate">{s.name}</div>
                        <div className="text-sm text-on-surface-variant truncate">
                          {s.type || 'A time together'}
                        </div>
                      </div>
                      <div className="hidden sm:flex items-center -space-x-2 mr-1">
                        {present.slice(0, 6).map((c) => (
                          <div key={c.id} className="ring-2 ring-surface rounded-full">
                            <Avatar contact={c} size="sm" />
                          </div>
                        ))}
                      </div>
                      <div className="text-sm text-on-surface-variant whitespace-nowrap shrink-0">
                        <b className="text-on-surface font-semibold">{present.length}</b> came
                      </div>
                      <ChevronDown
                        className={cn(
                          'w-4 h-4 text-on-surface-variant transition-transform shrink-0',
                          isOpen && 'rotate-180',
                        )}
                      />
                      {isAdmin && (
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingEvent(s);
                          }}
                          className="p-1.5 rounded-full text-on-surface-variant opacity-0 group-hover/header:opacity-100 hover:bg-surface-variant hover:text-on-surface transition-all shrink-0"
                          title="Edit gathering"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </span>
                      )}
                      {isAdmin && (
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteEvent(s.id, s.name);
                          }}
                          className="p-1.5 rounded-full text-on-surface-variant opacity-0 group-hover/header:opacity-100 hover:bg-error-container hover:text-on-error-container transition-all shrink-0"
                          title="Remove gathering"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </span>
                      )}
                    </button>

                    {isOpen && (
                      <div className="px-5 pb-5 border-t border-outline-variant/40 pt-4">
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-on-surface-variant mb-4">
                          <span className="inline-flex items-center gap-1.5">
                            <i className="w-2 h-2 rounded-full bg-primary inline-block" /> here
                          </span>
                          <span className="inline-flex items-center gap-1.5">
                            <i className="w-2 h-2 rounded-full bg-outline inline-block" /> missed
                          </span>
                          <span className="italic">Tap a name to update who was there.</span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
                          <div>
                            <div className="text-xs font-semibold text-on-surface uppercase tracking-wide mb-2">
                              Attended <span className="text-on-surface-variant">{present.length}</span>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {present.length === 0 && (
                                <span className="text-sm text-on-surface-variant italic">No one marked yet.</span>
                              )}
                              {present.map((c) => (
                                <button
                                  key={c.id}
                                  onClick={() => cycleAttendance(c, s.id)}
                                  className="inline-flex items-center gap-2 pl-1 pr-3 py-1 rounded-full border transition-colors bg-primary-container/50 border-primary/30 text-on-surface"
                                >
                                  <Avatar contact={c} size="sm" />
                                  <span className="text-sm">{c.name}</span>
                                </button>
                              ))}
                            </div>
                          </div>
                          <div>
                            <div className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide mb-2">
                              We missed <span>{absent.length}</span>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {absent.length === 0 && (
                                <span className="text-sm text-on-surface-variant italic">Everyone came.</span>
                              )}
                              {absent.map((c) => (
                                <button
                                  key={c.id}
                                  onClick={() => cycleAttendance(c, s.id)}
                                  className="inline-flex items-center gap-2 pl-1 pr-3 py-1 rounded-full border border-outline-variant text-on-surface-variant hover:border-primary/40 transition-colors"
                                >
                                  <Avatar contact={c} size="sm" />
                                  <span className="text-sm">{c.name}</span>
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="bg-surface rounded-2xl border border-outline-variant/60 p-10 text-center">
              <CalendarDays className="w-10 h-10 text-on-surface-variant/30 mx-auto mb-3" />
              <p className="text-sm text-on-surface-variant">
                {events.length === 0
                  ? 'No gatherings recorded yet. Log your first one to start keeping the record.'
                  : 'No gatherings of this kind yet.'}
              </p>
            </div>
          )}
        </section>

        {/* ── Coming up ── */}
        {upcoming.length > 0 && (
          <section className="mt-12">
            <SectionHead title="Coming up" sub="What we can invite people to next." />
            <div className="bg-surface rounded-2xl border border-outline-variant/60 px-5">
              {upcoming.map(({ ev, ms }, i) => {
                const d = new Date(ms);
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
                      <div className="text-[11px] uppercase tracking-wide text-on-surface-variant mt-1">
                        {isValid(d) ? format(d, 'MMM') : ''}
                      </div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-on-surface truncate">{ev.name}</div>
                      <div className="text-xs text-on-surface-variant mt-0.5 truncate">
                        {[isValid(d) ? format(d, 'EEEE') : '', ev.location].filter(Boolean).join(' · ')}
                      </div>
                    </div>
                    <RsvpCount eventId={ev.id} />
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ── Quiet figures ── */}
        <div className="mt-14 pt-6 border-t border-outline-variant/50 flex flex-wrap items-end gap-x-10 gap-y-4">
          <Figure n={events.length} label="gatherings" />
          <Figure n={avgPer} label="come, on average" />
          <Figure n={missed.length} label="gone quiet" />
          <span className="text-sm text-on-surface-variant italic ml-auto">
            Counting heads is just a way of noticing who's missing.
          </span>
        </div>
      </motion.div>
      </PageContainer>

      <SyncSheetModal isOpen={isSyncModalOpen} onClose={() => setIsSyncModalOpen(false)} contacts={contacts} />
      <AddEventModal
        isOpen={isAddEventModalOpen}
        onClose={() => setIsAddEventModalOpen(false)}
        currentEventCount={events.length}
      />
      <EditEventModal
        isOpen={editingEvent !== null}
        onClose={() => setEditingEvent(null)}
        event={editingEvent}
      />
      <ManageGatheringTypesModal
        isOpen={isManageTypesOpen}
        onClose={() => setIsManageTypesOpen(false)}
        types={gatheringTypes}
      />
      <ContactDetailsModal
        isOpen={selectedContact !== null}
        onClose={() => setSelectedContact(null)}
        contact={selectedContact}
      />
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
