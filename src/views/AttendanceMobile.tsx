import React, { useState } from 'react';
import { format, isValid } from 'date-fns';
import { Plus, Settings2, X, MessageSquare, ChevronRight, Check, Users, Pencil } from 'lucide-react';
import { cn } from '../lib/utils';
import { Contact, Event } from '../types';
import { Avatar } from '../components/landing/primitives';
import { openMessage } from '../lib/messaging';

interface AttendanceMobileProps {
  contacts: Contact[];
  events: Event[];
  sessions: Event[];
  upcoming: { ev: Event; ms: number }[];
  missed: { contact: Contact; since: number; lastSeen: Event }[];
  avgPer: number;
  activeFilter: string;
  setTypeFilter: (type: string) => void;
  gatheringTypes: any[];
  isAdmin: boolean;
  onOpenContact: (contact: Contact) => void;
  onLogGathering: () => void;
  onManageTypes: () => void;
  onEditSession: (session: Event) => void;
  onDeleteSession: (id: string, name: string) => Promise<void>;
  cycleAttendance: (contact: Contact, eventId: string) => Promise<void>;
  here: (contact: Contact, eventId: string) => boolean;
  RsvpCountComponent: React.ComponentType<{ eventId: string }>;
}

export default function AttendanceMobile({
  contacts,
  events,
  sessions,
  upcoming,
  missed,
  avgPer,
  activeFilter,
  setTypeFilter,
  gatheringTypes,
  isAdmin,
  onOpenContact,
  onLogGathering,
  onManageTypes,
  onEditSession,
  onDeleteSession,
  cycleAttendance,
  here,
  RsvpCountComponent,
}: AttendanceMobileProps) {
  const [openSessionId, setOpenSessionId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const openSession = openSessionId ? sessions.find((s) => s.id === openSessionId) : null;

  // Gatherings filter pills: 'All' + custom kinds
  const filterOptions = ['All', ...gatheringTypes.map((t) => t.name)];

  return (
    <div className="flex flex-col min-h-screen bg-surface-container-lowest pb-28 md-page md-mobile page gatherings gthm">
      {/* ── Header ── */}
      <header className="px-5 pt-8 pb-6 bg-surface border-b border-outline-variant/30 gthm-hero">
        <div className="text-xs   text-on-surface-variant/80 font-semibold mb-1">
          {format(new Date(), 'EEEE, MMMM d')}
        </div>
        <h1 className="font-serif text-[32px] leading-tight text-on-surface gthm-h1">Gatherings</h1>
        <p className="text-[15px] text-on-surface-variant/90 leading-relaxed mt-2 gthm-line">
          We've come together <b className="font-semibold text-on-surface">{events.length} times</b> this season
          {events.length > 0 && (
            <>
              , averaging <b className="font-semibold text-on-surface">{avgPer} people</b> each time
            </>
          )}
          .
        </p>
        {isAdmin && (
          <button
            onClick={onLogGathering}
            className="mt-3.5 inline-flex items-center gap-2 px-4 py-2 bg-primary text-on-primary text-xs font-semibold rounded-full active:brightness-95 transition-all gthm-log"
          >
            <Plus className="w-4 h-4" /> Log a gathering
          </button>
        )}
      </header>

      {/* ── Who we've missed ── */}
      {missed.length > 0 && (
        <section className="mt-6 px-5 gthm-sec">
          <h2 className="font-serif text-lg text-on-surface mb-3 gthm-sec-h">Who we've missed</h2>
          <div className="space-y-2 mdm-people">
            {missed.map(({ contact, since, lastSeen }) => (
              <div
                key={contact.id}
                onClick={() => onOpenContact(contact)}
                className="flex items-center justify-between p-3.5 bg-surface rounded-2xl border border-outline-variant/40 active:bg-surface-variant/30 transition-colors mdm-person"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <Avatar contact={contact} size="md" />
                  <div className="min-w-0 flex-1">
                    <div className="font-serif font-medium text-[16.5px] text-on-surface truncate">
                      {contact.name}
                    </div>
                    <div className="text-xs text-error font-medium mt-0.5">
                      Missed <span className="underline">{since}</span> gatherings since {lastSeen.name}
                    </div>
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    openMessage(contact.phone);
                  }}
                  className="ml-3 p-2.5 bg-accent-soft text-accent rounded-xl active:scale-95 transition-all"
                  aria-label={`Message ${contact.name}`}
                >
                  <MessageSquare className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── When we met (List of past gatherings) ── */}
      <section className="mt-8 px-5 gthm-sec">
        <div className="flex items-center justify-between mb-3 gthm-sec-h">
          <h2 className="font-serif text-lg text-on-surface">When we met</h2>
          {isAdmin && (
            <button
              onClick={onManageTypes}
              className="text-xs font-semibold text-accent inline-flex items-center gap-1 gthm-kinds"
            >
              <Settings2 className="w-3 h-3" /> Kinds
            </button>
          )}
        </div>

        {/* Filter scrollbar */}
        <div className="flex gap-1.5 overflow-x-auto pb-3 mb-2 scrollbar-none whitespace-nowrap gthm-filter">
          {filterOptions.map((t) => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={cn(
                "px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-all gthm-fpill",
                activeFilter === t
                  ? "bg-primary text-on-primary border-primary active "
                  : "bg-surface border-outline-variant/60 text-on-surface-variant hover:bg-surface-variant"
              )}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Past gatherings list */}
        <div className="space-y-2.5 gthm-sessions">
          {sessions.length === 0 ? (
            <div className="py-12 text-center text-sm italic text-on-surface-variant bg-surface/40 rounded-2xl border border-dashed border-outline-variant/30 gthm-none shadow-inner">
              No gatherings of this kind yet.
            </div>
          ) : (
            sessions.map((s) => {
              const d = s.date ? new Date(s.date + 'T12:00:00') : null;
              const attendedCount = contacts.filter((c) => here(c, s.id)).length;
              return (
                <button
                  key={s.id}
                  onClick={() => setOpenSessionId(s.id)}
                  className="w-full flex items-center justify-between p-4 bg-surface rounded-2xl border border-outline-variant/40 active:bg-surface-variant/35 transition-all text-left  gthm-scard"
                >
                  <div className="flex items-center gap-4 min-w-0 flex-1">
                    <div className="text-center shrink-0 w-10 gthm-sdate">
                      <span className="block text-[10px] font-semibold   text-on-surface-variant/80 gthm-sdow">
                        {d && isValid(d) ? format(d, 'eee') : '–'}
                      </span>
                      <span className="block font-serif text-2xl text-on-surface leading-none mt-0.5 gthm-sday">
                        {d && isValid(d) ? format(d, 'd') : '–'}
                      </span>
                      <span className="block text-[9px] font-semibold  text-on-surface-variant/80 gthm-smo">
                        {d && isValid(d) ? format(d, 'MMM') : ''}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1 gthm-smain">
                      <div className="font-serif font-semibold text-[16.5px] text-on-surface truncate gthm-stitle">
                        {s.name}
                      </div>
                      <div className="text-xs text-on-surface-variant truncate mt-0.5 gthm-sblurb">
                        {s.type} {s.location ? `· ${s.location}` : ''}
                      </div>
                      <div className="text-[11px] font-semibold text-accent mt-1.5 gthm-scount">
                        <b>{attendedCount}</b> attended
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
        <h2 className="font-serif text-lg text-on-surface mb-3">Coming up</h2>
        <div className="bg-surface rounded-2xl border border-outline-variant/50 p-4  divide-y divide-outline-variant/30 gthm-up">
          {upcoming.length === 0 ? (
            <p className="text-sm text-on-surface-variant py-4 text-center">
              Nothing on the calendar this week.
            </p>
          ) : (
            upcoming.map(({ ev }) => {
              const d = ev.date ? new Date(ev.date + 'T12:00:00') : null;
              return (
                <div key={ev.id} className="py-3.5 first:pt-0 last:pb-0 flex items-center gap-3.5 gthm-uprow">
                  <div className="text-center shrink-0 w-10 tw-date">
                    <div className="font-serif text-xl text-on-surface leading-none d">
                      {d && isValid(d) ? format(d, 'd') : '–'}
                    </div>
                    <div className="text-[10px]   text-on-surface-variant/80 mt-0.5 m">
                      {d && isValid(d) ? format(d, 'MMM') : ''}
                    </div>
                  </div>
                  <div className="min-w-0 flex-1 gthm-up-main">
                    <div className="font-medium text-on-surface truncate tw-title">{ev.name}</div>
                    <div className="text-xs text-on-surface-variant mt-0.5 truncate tw-meta">
                      {ev.location || 'No location set'}
                    </div>
                  </div>
                  <RsvpCountComponent eventId={ev.id} />
                </div>
              );
            })
          )}
        </div>
      </section>

      {/* ── Figures ── */}
      <div className="mt-10 px-5 pt-5 border-t border-outline-variant/30 flex flex-wrap gap-x-8 gap-y-4 gthm-figs">
        <Figure n={events.length} label="gatherings" />
        <Figure n={avgPer} label="attended on average" />
        <Figure n={missed.length} label="quiet lately" />
        <span className="text-[13px] text-on-surface-variant/70 italic w-full mt-2">
          Counting heads is just a way of noticing who's missing.
        </span>
      </div>

      {/* ── RosterSheet bottom sheet ── */}
      {openSession && (
        <RosterSheet
          session={openSession}
          contacts={contacts}
          here={here}
          cycleAttendance={cycleAttendance}
          onEditSession={onEditSession}
          onDeleteSession={onDeleteSession}
          confirmDeleteId={confirmDeleteId}
          setConfirmDeleteId={setConfirmDeleteId}
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
  session: Event;
  contacts: Contact[];
  here: (contact: Contact, eventId: string) => boolean;
  cycleAttendance: (contact: Contact, eventId: string) => Promise<void>;
  onEditSession: (session: Event) => void;
  onDeleteSession: (id: string, name: string) => Promise<void>;
  confirmDeleteId: string | null;
  setConfirmDeleteId: (id: string | null) => void;
  onClose: () => void;
}

function RosterSheet({
  session,
  contacts,
  here,
  cycleAttendance,
  onEditSession,
  onDeleteSession,
  confirmDeleteId,
  setConfirmDeleteId,
  onClose,
}: RosterSheetProps) {
  const present = contacts.filter((c) => here(c, session.id));
  const absent = contacts.filter((c) => c.attendance?.[session.id] === 'absent');

  const meta = `${session.type} ${session.location ? '· ' + session.location : ''}`;

  return (
    <div
      className="fixed inset-0 z-[200] bg-black/35 flex items-end justify-center scrim"
      onClick={onClose}
    >
      <div
        className="bg-surface rounded-t-2xl shadow-2xl w-full max-h-[85vh] flex flex-col overflow-hidden modal ibxs animate-in slide-in-from-bottom duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1 rounded-full bg-outline/20 mx-auto my-3 shrink-0 ibxs-grab" />
        <div className="flex items-center justify-between px-5 pt-1 ibxs-head">
          <div className="ibxs-headtext">
            <h3 className="font-serif text-lg text-on-surface ibxs-title">{session.name}</h3>
            <p className="text-xs text-on-surface-variant mt-0.5 ibxs-meta">{meta}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full text-on-surface-variant hover:bg-surface-variant transition-colors modal-x"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Legend */}
        <div className="px-5 py-2 flex gap-4 text-xs font-semibold text-on-surface-variant border-b border-outline-variant/30 gthm-legend">
          <span className="flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-full bg-primary dot present"></i> here</span>
          <span className="flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-full bg-error dot absent"></i> missed</span>
          <span className="text-[11px] italic font-normal text-on-surface-variant/80 ml-auto gthm-legend-hint">Tap a name to cycle.</span>
        </div>

        {/* Scrollable rosters */}
        <div className="overflow-y-auto px-5 pb-8 pt-4 space-y-5 mds-body">
          {/* Here */}
          <div className="gthm-rcol">
            <div className="text-xs font-semibold   text-on-surface-variant/80 mb-2 gthm-rcol-h">
              Here <span className="text-xs px-2 py-0.5 rounded-full bg-primary-container text-on-primary-container font-medium">{present.length}</span>
            </div>
            {present.length === 0 ? (
              <div className="py-4 text-xs italic text-on-surface-variant/80 text-center gth-empty">No one marked yet.</div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {present.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => cycleAttendance(c, session.id)}
                    className="flex items-center gap-2.5 p-2 rounded-xl border text-left bg-surface border-outline-variant hover:bg-surface-variant transition-colors gthm-person here"
                  >
                    <Avatar contact={c} size="sm" />
                    <span className="text-sm text-on-surface truncate flex-1 gthm-person-name">{c.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Missed */}
          <div className="gthm-rcol">
            <div className="text-xs font-semibold   text-on-surface-variant/80 mb-2 gthm-rcol-h muted">
              We missed <span className="text-xs px-2 py-0.5 rounded-full bg-error-container text-on-error-container font-medium">{absent.length}</span>
            </div>
            {absent.length === 0 ? (
              <div className="py-4 text-xs italic text-on-surface-variant/80 text-center gth-empty font-medium text-stage-teal">Everyone came!</div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {absent.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => cycleAttendance(c, session.id)}
                    className="flex items-center gap-2.5 p-2 rounded-xl border text-left bg-surface border-outline-variant hover:bg-surface-variant transition-colors gthm-person gone"
                  >
                    <Avatar contact={c} size="sm" />
                    <span className="text-sm text-on-surface truncate flex-1 gthm-person-name">{c.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Manage Session buttons */}
          <div className="pt-4 border-t border-outline-variant/30 flex gap-4 gthm-rmanage">
            {confirmDeleteId === session.id ? (
              <div className="w-full flex items-center justify-between bg-error-container/40 p-3 rounded-xl border border-error/25 gth-confirm">
                <span className="text-xs font-medium text-on-error-container">Remove this gathering and its record?</span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setConfirmDeleteId(null)}
                    className="px-2.5 py-1 bg-surface border border-outline rounded-lg text-xs font-semibold text-on-surface"
                  >
                    Keep
                  </button>
                  <button
                    onClick={() => {
                      onDeleteSession(session.id, session.name);
                      onClose();
                    }}
                    className="px-2.5 py-1 bg-error text-on-error rounded-lg text-xs font-semibold"
                  >
                    Remove
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
                  className="text-xs font-semibold text-accent inline-flex items-center gap-1.5 gthm-rmng-link"
                >
                  <Pencil className="w-3.5 h-3.5" /> Edit details
                </button>
                <button
                  onClick={() => setConfirmDeleteId(session.id)}
                  className="text-xs font-semibold text-error inline-flex items-center gap-1.5 gthm-rmng-link danger ml-auto"
                >
                  <X className="w-3.5 h-3.5" /> Remove
                </button>
              </>
            )}
          </div>
        </div>
      </div>
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
