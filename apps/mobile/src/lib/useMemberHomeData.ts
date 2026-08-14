// Live data for the member home (mobile v2's student · community app), with
// @cisa/core's memberHome.ts as the shared behavior oracle.
//
// A sibling of useFtHomeData, and deliberately much smaller: a member sees
// what's on, one note from the team, the announcements, and — if they're
// Community — their own offer to host. No contacts, no interactions, no tasks,
// no collection-group reads. The member app is not a cockpit.
import { useEffect, useMemo, useState } from 'react';
import {
  announcementRows,
  isRoomUnread,
  memberUpcoming,
  noteFromTheTeam,
  type ChatRoom,
  type Event,
  type FullTimerSummary,
  type HospitalityOffer,
} from '@cisa/core';
import { handleFirestoreError, OperationType } from './firebase';
import { subscribeEvents } from './data/events';
import { subscribeMyRsvps, setRsvp } from './data/rsvp';
import { subscribeChatRooms } from './data/chat';
import { subscribeFullTimers } from './data/users';
import {
  deleteHospitalityOffer,
  saveHospitalityOffer,
  subscribeMyHospitalityOffer,
} from './data/hospitality';
import { useChatReads } from './data/chatReads';
import { useIdentityReset } from './useIdentityReset';

export function useMemberHomeData(uid: string | null, displayName: string | null) {
  const [events, setEvents] = useState<Event[]>([]);
  const [goingIds, setGoingIds] = useState<Set<string>>(new Set());
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [fullTimers, setFullTimers] = useState<FullTimerSummary[]>([]);
  const [offer, setOffer] = useState<HospitalityOffer | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const reads = useChatReads();

  // Drop the previous identity's content the moment it changes (impersonation)
  // instead of flashing it until the new snapshot lands.
  useIdentityReset(uid, () => {
    setEvents([]);
    setGoingIds(new Set());
    setRooms([]);
    setFullTimers([]);
    setOffer(null);
    setLoading(true);
    setError(null);
  });

  const meName = displayName || 'Someone';

  useEffect(() => {
    if (!uid) return;
    const onLoadError = (e: unknown, path: string) => {
      setError(`Couldn't load ${path}.`);
      handleFirestoreError(e, OperationType.LIST, path, { rethrow: false });
    };
    const unsubEvents = subscribeEvents(
      (list) => {
        setEvents(list);
        setLoading(false);
      },
      (e) => onLoadError(e, 'events'),
    );
    const unsubRsvps = subscribeMyRsvps(uid, setGoingIds, (e) => onLoadError(e, 'my RSVPs'));
    const unsubRooms = subscribeChatRooms(uid, setRooms, () => setRooms([]));
    // Both quiet on error, as useFtHomeData's threads read is: the roster only
    // names who wrote to you, and the offer only exists for Community — neither
    // is worth failing the whole screen over.
    const unsubFts = subscribeFullTimers(setFullTimers, () => setFullTimers([]));
    const unsubOffer = subscribeMyHospitalityOffer(uid, setOffer, () => setOffer(null));
    return () => {
      unsubEvents();
      unsubRsvps();
      unsubRooms();
      unsubFts();
      unsubOffer();
    };
  }, [uid]);

  const upcoming = useMemo(() => memberUpcoming(events), [events]);
  const fullTimerUids = useMemo(() => fullTimers.map((f) => f.uid), [fullTimers]);
  const note = useMemo(
    () => noteFromTheTeam(rooms, uid, fullTimerUids),
    [rooms, uid, fullTimerUids],
  );
  const announcements = useMemo(
    () =>
      announcementRows(rooms, uid, (room) =>
        isRoomUnread(room, uid, uid ? reads.getLastRead(uid, room.id) : null),
      ),
    [rooms, uid, reads],
  );

  return {
    loading,
    error,
    fullTimers,

    // widgets
    upcoming,
    note,
    announcements,
    offer,
    isGoing: (eventId: string) => goingIds.has(eventId),

    // ── writes ────────────────────────────────────────────────────────────────
    toggleRsvp: (eventId: string, going: boolean) =>
      uid ? setRsvp(eventId, { uid, name: meName }, going) : Promise.resolve(),

    saveOffer: (input: { availability: string[]; seats: string; note: string }) =>
      uid
        ? saveHospitalityOffer(uid, { name: meName, ...input })
        : Promise.resolve(),

    withdrawOffer: () => (uid ? deleteHospitalityOffer(uid) : Promise.resolve()),
  };
}
