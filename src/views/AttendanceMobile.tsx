import React, { useRef, useState } from 'react';
import { isValid } from 'date-fns';
import { Plus, X, MessageSquare, ChevronRight, Check, Users, Pencil } from 'lucide-react';
import { cn } from '../lib/utils';
import { Contact, Gathering } from '../types';
import { Avatar } from '../components/landing/primitives';
import { openMessage } from '../lib/messaging';
import type { TodoPerson } from '../lib/todos';
import { useLanguage } from '../components/LanguageProvider';
import type { CalContextItem } from '../lib/calendar/calendarSync';
import { getSessionRoster, isAttendanceTaken, localDay, explicitlyAbsent } from '../lib/attendanceRoster';
import GatheringMemberChip from '../components/ui/GatheringMemberChip';
import { useUndoSnack } from '../hooks/useUndoSnack';
import { UndoSnackbar } from '../components/UndoSnackbar';

/** Day / month / weekday names follow the reader's language, not date-fns'
 *  English default. */
function useDayNames() {
  const { language } = useLanguage();
  const tag = language === 'es' ? 'es' : 'en-US';
  const fmt = (d: Date, options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(tag, options).format(d);
  return {
    /** "Saturday, October 24" / "sábado, 24 de octubre" — one Intl call, so the
     *  order of the parts belongs to the language, not to this component. */
    longDate: (d: Date) => fmt(d, { weekday: 'long', day: 'numeric', month: 'long' }),
    weekday: (d: Date) => fmt(d, { weekday: 'long' }),
    shortWeekday: (d: Date) => fmt(d, { weekday: 'short' }).replace('.', ''),
    month: (d: Date) => fmt(d, { month: 'short' }).replace('.', ''),
    longMonth: (d: Date) => fmt(d, { month: 'long' }),
    day: (d: Date) => String(d.getDate()),
  };
}

/** A handler that may write to Firestore (mirrors Attendance's own alias). */
type AsyncVoid = Promise<void>;
/** Writes one exact mark for one person — what an Undo needs, including
 *  "no mark at all" on a week nobody had recorded. */
type SetAttendanceStatus = (contact: Contact, eventId: string, status: 'present' | 'absent' | undefined) => AsyncVoid;

// A one-off Gathering shown in "Coming up" — no calendar merge anymore
// (ADR 0016 decision 2), so this is just an upcoming `events` doc.
export interface UpcomingGathering {
  id: string;
  name: string;
  date: string | Date;
  time?: string;
  location?: string;
}

interface AttendanceMobileProps {
  contacts: Contact[];
  events: Gathering[];
  sessions: Gathering[];
  upcoming: UpcomingGathering[];
  calContext?: CalContextItem[];
  missed: { contact: Contact; since: number; lastSeen: Gathering }[];
  avgPer: number;
  isAdmin: boolean;
  onOpenContact: (contact: Contact) => void;
  onLogGathering: () => void;
  onEditSession: (session: Gathering) => void;
  onDeleteSession: (id: string, name: string) => Promise<void>;
  cycleAttendance: (contact: Contact, eventId: string) => Promise<void>;
  /** Writes one exact mark — what an Undo needs, including "no mark at all". */
  setAttendanceStatus?: SetAttendanceStatus;
  here: (gathering: Gathering, contactId: string) => boolean;
  RsvpCountComponent: React.ComponentType<{ eventId: string }>;
  team?: TodoPerson[];
  onOpenTodo?: (contact: Contact, event: Gathering) => void;
  /** The Gathering's expected roster (its Rhythm's, with the week's override). */
  resolvedRosterFor?: (session: Gathering) => string[];
  onToggleRoster?: (event: Gathering, contactId: string, add: boolean) => Promise<void>;
}

export default function AttendanceMobile({
  contacts,
  events,
  sessions,
  upcoming,
  calContext,
  missed,
  avgPer,
  isAdmin,
  onOpenContact,
  onLogGathering,
  onEditSession,
  onDeleteSession,
  cycleAttendance,
  setAttendanceStatus,
  here,
  RsvpCountComponent,
  team,
  onOpenTodo,
  resolvedRosterFor,
  onToggleRoster,
}: AttendanceMobileProps) {
  const { t } = useLanguage();
  const names = useDayNames();
  const [openSessionId, setOpenSessionId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const openSession = openSessionId ? sessions.find((s) => s.id === openSessionId) : null;
  const today = new Date();

  return (
    <div className="flex flex-col min-h-screen bg-surface-container-lowest pb-28 md-page md-mobile page gatherings gthm">
      {/* ── Header ── */}
      <header className="px-5 pt-8 pb-6 bg-surface border-b border-outline-variant/30 gthm-hero">
        <div className="text-xs   text-on-surface-variant/80 font-semibold mb-1">
          {names.longDate(today)}
        </div>
        <h1 className="font-serif text-[32px] leading-tight text-on-surface gthm-h1">{t('nav.gatherings')}</h1>
        <p className="text-[15px] text-on-surface-variant/90 leading-relaxed mt-2 gthm-line">
          {t('attendance.weve_come_together')} <b className="font-semibold text-on-surface">{events.length} {t('attendance.times')}</b> {t('attendance.this_season')}
          {events.length > 0 && (
            <>
              , {t('attendance.averaging')} <b className="font-semibold text-on-surface">{avgPer} {t('attendance.people')}</b> {t('attendance.each_time')}
            </>
          )}
          .
        </p>
        {isAdmin && (
          <button
            onClick={onLogGathering}
            className="mt-3.5 inline-flex items-center gap-2 px-4 py-2 bg-primary text-on-primary text-xs font-semibold rounded-full active:brightness-95 transition-all gthm-log"
          >
            <Plus className="w-4 h-4" /> {t('attendance.log_a_gathering')}
          </button>
        )}
      </header>

      {/* ── Who we've missed ── */}
      {missed.length > 0 && (
        <section className="mt-6 px-5 gthm-sec">
          <h2 className="font-serif text-lg text-on-surface mb-3 gthm-sec-h">{t('attendance.who_weve_missed')}</h2>
          <div className="space-y-2 mdm-people">
            {missed.map(({ contact, since, lastSeen }) => (
              <div
                key={contact.id}
                className="flex items-center justify-between p-1 bg-surface rounded-3xl border border-outline-variant/40 active:bg-surface-variant/30 transition-colors mdm-person"
              >
                {/* The row itself is the door into the person's page, so it is
                    a real button — not a div with a click handler (#1769). */}
                <button
                  type="button"
                  onClick={() => onOpenContact(contact)}
                  className="flex items-center gap-3 min-w-0 flex-1 text-left p-2.5 rounded-3xl"
                >
                  <Avatar contact={contact} size="md" />
                  <div className="min-w-0 flex-1">
                    <div className="font-serif font-medium text-[16.5px] text-on-surface truncate">
                      {contact.name}
                    </div>
                    <div className="text-xs text-error font-medium mt-0.5">
                      {t('attendance.missed_gatherings_since').replace('{n}', String(since)).replace('{name}', lastSeen.name)}
                    </div>
                  </div>
                </button>
                {/* No number, no door: `openMessage` falls back to Google
                    Messages for web, which is nothing on a phone (#1769). */}
                {contact.phone ? (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      openMessage(contact.phone);
                    }}
                    className="ml-1 min-w-[44px] min-h-[44px] grid place-items-center bg-accent-soft text-accent rounded-xl active:scale-95 transition-all"
                    aria-label={`${t('myDay.message')} ${contact.name}`}
                  >
                    <MessageSquare className="w-4 h-4" />
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── When we met (List of past gatherings) ── */}
      <section className="mt-8 px-5 gthm-sec">
        <div className="flex items-center justify-between mb-3 gthm-sec-h">
          <h2 className="font-serif text-lg text-on-surface">{t('attendance.when_we_met')}</h2>
        </div>

        {/* Past gatherings list */}
        <div className="space-y-2.5 gthm-sessions">
          {sessions.length === 0 ? (
            <div className="py-12 text-center text-sm italic text-on-surface-variant bg-surface/40 rounded-2xl border border-dashed border-outline-variant/30 gthm-none shadow-inner">
              {t('attendance.no_gatherings_of_kind')}
            </div>
          ) : (
            sessions.map((s) => {
              const d = localDay(s.date);
              const attendedCount = contacts.filter((c) => here(s, c.id)).length;
              const recorded = isAttendanceTaken(s);
              return (
                <button
                  key={s.id}
                  onClick={() => setOpenSessionId(s.id)}
                  className="w-full flex items-center justify-between p-4 bg-surface rounded-2xl border border-outline-variant/40 active:bg-surface-variant/35 transition-all text-left  gthm-scard"
                >
                  <div className="flex items-center gap-4 min-w-0 flex-1">
                    <div className="text-center shrink-0 w-10 gthm-sdate">
                      <span className="block text-[10px] font-semibold   text-on-surface-variant/80 gthm-sdow">
                        {d && isValid(d) ? names.shortWeekday(d) : '–'}
                      </span>
                      <span className="block font-serif text-2xl text-on-surface leading-none mt-0.5 gthm-sday">
                        {d && isValid(d) ? names.day(d) : '–'}
                      </span>
                      <span className="block text-[9px] font-semibold  text-on-surface-variant/80 gthm-smo">
                        {d && isValid(d) ? names.month(d) : ''}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1 gthm-smain">
                      <div className="font-serif font-semibold text-[16.5px] text-on-surface truncate gthm-stitle">
                        {s.name}
                      </div>
                      <div className="text-xs text-on-surface-variant truncate mt-0.5 gthm-sblurb">
                        {s.cancelled ? t('attendance.cancelled', 'Cancelled') : (s.location || '')}
                      </div>
                      {/* "0 attended" reads the same for a recorded nil and for a
                          week nobody has looked at; only one of those is a fact (#1769). */}
                      <div className="text-[11px] font-semibold text-accent mt-1.5 gthm-scount">
                        {recorded
                          ? <><b>{attendedCount}</b> {t('attendance.attended')}</>
                          : t('attendance.not_recorded', 'Not recorded')}
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-on-surface-variant/40 shrink-0 ml-2 gthm-schev" />
                </button>
              );
            })
          )}
        </div>
      </section>

      {/* ── Coming up (Calendar) ── */}
      <section className="mt-8 px-5 gthm-sec">
        <h2 className="font-serif text-lg text-on-surface mb-3">{t('attendance.coming_up')}</h2>
        <div className="bg-surface rounded-3xl border border-outline-variant/50 p-4 divide-y divide-outline-variant/30 gthm-up">
          {upcoming.length === 0 ? (
            <p className="text-sm text-on-surface-variant py-4 text-center">
              {t('attendance.nothing_upcoming', 'Nothing on the calendar this week.')}
            </p>
          ) : (
            upcoming.map((ev) => {
              const d = localDay(ev.date);
              return (
                <div key={ev.id} className="py-3.5 first:pt-0 last:pb-0 flex items-center gap-3.5 gthm-uprow">
                  <div className="text-center shrink-0 w-10 tw-date">
                    <div className="font-serif text-xl text-on-surface leading-none d">
                      {d && isValid(d) ? names.day(d) : '–'}
                    </div>
                    <div className="text-[10px] text-on-surface-variant/80 mt-0.5 m">
                      {d && isValid(d) ? names.month(d) : ''}
                    </div>
                  </div>
                  <div className="min-w-0 flex-1 gthm-up-main">
                    <div className="font-medium text-on-surface truncate tw-title">
                      {ev.name}
                    </div>
                    <div className="text-xs text-on-surface-variant mt-0.5 truncate tw-meta">
                      {[ev.time, ev.location || t('attendance.no_location_set')].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                  <RsvpCountComponent eventId={ev.id} />
                </div>
              );
            })
          )}
        </div>
      </section>

      {/* ── Dates worth knowing about ── */}
      {calContext && calContext.length > 0 && (
        <section className="mt-8 px-5 gthm-sec">
          <h2 className="font-serif text-lg text-on-surface mb-3">{t('calendar.also_on_calendar', 'Also on the calendar')}</h2>
          <div className="bg-surface rounded-3xl border border-outline-variant/50 p-4 divide-y divide-outline-variant/30">
            {calContext.map((it) => {
              const d = localDay(it.date);
              return (
                <div key={it.id} className="py-3.5 first:pt-0 last:pb-0 flex items-center gap-3.5 cal-ctx">
                  <div className="text-center shrink-0 w-10 tw-date">
                    <div className="font-serif text-xl text-on-surface leading-none d">
                      {d && isValid(d) ? names.day(d) : '–'}
                    </div>
                    <div className="text-[10px] text-on-surface-variant/80 mt-0.5 m">
                      {d && isValid(d) ? names.month(d) : ''}
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-on-surface truncate tw-title">{it.title}</div>
                    <div className="text-xs text-on-surface-variant mt-0.5 truncate tw-meta">
                      {[it.time, it.catLabel].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ── Figures ── */}
      <div className="mt-10 px-5 pt-5 border-t border-outline-variant/30 flex flex-wrap gap-x-8 gap-y-4 gthm-figs">
        <Figure n={events.length} label={t('attendance.gatherings_label')} />
        <Figure n={avgPer} label={t('attendance.attended_on_average')} />
        <Figure n={missed.length} label={t('attendance.quiet_lately')} />
        <span className="text-[13px] text-on-surface-variant/70 italic w-full mt-2">
          {t('attendance.counting_heads')}
        </span>
      </div>

      {/* ── RosterSheet bottom sheet ── */}
      {openSession && (
        <RosterSheet
          session={openSession}
          contacts={contacts}
          cycleAttendance={cycleAttendance}
          setAttendanceStatus={setAttendanceStatus}
          onEditSession={onEditSession}
          onDeleteSession={onDeleteSession}
          confirmDeleteId={confirmDeleteId}
          setConfirmDeleteId={setConfirmDeleteId}
          onOpenTodo={onOpenTodo}
          resolvedRosterFor={resolvedRosterFor}
          onToggleRoster={isAdmin ? onToggleRoster : undefined}
          isAdmin={isAdmin}
          onClose={() => {
            setOpenSessionId(null);
            setConfirmDeleteId(null);
          }}
        />
      )}
    </div>
  );
}

interface RosterSheetProps {
  session: Gathering;
  contacts: Contact[];
  cycleAttendance: (contact: Contact, eventId: string) => Promise<void>;
  setAttendanceStatus?: SetAttendanceStatus;
  onEditSession: (session: Gathering) => void;
  onDeleteSession: (id: string, name: string) => Promise<void>;
  confirmDeleteId: string | null;
  setConfirmDeleteId: (id: string | null) => void;
  onOpenTodo?: (contact: Contact, event: Gathering) => void;
  resolvedRosterFor?: (session: Gathering) => string[];
  /** Only passed for Full-timers. */
  onToggleRoster?: (event: Gathering, contactId: string, add: boolean) => Promise<void>;
  /** Edit and Remove are Full-timer work; a Student was shown both and neither
   *  did anything (#1769). */
  isAdmin: boolean;
  onClose: () => void;
}

function RosterSheet({
  session,
  contacts,
  cycleAttendance,
  setAttendanceStatus,
  onEditSession,
  onDeleteSession,
  confirmDeleteId,
  setConfirmDeleteId,
  onOpenTodo,
  resolvedRosterFor,
  onToggleRoster,
  isAdmin,
  onClose,
}: RosterSheetProps) {
  const { t } = useLanguage();
  const { undoSnack, showUndoSnack, closeUndoSnack } = useUndoSnack();
  const meta = session.cancelled ? t('attendance.cancelled', 'Cancelled') : (session.location || '');
  const roster = resolvedRosterFor ? resolvedRosterFor(session) : session.roster ?? [];
  const rosterIds = new Set(roster);
  const { present, absent } = getSessionRoster(session, contacts, roster);
  const recorded = isAttendanceTaken(session);
  const titleId = React.useId();
  const sheetRef = useRef<HTMLDivElement>(null);

  // A sheet that opens over the page is a dialog: focus moves into it and
  // Escape closes it. It used to leave focus on the row behind the scrim (#1769).
  React.useEffect(() => {
    sheetRef.current?.focus();
  }, []);

  /** A mark is one tap and it is consequential, so it reports itself and can be
   *  undone — restored to the exact state it replaced, including "no mark". */
  const mark = (contact: Contact, came: boolean) => {
    const onRoster = rosterIds.has(contact.id);
    const next: 'present' | 'absent' | undefined = came ? (onRoster ? 'absent' : undefined) : 'present';
    const previous: 'present' | 'absent' | undefined = came
      ? 'present'
      : (explicitlyAbsent(session, contact.id) ? 'absent' : undefined);
    const template = came
      ? (onRoster ? 'attendance.marked_missed' : 'attendance.marked_cleared')
      : 'attendance.marked_came';
    const fallback = came
      ? (onRoster ? '{name} moved to We missed' : '{name} unmarked')
      : '{name} marked as came';
    const write = setAttendanceStatus ?? ((c: Contact, id: string) => cycleAttendance(c, id));
    showUndoSnack(
      t(template, fallback).replace('{name}', contact.name),
      () => { void write(contact, session.id, previous); },
    );
    void write(contact, session.id, next);
  };

  return (
    <>
      <div
        className="fixed inset-0 z-[200] bg-black/35 flex items-end justify-center scrim"
        onClick={onClose}
      >
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
        className="bg-surface rounded-t-2xl shadow-2xl w-full max-h-[85vh] flex flex-col overflow-hidden modal ibxs animate-in slide-in-from-bottom duration-300 outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1 rounded-full bg-outline/20 mx-auto my-3 shrink-0 ibxs-grab" />
        <div className="flex items-center justify-between px-5 pt-1 ibxs-head">
          <div className="ibxs-headtext">
            <h3 id={titleId} className="font-serif text-lg text-on-surface ibxs-title">{session.name}</h3>
            <p className="text-xs text-on-surface-variant mt-0.5 ibxs-meta">{meta}</p>
          </div>
          <button
            onClick={onClose}
            className="min-w-[44px] min-h-[44px] grid place-items-center rounded-full text-on-surface-variant hover:bg-surface-variant transition-colors modal-x"
            aria-label={t('actions.close')}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* A called-off week is not a full house: nobody was there, because
            there was nothing to be at (ADR 0005). And an unrecorded week is not
            a list of absences — say which one this is before the names (#1769). */}
        {session.cancelled ? (
          <div className="px-5 py-4 text-sm italic text-on-surface-variant border-t border-outline-variant/30">
            {t('attendance.week_cancelled', "This week was called off — nobody's counted absent.")}
          </div>
        ) : (
          <>
            <div className="px-5 py-2 text-[11px] italic text-on-surface-variant/80 border-b border-outline-variant/30 gthm-legend-hint">
              {recorded
                ? t('attendance.taken_label', 'Attendance recorded')
                : t('attendance.unrecorded_hint', 'Attendance not recorded yet — the first tap starts the record.')}
              {' '}
              <span className="not-italic">·</span>{' '}
              {t('attendance.tap_name_to_cycle')}
            </div>

            {/* Scrollable rosters */}
            <div className="overflow-y-auto px-5 pb-8 pt-4 space-y-5 mds-body">
              {/* Came */}
              <div className="gthm-rcol">
                <div className="text-xs font-semibold text-on-surface-variant/80 mb-2 gthm-rcol-h">
                  {t('attendance.attended_header')} <span className="font-normal">{present.length}</span>
                </div>
                {present.length === 0 ? (
                  <div className="py-4 text-xs italic text-on-surface-variant/80 text-center gth-empty">{t('attendance.no_one_marked_yet')}</div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {present.map((c) => (
                      <GatheringMemberChip
                        key={c.id}
                        contact={c}
                        came
                        onRoster={rosterIds.has(c.id)}
                        onToggle={() => mark(c, true)}
                        onAddToRoster={onToggleRoster ? () => onToggleRoster(session, c.id, true) : undefined}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Missed */}
              <div className="gthm-rcol">
                <div className="text-xs font-semibold text-on-surface-variant/80 mb-2 gthm-rcol-h muted">
                  {t('attendance.we_missed')} <span className="font-normal">{absent.length}</span>
                </div>
                {absent.length === 0 ? (
                  <div className="py-4 text-xs italic text-on-surface-variant/80 text-center gth-empty font-medium text-stage-teal">{t('attendance.everyone_came')}</div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {absent.map((c) => (
                      <GatheringMemberChip
                        key={c.id}
                        contact={c}
                        came={false}
                        onRoster={rosterIds.has(c.id)}
                        onToggle={() => mark(c, false)}
                        onMakeTodo={onOpenTodo ? () => onOpenTodo(c, session) : undefined}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Manage Session buttons — Full-timers only, matching desktop.
                  "Remove" used to be offered to Students and did nothing (#1769). */}
              {isAdmin && (
                <div className="pt-4 border-t border-outline-variant/30 flex gap-4 gthm-rmanage">
                  {confirmDeleteId === session.id ? (
                    <div className="w-full flex items-center justify-between bg-error-container/40 p-3 rounded-xl border border-error/25 gth-confirm">
                      <span className="text-xs font-medium text-on-error-container">{t('attendance.remove_gathering_and_record')}</span>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setConfirmDeleteId(null)}
                          className="min-h-[44px] px-3 bg-surface border border-outline rounded-lg text-xs font-semibold text-on-surface"
                        >
                          {t('actions.cancel')}
                        </button>
                        <button
                          onClick={() => {
                            onDeleteSession(session.id, session.name);
                            onClose();
                          }}
                          className="min-h-[44px] px-3 bg-error text-on-error rounded-lg text-xs font-semibold"
                        >
                          {t('actions.remove')}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <button
                        onClick={() => {
                          onEditSession(session);
                          onClose();
                        }}
                        className="min-h-[44px] text-xs font-semibold text-accent inline-flex items-center gap-1.5 gthm-rmng-link"
                      >
                        <Pencil className="w-3.5 h-3.5" /> {t('attendance.edit_details')}
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(session.id)}
                        className="min-h-[44px] text-xs font-semibold text-error inline-flex items-center gap-1.5 gthm-rmng-link danger ml-auto"
                      >
                        <X className="w-3.5 h-3.5" /> {t('actions.remove')}
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>
      </div>
      <UndoSnackbar undoSnack={undoSnack} onClose={closeUndoSnack} />
    </>
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
