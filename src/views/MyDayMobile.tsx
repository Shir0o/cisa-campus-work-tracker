import React, { useMemo } from 'react';
import { useAuth } from '../components/AuthProvider';
import { Contact, Event, PrayerRecord, Stage } from '../types';
import { format, isValid } from 'date-fns';
import { MessageSquare, Calendar, ChevronRight } from 'lucide-react';

interface MyDayMobileProps {
  contacts: Contact[];
  events: Event[];
  prayers: PrayerRecord[];
  stages: Stage[];
}

export default function MyDayMobile({ contacts, events, prayers }: MyDayMobileProps) {
  const { user } = useAuth();
  const firstName = user?.displayName?.split(" ")[0] || "friend";

  // Basic mock sorting/filtering to show UI
  const myContacts = useMemo(() => contacts.slice(0, 5), [contacts]);
  const thisWeek = useMemo(() => events.slice(0, 3), [events]);
  const myPrayers = useMemo(() => prayers.slice(0, 3), [prayers]);

  return (
    <div className="flex flex-col min-h-screen bg-surface-container-lowest pb-24">
      {/* ── Mobile Hero ── */}
      <header className="px-5 pt-10 pb-6 relative bg-surface">
        <h1 className="font-serif text-[32px] leading-tight text-on-surface">
          Good morning, {firstName}.
        </h1>
        <p className="text-sm text-on-surface-variant mt-2 font-medium tracking-wide uppercase">
          {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        </p>
      </header>

      {/* ── Your People ── */}
      <section className="mt-8 px-5">
        <h2 className="text-sm font-semibold tracking-widest uppercase text-on-surface-variant mb-4">
          Your people
        </h2>
        <div className="bg-surface rounded-2xl overflow-hidden border border-outline-variant/50 divide-y divide-outline-variant/30 shadow-sm">
          {myContacts.length > 0 ? myContacts.map(c => (
            <div key={c.id} className="flex items-center justify-between p-4 active:bg-surface-variant/50 transition-colors">
              <div className="flex items-center gap-3 overflow-hidden flex-1">
                <div className="w-10 h-10 rounded-full bg-secondary-container text-on-secondary-container flex items-center justify-center font-medium shrink-0">
                  {c.name.charAt(0)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-on-surface truncate">{c.name}</div>
                  <div className="text-xs text-on-surface-variant mt-0.5 truncate">
                    {c.role || "Contact"}
                  </div>
                </div>
              </div>
              <button className="ml-3 p-2 bg-surface-container-highest rounded-full text-on-surface-variant active:scale-95 shrink-0">
                <MessageSquare className="w-4 h-4" />
              </button>
            </div>
          )) : (
            <p className="p-4 text-sm text-on-surface-variant">No contacts assigned yet.</p>
          )}
        </div>
      </section>

      {/* ── Your Week ── */}
      <section className="mt-8 px-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold tracking-widest uppercase text-on-surface-variant">
            Your week
          </h2>
          <span className="text-xs text-primary font-medium">Calendar</span>
        </div>

        {thisWeek.length > 0 ? (
          <div className="space-y-3">
            {thisWeek.map((ev, i) => {
              const rd = new Date(ev.date);
              const isFirst = i === 0;

              if (isFirst) {
                return (
                  <div key={ev.id} className="bg-stage-accent-soft rounded-2xl border border-primary/20 p-5 shadow-sm">
                    <div className="text-[10px] font-bold uppercase tracking-widest text-primary flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {isValid(rd) ? format(rd, "EEEE, MMM d") : "This week"}
                    </div>
                    <h3 className="font-serif text-xl text-on-surface mt-2">{ev.name}</h3>
                    <div className="text-xs text-on-surface-variant mt-2">
                      {ev.location && <span className="bg-surface rounded-full px-2 py-1 border border-outline-variant/60">{ev.location}</span>}
                    </div>
                  </div>
                );
              }

              return (
                <div key={ev.id} className="bg-surface rounded-2xl border border-outline-variant/50 p-4 shadow-sm flex items-center gap-3">
                  <div className="text-center shrink-0 w-10">
                    <div className="font-serif text-xl text-on-surface leading-none">
                      {isValid(rd) ? format(rd, "d") : "–"}
                    </div>
                    <div className="text-[10px] uppercase tracking-wide text-on-surface-variant mt-0.5">
                      {isValid(rd) ? format(rd, "MMM") : ""}
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-on-surface truncate">{ev.name}</div>
                    <div className="text-xs text-on-surface-variant mt-0.5 truncate">
                      {ev.location || "No location set"}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-on-surface-variant">Nothing on the calendar this week.</p>
        )}
      </section>

      {/* ── Your Prayers ── */}
      <section className="mt-8 px-5">
        <h2 className="text-sm font-semibold tracking-widest uppercase text-on-surface-variant mb-4">
          Your prayers
        </h2>
        <div className="bg-surface rounded-2xl border border-outline-variant/50 shadow-sm overflow-hidden divide-y divide-outline-variant/30">
          {myPrayers.length > 0 ? myPrayers.map(p => (
            <div key={p.id} className="p-4 active:bg-surface-variant/50 transition-colors flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-medium text-on-surface truncate">{p.status}</h3>
                <p className="text-xs text-on-surface-variant mt-1 line-clamp-2 leading-relaxed">{p.burden}</p>
              </div>
              <ChevronRight className="w-5 h-5 text-on-surface-variant/50 shrink-0" />
            </div>
          )) : (
            <p className="p-4 text-sm text-on-surface-variant">No prayers held currently.</p>
          )}
        </div>
      </section>

    </div>
  );
}
