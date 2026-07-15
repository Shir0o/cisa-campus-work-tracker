// Live data for the native Gatherings (Attendance) screen — hero stats, who
// we've missed, past sessions with roster marking, and coming-up gatherings.
// Mirrors the subscriptions + derivations in the web app's
// src/views/Attendance.tsx / AttendanceMobile.tsx.
import { useEffect, useMemo, useState } from 'react';
import {
  avgAttendance,
  hasMinRole,
  here,
  sessionsNewestFirst,
  upcomingEventsForRsvp,
  whoWeMissed,
  type AppRole,
  type Contact,
  type Event,
  type GatheringType,
} from '@cisa/core';
import { handleFirestoreError, OperationType } from './firebase';
import { subscribeContacts } from './data/contacts';
import { subscribeEvents } from './data/events';
import { subscribeGatheringTypes } from './data/gatheringTypes';
import { cycleAttendance as cycleAttendanceDoc } from './data/attendance';

export function useAttendanceData(uid: string | null, displayName: string | null, role: AppRole | null) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [gatheringTypes, setGatheringTypes] = useState<GatheringType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState('All');

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
    const unsubTypes = subscribeGatheringTypes(setGatheringTypes, (e) => onLoadError(e, 'gatheringTypes'));
    return () => {
      unsubContacts();
      unsubEvents();
      unsubTypes();
    };
  }, []);

  const newestFirst = useMemo(() => sessionsNewestFirst(events), [events]);
  const sessions = useMemo(
    () => (typeFilter === 'All' ? newestFirst : newestFirst.filter((s) => s.type === typeFilter)),
    [newestFirst, typeFilter],
  );
  const missed = useMemo(() => whoWeMissed(contacts, newestFirst), [contacts, newestFirst]);
  const upcoming = useMemo(() => upcomingEventsForRsvp(events), [events]);
  const avgPer = useMemo(() => avgAttendance(contacts, events), [contacts, events]);

  // The web UI exposes the roster tap targets to every role that can reach
  // this screen (min role viewer), but Firestore rules require operator+ to
  // write contacts.attendance — so a Community (viewer) tap would silently
  // fail. Gate the interaction client-side instead of reproducing that gap.
  const canTakeAttendance = hasMinRole(role, 'operator');

  return {
    contacts,
    events,
    gatheringTypes,
    loading,
    error,
    typeFilter,
    setTypeFilter,
    sessions,
    missed,
    upcoming,
    avgPer,
    gatheringsCount: events.length,
    canTakeAttendance,
    here,
    cycleAttendance: (contact: Contact, eventId: string) => {
      if (!canTakeAttendance) return Promise.resolve();
      const event = events.find((e) => e.id === eventId);
      return cycleAttendanceDoc(contact, eventId, event?.name, { uid, name: displayName });
    },
  };
}
