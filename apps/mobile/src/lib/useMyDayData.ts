// Live data for the native My Day screen — mirrors the subscriptions +
// derivations in the web app's src/views/MyDay.tsx, using @cisa/core's pure
// derivations (packages/core/src/myday.ts) as the shared behavior oracle.
//
// Pass `fixture` to skip Firestore entirely and render from static data (dev /
// Expo-web verification when a live login isn't available).
import { useEffect, useMemo, useState } from 'react';
import {
  collection,
  collectionGroup,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
} from 'firebase/firestore';
import {
  deriveLeaders,
  inboxItemsFor,
  personalContactIdsOf,
  splitPrayers,
  splitTasks,
  staleLeaderOf,
  thisWeekEvents,
  isFullTimer,
  type Contact,
  type Event,
  type InboxItem,
  type Interaction,
  type Leader,
  type PersonalPrayer,
  type PrayerRecord,
  type Stage,
  type Task,
  type ThreadMessageWithContact,
  type Touch,
} from '@cisa/core';
import { db, handleFirestoreError, OperationType } from './firebase';
import { addTodo, deleteTodo, setTodoDone, updateTodo } from './data/todos';
import { updatePrayerStatus } from './data/prayers';
import {
  addPersonalPrayer as addPersonalPrayerDoc,
  deletePersonalPrayer as deletePersonalPrayerDoc,
  subscribePersonalPrayers,
  updatePersonalPrayer as updatePersonalPrayerDoc,
} from './data/personalPrayers';
import { saveUserPreferences, subscribeUserPreferences } from './data/userPreferences';
import { addThreadMessage, subscribeAllThreads } from './data/threads';
import { InboxReads, useInboxReads } from './data/inboxReads';

export interface MyDayFixture {
  contacts: Contact[];
  stages: Stage[];
  events: Event[];
  prayers: PrayerRecord[];
  tasks: Task[];
  personalPrayers: PersonalPrayer[];
  touches?: Touch[];
  interactions?: Interaction[];
  threads?: ThreadMessageWithContact[];
  prefContactIds?: string[] | null;
}

const DAY_MS = 86_400_000;

// Same path-segment convention as the web app's collection-group ingestion:
// contacts/{contactId}/interactions/{id} → segment 1 is the contactId.
const contactIdFromPath = (path: string) => path.split('/')[1] ?? '';

