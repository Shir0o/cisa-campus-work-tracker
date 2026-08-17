import React, { useEffect, useMemo, useState } from "react";
import { Check } from "lucide-react";
import { format, isValid } from "date-fns";
import { collection, onSnapshot, query } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { cn } from "../../lib/utils";
import { useAuth } from "../AuthProvider";
import { Event } from "../../types";
import { SectionHead } from "./primitives";
import { parseMs, DAY_MS } from "./helpers";
import { setRsvp, subscribeMyRsvps } from "../../lib/rsvp";

// Upcoming gatherings with a per-event RSVP toggle. Self-contained: subscribes
// to events and to the current user's RSVPs. Shared by the Student "Coming up"
// and Community "Open gatherings" landings (events have no time field, so we
// show date · location · type only).
export function UpcomingEventsRsvp({
  heading,
  sub,
  emptyText,
  linkLabel = "Full calendar",
  onLink,
  count = 3,
}: {
  heading: string;
  sub?: string;
  emptyText: string;
  linkLabel?: string;
  onLink?: () => void;
  count?: number;
}) {
  const { user } = useAuth();
  const uid = user?.uid;
  const [events, setEvents] = useState<Event[]>([]);
  const [going, setGoing] = useState<Set<string>>(new Set());

  useEffect(() => {
    const unsub = onSnapshot(query(collection(db, "events")), (snap) =>
      setEvents(snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Event[]),
    );
    return unsub;
  }, []);

  useEffect(() => {
    if (!uid) return;
    return subscribeMyRsvps(uid, setGoing);
  }, [uid]);

  const upcoming = useMemo(() => {
    const now = Date.now() - DAY_MS;
    return events
      .map((ev) => ({ ev, ms: parseMs(ev.date) }))
      .filter((x): x is { ev: Event; ms: number } => x.ms != null && x.ms >= now)
      .sort((a, b) => a.ms - b.ms || (a.ev.order ?? 0) - (b.ev.order ?? 0))
      .slice(0, count);
  }, [events, count]);

  const toggle = (eventId: string) => {
    if (!uid) return;
    const isGoing = going.has(eventId);
    // Optimistic flip; the subscription reconciles to the server state.
    setGoing((prev) => {
      const next = new Set(prev);
      if (isGoing) next.delete(eventId);
      else next.add(eventId);
      return next;
    });
    setRsvp(eventId, { uid, name: user?.displayName || "" }, !isGoing);
  };

  return (
    <section className="mt-12">
      <SectionHead title={heading} sub={sub} linkLabel={onLink ? linkLabel : undefined} onLink={onLink} />
      {upcoming.length > 0 ? (
        <div className="flex flex-col gap-3">
          {upcoming.map(({ ev, ms }) => {
            const d = new Date(ms);
            const meta = [isValid(d) ? format(d, "EEEE") : "", ev.location, ev.type]
              .filter(Boolean)
              .join(" · ");
            const isGoing = going.has(ev.id);
            return (
              <div
                key={ev.id}
                className="flex items-center gap-4 bg-surface rounded-2xl border border-outline-variant/60 p-5"
              >
                <div className="text-center w-12 shrink-0">
                  <div className="font-serif text-2xl text-on-surface leading-none">
                    {isValid(d) ? format(d, "d") : "–"}
                  </div>
                  <div className="text-xs text-on-surface-variant mt-1">
                    {isValid(d) ? format(d, "MMM") : ""}
                  </div>
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-serif text-lg text-on-surface truncate">{ev.name}</h3>
                  {meta && <div className="text-xs text-on-surface-variant mt-0.5 truncate">{meta}</div>}
                </div>
                <button
                  onClick={() => toggle(ev.id)}
                  className={cn(
                    "inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-colors shrink-0",
                    isGoing
                      ? "border border-outline-variant text-on-surface hover:bg-surface-variant"
                      : "bg-primary text-on-primary hover:opacity-90",
                  )}
                >
                  {isGoing ? (
                    <>
                      <Check className="w-3.5 h-3.5" /> Coming
                    </>
                  ) : (
                    "I'll be there"
                  )}
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-on-surface-variant py-2">{emptyText}</p>
      )}
    </section>
  );
}
