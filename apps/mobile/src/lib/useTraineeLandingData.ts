// Live data for the native Trainee landing — mirrors the subscriptions +
// derivations in the web app's src/views/landings/LandingTrainee.tsx, using
// @cisa/core's pure derivations as the shared behavior oracle.
import { useEffect, useMemo, useState } from 'react';
import { collection, collectionGroup, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import {
  buildQueue,
  fullTimerOf,
  queueDates,
  queueWeek,
  splitPrayers,
  traineeMyPeople,
  traineeWaitingItems,
  weighedInContactIds,
  type Contact,
  type Event,
  type InboxItem,
  type Interaction,
  type PersonalPrayer,
  type PrayerRecord,
  type Stage,
  type Task,
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
import { useQueueState } from './queueState';
import { useQueuePrefs } from './queuePrefs';
import { useIdentityReset } from './useIdentityReset';

// Same path-segment convention as useMyDayData's collection-group ingestion:
// contacts/{contactId}/interactions/{id} → segment 1 is the contactId.
const contactIdFromPath = (path: string) => path.split('/')[1] ?? '';

export function useTraineeLandingData(uid: string | null, displayName: string | null) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [prayers, setPrayers] = useState<PrayerRecord[]>([]);
  const [personalPrayers, setPersonalPrayers] = useState<PersonalPrayer[]>([]);
  const [threads, setThreads] = useState<ThreadMessageWithContact[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const inbox = useInboxReads();
  const queueState = useQueueState(uid);
  const queuePrefs = useQueuePrefs(uid);

  // Drop the previous identity's content the moment it changes (impersonation)
  // instead of flashing it until the new snapshot lands.
  useIdentityReset(uid, () => {
    setContacts([]);
    setStages([]);
    setPrayers([]);
    setPersonalPrayers([]);
    setThreads([]);
    setTasks([]);
    setInteractions([]);
    setEvents([]);
    setLoading(true);
    setError(null);
  });

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
    // The focus queue's "due" and "follow-up" cards, and the "you last talked …"
    // line under them.
    const unsubTasks = onSnapshot(
      query(collection(db, 'tasks'), where('assigneeId', '==', uid)),
      (snap) => setTasks(snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Task[]),
      (e) => onLoadError(e, 'tasks'),
    );
    // The 500 cap is deliberate, and matches useMyDayData: this is a LIVE
    // collection-group subscription over every contact's interactions, so
    // dropping the limit would stream the whole team's history into a phone.
    // What it costs when a busy team pushes this trainee's own people past the
    // newest 500: the "you last talked …" line on a follow-up/quiet card goes
    // missing (`last` is null and both cards already render without it). No
    // card appears or disappears — those come from tasks/threads/contacts/
    // prayers, which are each scoped to this user.
    const unsubInteractions = onSnapshot(
      query(collectionGroup(db, 'interactions'), orderBy('createdAt', 'desc'), limit(500)),
      (snap) =>
        setInteractions(
          snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Record<string, unknown>),
            contactId: contactIdFromPath(d.ref.path),
          })) as Interaction[],
        ),
      (e) => onLoadError(e, 'interactions (collectionGroup)'),
    );
    // End of queue only: the one-off dates worth knowing.
    const unsubEvents = onSnapshot(
      query(collection(db, 'events')),
      (snap) => setEvents(snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Event[]),
      (e) => onLoadError(e, 'events'),
    );

    return () => {
      unsubContacts();
      unsubStages();
      unsubPrayers();
      unsubPersonalPrayers();
      unsubThreads();
      unsubTasks();
      unsubInteractions();
      unsubEvents();
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

  // Mobile v2 — the focus queue. Pure derivation in @cisa/core; the per-day
  // handled/later state comes from AsyncStorage via useQueueState, and how much
  // the day holds is the trainee's own call (useQueuePrefs → the "Your queue"
  // screen). `inbox` is a fresh wrapper per read-state change (see
  // useInboxReads), so acknowledging a message invalidates this memo.
  const queue = useMemo(
    () =>
      buildQueue(
        {
          uid: uid ?? '',
          fullTimer: ft,
          contacts,
          tasks,
          threads,
          interactions,
          prayers: contactPrayers,
          isRead: (id: string) => (uid ? inbox.isRead(uid, id) : false),
          handled: queueState.handled,
          later: queueState.later,
        },
        queuePrefs.prefs,
      ),
    [
      uid,
      ft,
      contacts,
      tasks,
      threads,
      interactions,
      contactPrayers,
      inbox,
      queueState.handled,
      queueState.later,
      queuePrefs.prefs,
    ],
  );
  const dates = useMemo(() => queueDates(events), [events]);
  const week = useMemo(() => (uid ? queueWeek(interactions, uid) : []), [interactions, uid]);

  return {
    loading,
    error,
    contacts,
    stages,
    tasks,
    interactions,
    events,
    threads,

    // The focus queue (v2 home).
    queue,
    queuePrefs,
    queueState,
    dates,
    week,
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