export function useMyDayData(uid: string | null, displayName: string | null, fixture?: MyDayFixture) {
  const [contacts, setContacts] = useState<Contact[]>(fixture?.contacts ?? []);
  const [stages, setStages] = useState<Stage[]>(fixture?.stages ?? []);
  const [events, setEvents] = useState<Event[]>(fixture?.events ?? []);
  const [prayers, setPrayers] = useState<PrayerRecord[]>(fixture?.prayers ?? []);
  const [tasks, setTasks] = useState<Task[]>(fixture?.tasks ?? []);
  const [personalPrayers, setPersonalPrayers] = useState<PersonalPrayer[]>(fixture?.personalPrayers ?? []);
  const [interactions, setInteractions] = useState<Interaction[]>(fixture?.interactions ?? []);
  const [comments, setComments] = useState<{ contactId: string; ms: number; note: string }[]>([]);
  const [threads, setThreads] = useState<ThreadMessageWithContact[]>(fixture?.threads ?? []);
  const [prefContactIds, setPrefContactIds] = useState<string[] | null | undefined>(
    fixture?.prefContactIds,
  );
  const inboxReads = useInboxReads(); // re-renders this hook when read-state changes
  const [loading, setLoading] = useState(!fixture);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Wait for auth to be ready before reading Firestore — on the very first
    // render after sign-in, `uid` (and auth.currentUser) can briefly be null,
    // and querying then gets permission-denied from the security rules.
    if (fixture || !uid) return;

    const onLoadError = (e: unknown, path: string) => {
      console.error(`My Day load error (${path})`, e);
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
    const unsubEvents = onSnapshot(
      query(collection(db, 'events')),
      (snap) => setEvents(snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Event[]),
      (e) => onLoadError(e, 'events'),
    );
    const unsubPrayers = onSnapshot(
      query(collection(db, 'prayers')),
      (snap) => setPrayers(snap.docs.map((d) => ({ id: d.id, ...d.data() })) as PrayerRecord[]),
      (e) => onLoadError(e, 'prayers'),
    );
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
    const unsubComments = onSnapshot(
      query(collectionGroup(db, 'comments'), orderBy('createdAt', 'desc'), limit(500)),
      (snap) =>
        setComments(
          snap.docs.map((d) => {
            const data = d.data() as Record<string, unknown>;
            return {
              contactId: contactIdFromPath(d.ref.path),
              ms: new Date((data.createdAt as string) ?? '').getTime(),
              note: ((data.text as string) ?? '').trim(),
            };
          }),
        ),
      (e) => onLoadError(e, 'comments (collectionGroup)'),
    );
    // Quiet on error: before the threads collection-group rule is deployed this
    // read is permission-denied — degrade to no inbox questions rather than
    // surfacing a load error for the whole screen.
    const unsubThreads = subscribeAllThreads(setThreads, () => setThreads([]));

    return () => {
      unsubContacts();
      unsubStages();
      unsubEvents();
      unsubPrayers();
      unsubInteractions();
      unsubComments();
      unsubThreads();
    };
  }, [fixture, uid]);

  useEffect(() => {
    if (fixture || !uid) return;
    const unsubTasks = onSnapshot(
      query(collection(db, 'tasks'), where('assigneeId', '==', uid)),
      (snap) => setTasks(snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Task[]),
      (e) => handleFirestoreError(e, OperationType.LIST, 'tasks'),
    );
    const unsubPrefs = subscribeUserPreferences(uid, (prefs) =>
      setPrefContactIds(prefs.personalContactIds ?? null),
    );
    const unsubPersonalPrayers = subscribePersonalPrayers(uid, setPersonalPrayers);
    return () => {
      unsubTasks();
      unsubPrefs();
      unsubPersonalPrayers();
    };
  }, [uid, fixture]);

  // most-recent touch (+ its note) per contact, from interactions + comments
  const touches: Touch[] = useMemo(() => {
    if (fixture?.touches) return fixture.touches;
    const interactionTouches = interactions.map((i) => ({
      contactId: i.contactId ?? '',
      ms: new Date(i.createdAt ?? '').getTime(),
      note: (i.content ?? '').trim(),
    }));
    return [...interactionTouches, ...comments].filter((t) => !Number.isNaN(t.ms));
  }, [fixture, interactions, comments]);

  const personalContactIds = useMemo(
    () => personalContactIdsOf(prefContactIds, contacts, uid),
    [prefContactIds, contacts, uid],
  );

  const leaders: Leader[] = useMemo(
    () => deriveLeaders(contacts, personalContactIds, touches),
    [contacts, personalContactIds, touches],
  );
  const staleLeader = useMemo(() => staleLeaderOf(leaders), [leaders]);

  const { assignedTasks, personalTasks, leftToDo } = useMemo(
    () => splitTasks(tasks, uid),
    [tasks, uid],
  );

  const thisWeek = useMemo(() => thisWeekEvents(events), [events]);

  const { contactPrayers, activePersonalPrayers, prayersCount } = useMemo(
    () => splitPrayers(prayers, personalContactIds, personalPrayers),
    [prayers, personalContactIds, personalPrayers],
  );

  // "From the team" inbox — full-timers only (inboxItemsFor no-ops otherwise).
  const isFT = useMemo(() => isFullTimer(uid), [uid]);
  const inboxItems: InboxItem[] = useMemo(
    () => (uid ? inboxItemsFor(uid, { contacts, interactions, threads }) : []),
    [uid, contacts, interactions, threads],
  );
  // Resolve a teammate's display name from anything they authored.
  const nameByUid = useMemo(() => {
    const m: Record<string, string> = {};
    for (const c of contacts) if (c.createdBy && c.createdByName) m[c.createdBy] ??= c.createdByName;
    for (const i of interactions) {
      const u = i.userId ?? i.createdById;
      const n = i.userName ?? i.createdByName;
      if (u && n) m[u] ??= n;
    }
    for (const t of threads) if (t.from && t.fromName) m[t.from] ??= t.fromName;
    return m;
  }, [contacts, interactions, threads]);

  const meName = displayName || 'Someone';

  return {
    loading,
    error,
    contacts,
    stages,
    leaders,
    staleLeader,
    assignedTasks,
    personalTasks,
    leftToDo,
    thisWeek,
    contactPrayers,
    activePersonalPrayers,
    prayersCount,
    personalContactIds,
    isFullTimer: isFT,
    inboxItems,
    nameByUid,
    isInboxRead: (id: string) => (uid ? inboxReads.isRead(uid, id) : true),

    // ── writes ──────────────────────────────────────────────────────────────
    toggleTask: (task: Task) => setTodoDone(task.id, task.status !== 'completed'),
    addTask: (title: string, dueDate: string | null) =>
      uid && addTodo({ title, assigneeId: uid, dueDate, source: null }, { uid, name: meName }),
    updateTask: (id: string, patch: { title?: string; dueDate?: string | null }) => updateTodo(id, patch),
    deleteTask: (id: string) => deleteTodo(id),

    setPrayerStatus: (
      id: string,
      status: PrayerRecord['status'],
      answer?: string,
      answeredAt?: string | null,
    ) => updatePrayerStatus(id, status, { uid, name: displayName }, answer, answeredAt),
    addPersonalPrayer: (title: string, contactId?: string | null) =>
      uid && addPersonalPrayerDoc(uid, { title, contactId }),
    updatePersonalPrayer: (id: string, patch: Parameters<typeof updatePersonalPrayerDoc>[2]) =>
      uid && updatePersonalPrayerDoc(uid, id, patch),
    deletePersonalPrayer: (id: string) => uid && deletePersonalPrayerDoc(uid, id),

    togglePersonalContact: (id: string) => {
      if (!uid) return;
      const next = new Set(personalContactIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      saveUserPreferences(uid, { personalContactIds: [...next] });
    },

    // "From the team" inbox actions
    postInboxReply: (item: InboxItem, kind: 'encouragement' | 'nudge', body: string) => {
      if (!uid) return;
      const contact = contacts.find((c) => c.id === item.contactId);
      void addThreadMessage(
        item.contactId,
        { interactionId: item.interactionId ?? null, from: uid, fromName: meName, kind, body },
        { to: item.by, contactName: contact?.name },
      );
      InboxReads.markRead(uid, item.id);
    },
    markInboxRead: (id: string) => uid && InboxReads.markRead(uid, id),
    markInboxUnread: (id: string) => uid && InboxReads.markUnread(uid, id),
    markAllInboxRead: () => uid && InboxReads.markAll(uid, inboxItems.map((i) => i.id)),
  };
}
