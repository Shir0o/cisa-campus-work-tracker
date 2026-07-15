// Live data for the native Trainee landing — mirrors the subscriptions +
// derivations in the web app's src/views/landings/LandingTrainee.tsx, using
// @cisa/core's pure derivations as the shared behavior oracle.
import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import {
  fullTimerOf,
  splitPrayers,
  traineeMyPeople,
  traineeWaitingItems,
  weighedInContactIds,
  type Contact,
  type InboxItem,
  type PersonalPrayer,
  type PrayerRecord,
  type Stage,
  type ThreadMessageWithContact,
} from '@cisa/core';
import { db, handleFirestoreError, OperationType } from './firebase';
import { updatePrayerStatus } from './data/prayers';
import {
  addPersonalPrayer as addPersonalPrayerDoc,
  deletePersonalPrayer as deletePersonalPrayerDoc,
  subscribePersonalPrayers,
  updatePersonalPrayer as updatePersonalPrayerDoc,
} from './data/personalPrayers';
import { subscribeAllThreads } from './data/threads';
import { useInboxReads } from './data/inboxReads';

export function useTraineeLandingData(uid: string | null, displayName: string | null) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [prayers, setPrayers] = useState<PrayerRecord[]>([]);
  const [personalPrayers, setPersonalPrayers] = useState<PersonalPrayer[]>([]);
  const [threads, setThreads] = useState<ThreadMessageWithContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const inbox = useInboxReads();

  useEffect(() => {
    if (!uid) return;
    const onLoadError = (e: unknown, path: string) => {
      setError(`Couldn't load ${path}.`);
      handleFirestoreError(e, OperationType.LIST, path, { rethrow: false });
    };
    const unsubContacts = onSnapshot(
      query(collection(db, 'contacts')),
      (snap) => {
        setContacts(snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Contact[]);
        setLoading(false);
      },
      (e) => onLoadError(e, 'contacts'),
    );
    const unsubStages = onSnapshot(
      query(collection(db, 'stages'), orderBy('order', 'asc')),
      (snap) => setStages(snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Stage[]),
      (e) => onLoadError(e, 'stages'),
    );
    const unsubPrayers = onSnapshot(
      query(collection(db, 'prayers')),
      (snap) => setPrayers(snap.docs.map((d) => ({ id: d.id, ...d.data() })) as PrayerRecord[]),
      (e) => onLoadError(e, 'prayers'),
    );
    const unsubPersonalPrayers = subscribePersonalPrayers(uid, setPersonalPrayers);
    // Quiet on error: before the threads collection-group rule is deployed this
    // read is permission-denied — degrade to an empty "what's waiting" section
    // rather than surfacing a load error for the whole screen.
    const unsubThreads = subscribeAllThreads(setThreads, () => setThreads([]));

    return () => {
      unsubContacts();
      unsubStages();
      unsubPrayers();
      unsubPersonalPrayers();
      unsubThreads();
    };
  }, [uid]);

  const myPeople = useMemo(() => traineeMyPeople(contacts, uid), [contacts, uid]);
  const myIds = useMemo(() => new Set(myPeople.map((p) => p.contact.id)), [myPeople]);

  const { contactPrayers, activePersonalPrayers } = useMemo(
    () => splitPrayers(prayers, myIds, personalPrayers),
    [prayers, myIds, personalPrayers],
  );

  const ft = fullTimerOf(uid);
  const ftFirst = useMemo(
    () => (threads.find((m) => m.from === ft)?.fromName || 'your full-timer').split(/\s+/)[0],
    [threads, ft],
  );
  const waiting: InboxItem[] = useMemo(() => (uid ? traineeWaitingItems(uid, threads) : []), [uid, threads]);
  const waitingUnread = useMemo(
    () => waiting.filter((it) => !inbox.isRead(uid ?? '', it.id)).length,
    [waiting, inbox, uid],
  );
  const weighedIn = useMemo(() => weighedInContactIds(threads, ft), [threads, ft]);

  return {
    loading,
    error,
    contacts,
    stages,
    myPeople,
    myContacts: useMemo(() => myPeople.map((p) => p.contact), [myPeople]),
    ft,
    ftFirst,
    waiting,
    waitingUnread,
    isWaitingRead: (id: string) => (uid ? inbox.isRead(uid, id) : true),
    markWaitingRead: (id: string) => uid && inbox.markRead(uid, id),
    markWaitingUnread: (id: string) => uid && inbox.markUnread(uid, id),
    weighedIn,
    contactPrayers,
    activePersonalPrayers,

    setPrayerStatus: (id: string, status: PrayerRecord['status'], answer?: string, answeredAt?: string | null) =>
      updatePrayerStatus(id, status, { uid, name: displayName }, answer, answeredAt),
    addPersonalPrayer: (title: string, contactId?: string | null) =>
      uid && addPersonalPrayerDoc(uid, { title, contactId }),
    updatePersonalPrayer: (id: string, patch: Parameters<typeof updatePersonalPrayerDoc>[2]) =>
      uid && updatePersonalPrayerDoc(uid, id, patch),
    deletePersonalPrayer: (id: string) => uid && deletePersonalPrayerDoc(uid, id),
  };
}
