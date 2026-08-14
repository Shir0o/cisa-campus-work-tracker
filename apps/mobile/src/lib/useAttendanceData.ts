// Live data for the native Gatherings (Attendance) screen — who we've missed,
// past sessions with roster marking, and coming-up gatherings. Mirrors the
// subscriptions + derivations in the web app's src/views/Attendance.tsx.
import { useEffect, useMemo, useState } from 'react';
import {
  hasMinRole,
  here,
  sessionsNewestFirst,
  upcomingEventsForRsvp,
  whoWeMissed,
  type AppRole,
  type Contact,
  type Event,
} from '@cisa/core';
import { handleFirestoreError, OperationType } from './firebase';
import { subscribeContacts } from './data/contacts';
import { subscribeEvents } from './data/events';
import { cycleAttendance as cycleAttendanceDoc } from './data/attendance';
import { useIdentityReset } from './useIdentityReset';

export function useAttendanceData(uid: string | null, displayName: string | null, role: AppRole | null) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Drop the previous identity's content the moment it changes (impersonation)
  // instead of flashing it until the new snapshot lands.
  useIdentityReset(uid, () => {
    setContacts([]);
    setEvents([]);
    setLoading(true);
    setError(null);
  });

  useEffect(() => {
    const onLoadError = (e: unknown, path: string) => {
      setError(`Couldn't load ${path}.`);
      setLoading(false);
      handleFirestoreError(e, OperationType.LIST, path, { rethrow: false });
    };
    const unsubContacts = subscribeContacts(setContacts, (e) => onLoadError(e, 'contacts'));
    const unsubEvents = subscribeEvents(
      (list) => {
        setEvents(list);
        setLoading(false);
      },
      (e) => onLoadError(e, 'events'),
    );
    return () => {
      unsubContacts();
      unsubEvents();
    };
  }, []);

  // The v2 screen shows every session, newest first — the design has no type
  // filter (that's desktop work).
  const sessions = useMemo(() => sessionsNewestFirst(events), [events]);
  const missed = useMemo(() => whoWeMissed(contacts, sessions), [contacts, sessions]);
  const upcoming = useMemo(() => upcomingEventsForRsvp(events), [events]);

  // The web UI exposes the roster tap targets to every role that can reach
  // this screen (min role viewer), but Firestore rules require operator+ to
  // write contacts.attendance — so a Community (viewer) tap would silently
  // fail. Gate the interaction client-side instead of reproducing that gap.
  const canTakeAttendance = hasMinRole(role, 'operator');

  return {
    contacts,
    events,
    loading,
    error,
    sessions,
    missed,
    upcoming,
    canTakeAttendance,
    here,
    cycleAttendance: (contact: Contact, eventId: string) => {
      if (!canTakeAttendance) return Promise.resolve();
      const event = events.find((e) => e.id === eventId);
      return cycleAttendanceDoc(contact, eventId, event?.name, { uid, name: displayName });
    },
  };
}
