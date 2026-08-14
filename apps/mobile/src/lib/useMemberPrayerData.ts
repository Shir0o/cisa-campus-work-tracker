// Live data for the member Prayer screen (mobile v2's student · community app).
//
// The two roles read almost opposite things, so this hook takes the role and
// subscribes accordingly:
//   student   — their OWN two lists: what they've asked the team to pray for
//               (prayerRequests, shared with staff) and the people on their
//               heart (personalPrayers, private and never shared).
//   community — a read-only window into what the team is carrying.
// A student never sees the team's list and a Community member never sees a
// student's private one; that isn't a filter in the UI, it's what gets
// subscribed here.
import { useEffect, useMemo, useState } from 'react';
import {
  memberAsks,
  memberPrayerGroups,
  teamHolding,
  type Contact,
  type MemberRole,
  type PersonalPrayer,
  type PrayerRecord,
  type PrayerRequest,
} from '@cisa/core';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';
import {
  addPersonalPrayer,
  subscribePersonalPrayers,
  updatePersonalPrayer,
} from './data/personalPrayers';
import {
  addPrayerRequest,
  setPrayerRequestStatus,
  subscribeMyPrayerRequests,
} from './data/prayerRequests';
import { subscribeAllPrayers } from './data/prayers';
import { useQueueState } from './queueState';
import { useIdentityReset } from './useIdentityReset';

/** The card id "I prayed just now" marks. Shares the trainee queue's per-day
 * `handled` map exactly as the full-timer home does — `prayedBy` doesn't exist
 * on a prayer, and there is no shared "who prayed today" in Firestore. Safe to
 * share the map because pickLandingForRole never sends one user to two of
 * these screens. */
const carriedId = (id: string) => `pray:${id}`;

export function useMemberPrayerData(
  uid: string | null,
  displayName: string | null,
  role: MemberRole,
) {
  const [personal, setPersonal] = useState<PersonalPrayer[]>([]);
  const [requests, setRequests] = useState<PrayerRequest[]>([]);
  const [teamPrayers, setTeamPrayers] = useState<PrayerRecord[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const queueState = useQueueState(uid);

  // Drop the previous identity's content the moment it changes (impersonation)
  // instead of flashing it until the new snapshot lands.
  useIdentityReset(uid, () => {
    setPersonal([]);
    setRequests([]);
    setTeamPrayers([]);
    setContacts([]);
    setLoading(true);
    setError(null);
  });

  const meName = displayName || 'Someone';
  const isStudent = role === 'student';

  useEffect(() => {
    if (!uid) return;
    const onLoadError = (e: unknown, path: string) => {
      setError(`Couldn't load ${path}.`);
      handleFirestoreError(e, OperationType.LIST, path, { rethrow: false });
    };

    if (isStudent) {
      const unsubPersonal = subscribePersonalPrayers(
        uid,
        (list) => {
          setPersonal(list);
          setLoading(false);
        },
        (e) => onLoadError(e, 'your prayers'),
      );
      // Quiet on error: until firestore.rules ships prayerRequests this read is
      // permission-denied, and the rest of the screen still works.
      const unsubRequests = subscribeMyPrayerRequests(uid, setRequests, () => setRequests([]));
      return () => {
        unsubPersonal();
        unsubRequests();
      };
    }

    const unsubPrayers = subscribeAllPrayers(
      (list) => {
        setTeamPrayers(list);
        setLoading(false);
      },
      (e) => onLoadError(e, 'prayers'),
    );
    const unsubContacts = onSnapshot(
      query(collection(db, 'contacts'), orderBy('name', 'asc')),
      (snap) => setContacts(snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Contact[]),
      (e) => onLoadError(e, 'contacts'),
    );
    return () => {
      unsubPrayers();
      unsubContacts();
    };
  }, [uid, isStudent]);

  const onYourHeart = useMemo(() => memberPrayerGroups(personal), [personal]);
  const asks = useMemo(() => memberAsks(requests), [requests]);
  const holding = useMemo(() => teamHolding(teamPrayers, contacts), [teamPrayers, contacts]);

  return {
    loading,
    error,

    // widgets
    onYourHeart,
    asks,
    holding,
    carriedToday: (id: string) => !!queueState.handled[carriedId(id)],

    // ── writes ────────────────────────────────────────────────────────────────
    /** "I prayed just now" — device-local, one-way for the day. */
    markCarried: (id: string) => queueState.handle(carriedId(id)),

    askTheTeam: (body: string) =>
      uid ? addPrayerRequest({ uid, name: meName, body }) : Promise.resolve(),

    markAskAnswered: (requestId: string) => setPrayerRequestStatus(requestId, 'answered'),

    addToYourHeart: (title: string) =>
      uid ? addPersonalPrayer(uid, { title }) : Promise.resolve(),

    markHeartAnswered: (id: string) =>
      uid
        ? updatePersonalPrayer(uid, id, {
            status: 'answered',
            answeredAt: new Date().toISOString(),
          })
        : Promise.resolve(),
  };
}
