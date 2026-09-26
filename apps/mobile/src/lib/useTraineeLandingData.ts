// Live data for the native Trainee landing — mirrors the subscriptions +
// derivations in the web app's src/views/landings/LandingTrainee.tsx, using
// @cisa/core's pure derivations as the shared behavior oracle.
import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import {
  buildQueue,
  fullTimerIds,
  isFullTimer,
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
import { subscribeTiedThreads } from './data/threads';
import { subscribeTiedSubcollection } from './data/contacts';
import { useInboxReads } from './data/inboxReads';
import { useQueueState } from './queueState';
import { useQueuePrefs } from './queuePrefs';
import { useIdentityReset } from './useIdentityReset';
import { useMinLoading } from './useMinLoading';

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
      query(collection(db, 'contacts'), where('visibleTo', 'array-contains', uid)),
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
    // Thread messages on the people this trainee can see; the rules deny a
    // Trainee the threads collection group. Quiet on error — degrade to an
    // empty "what's waiting" section rather than surfacing a load error for
    // the whole screen.
    const unsubThreads = subscribeTiedThreads(uid, setThreads, () => setThreads([]));
    // The focus queue's "due" and "follow-up" cards, and the "you last talked …"
    // line under them.
    const unsubTasks = onSnapshot(
      query(collection(db, 'tasks'), where('assigneeId', '==', uid)),
      (snap) => setTasks(snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Task[]),
      (e) => onLoadError(e, 'tasks'),
    );
    // Every interaction on the people this trainee can see. The rules deny a
    // Trainee the collection-group feed (it spans people outside their
    // `visibleTo`), so this reads each visible person's newest interactions.
    const unsubInteractions = subscribeTiedSubcollection(
      uid,
      'interactions',
      (docs) =>
        setInteractions(
          docs.map((d) => ({
            id: d.id,
            ...(d.data() as Record<string, unknown>),
            contactId: contactIdFromPath(d.ref.path),
          })) as Interaction[],
        ),
      (e) => onLoadError(e, 'interactions'),
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

  const fts = fullTimerIds();
  const ftFirst = useMemo(() => 'The team', []);
  const waiting: InboxItem[] = useMemo(
    () => (uid ? traineeWaitingItems(uid, threads, myIds) : []),
    [uid, threads, myIds],
  );
  const waitingUnread = useMemo(
    () => waiting.filter((it) => !inbox.isRead(uid ?? '', it.id)).length,
    [waiting, inbox, uid],
  );
  const weighedIn = useMemo(() => weighedInContactIds(threads, fts), [threads, fts]);

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
          fullTimers: fts,
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
      fts,
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

  const shownLoading = useMinLoading(loading);

  return {
    loading: shownLoading,
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
    ft: fts.length > 0 ? fts[0] : null,
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
