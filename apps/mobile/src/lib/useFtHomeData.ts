// Live data for the full-timer's v2 home (mobile v2, direction 05 "Widgets"),
// with @cisa/core's ftHome.ts as the shared behavior oracle.
//
// A sibling of useTraineeLandingData, not an extension of useMyDayData: that one
// still backs the Material MyDayScreen, which this change deliberately leaves on
// disk untouched. The subscription sets differ too — this one adds the team
// roster (the "who" chips on a hand-it-over) and drops personal prayers, which
// carry no contact and so can't be named in "Carrying".
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
  ftAssignees,
  ftCarryRows,
  ftCarrying,
  ftGoneQuiet,
  ftHomesOpen,
  ftInboxRows,
  ftNextGathering,
  ftOpenPrayers,
  ftSummaryLine,
  ftTodos,
  ftWeekAhead,
  inboxItemsFor,
  personalContactIdsOf,
  askStacksFor as coreAskStacksFor,
  type AppUser,
  type Contact,
  type Event,
  type HospitalityOffer,
  type InboxItem,
  type Interaction,
  type Leader,
  type PrayerRecord,
  type PrayerRequest,
  type Stage,
  type Task,
  type ThreadKind,
  type ThreadMessageWithContact,
  type Touch,
  type AskMessage,
} from '@cisa/core';
import { db, handleFirestoreError, OperationType } from './firebase';
import { useIdentityReset } from './useIdentityReset';
import { useMinLoading } from './useMinLoading';
import { setTodoDone, addTodo } from './data/todos';
import { addThreadMessage, subscribeAllThreads } from './data/threads';
import { subscribeUserPreferences } from './data/userPreferences';
import { subscribeUsers } from './data/users';
import { setPrayerRequestStatus, subscribeOpenPrayerRequests } from './data/prayerRequests';
import { addAskReply, subscribeAsks, type AskStack } from './data/asks';
import { subscribeHospitalityOffers } from './data/hospitality';
import { getOrCreateDirectChat } from './data/chat';
import { InboxReads, useInboxReads } from './data/inboxReads';
import { useQueueState } from './queueState';

// Same path-segment convention as useMyDayData's collection-group ingestion:
// contacts/{contactId}/interactions/{id} → segment 1 is the contactId.
const contactIdFromPath = (path: string) => path.split('/')[1] ?? '';

/** The card id the trainee queue mints for a prayer. Shared on purpose — see
 * the note on `prayedToday` below. */
export const prayerCardId = (prayerId: string) => `pray:${prayerId}`;

export function useFtHomeData(uid: string | null, displayName: string | null) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [prayers, setPrayers] = useState<PrayerRecord[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [comments, setComments] = useState<Touch[]>([]);
  const [threads, setThreads] = useState<ThreadMessageWithContact[]>([]);
  const [team, setTeam] = useState<AppUser[]>([]);
  const [requests, setRequests] = useState<PrayerRequest[]>([]);
  const [offers, setOffers] = useState<HospitalityOffer[]>([]);
  const [asks, setAsks] = useState<AskMessage[]>([]);
  const [prefContactIds, setPrefContactIds] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const inbox = useInboxReads();
  const queueState = useQueueState(uid);

  // Drop the previous identity's content the moment it changes (impersonation)
  // instead of flashing it until the new snapshot lands.
  useIdentityReset(uid, () => {
    setContacts([]);
    setStages([]);
    setEvents([]);
    setPrayers([]);
    setTasks([]);
    setInteractions([]);
    setComments([]);
    setThreads([]);
    setTeam([]);
    setRequests([]);
    setOffers([]);
    setAsks([]);
    setPrefContactIds(null);
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
    const unsubTasks = onSnapshot(
      query(collection(db, 'tasks'), where('assigneeId', '==', uid)),
      (snap) => setTasks(snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Task[]),
      (e) => onLoadError(e, 'tasks'),
    );
    // The 500 cap is deliberate, and matches useMyDayData: this is a LIVE
    // collection-group subscription over every contact's interactions, so
    // dropping the limit would stream the whole team's history into a phone.
    // What it costs when a busy team pushes past the newest 500: an older touch
    // falls out of `touches`, so someone can read quieter in "Gone quiet in your
    // care" than they really are.
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
    // Also quiet: the roster only fills the "who" chips on a hand-it-over, and
    // that list degrades to just "Me" rather than failing the screen.
    const unsubTeam = subscribeUsers(setTeam, () => setTeam([]));
    // Both quiet on error for the same reason as threads above: until
    // firestore.rules ships these two collections the reads are
    // permission-denied, and neither is worth failing the whole screen over.
    const unsubRequests = subscribeOpenPrayerRequests(setRequests, () => setRequests([]));
    const unsubOffers = subscribeHospitalityOffers(setOffers, () => setOffers([]));
    const unsubAsks = subscribeAsks(setAsks, () => setAsks([]));
    const unsubPrefs = subscribeUserPreferences(uid, (prefs) =>
      setPrefContactIds(prefs.personalContactIds ?? null),
    );

    return () => {
      unsubContacts();
      unsubStages();
      unsubEvents();
      unsubPrayers();
      unsubTasks();
      unsubInteractions();
      unsubComments();
      unsubThreads();
      unsubTeam();
      unsubRequests();
      unsubOffers();
      unsubAsks();
      unsubPrefs();
    };
  }, [uid]);

  const meName = displayName || 'Someone';

  // ── people in my care, and how long since I heard from them ───────────────
  const touches: Touch[] = useMemo(() => {
    const fromInteractions = interactions.map((i) => ({
      contactId: i.contactId ?? '',
      ms: new Date(i.createdAt ?? '').getTime(),
      note: (i.content ?? '').trim(),
    }));
    return [...fromInteractions, ...comments].filter((t) => !Number.isNaN(t.ms));
  }, [interactions, comments]);

  const personalContactIds = useMemo(
    () => personalContactIdsOf(prefContactIds, contacts, uid),
    [prefContactIds, contacts, uid],
  );
  const leaders: Leader[] = useMemo(
    () => deriveLeaders(contacts, personalContactIds, touches),
    [contacts, personalContactIds, touches],
  );
  const quiet = useMemo(() => ftGoneQuiet(leaders), [leaders]);

  // ── what's owed today ─────────────────────────────────────────────────────
  const todos = useMemo(() => ftTodos(tasks, uid ?? ''), [tasks, uid]);

  // ── from the team ─────────────────────────────────────────────────────────
  // inboxItemsFor no-ops for anyone who isn't a full-timer (issue #549).
  const inboxItems: InboxItem[] = useMemo(
    () => (uid ? inboxItemsFor(uid, { contacts, interactions, threads }) : []),
    [uid, contacts, interactions, threads],
  );
  const nameByUid = useMemo(() => {
    const m: Record<string, string> = {};
    for (const u of team) if (u.uid && u.displayName) m[u.uid] ??= u.displayName;
    for (const c of contacts) if (c.createdBy && c.createdByName) m[c.createdBy] ??= c.createdByName;
    for (const i of interactions) {
      const u = i.userId ?? i.createdById;
      const n = i.userName ?? i.createdByName;
      if (u && n) m[u] ??= n;
    }
    for (const t of threads) if (t.from && t.fromName) m[t.from] ??= t.fromName;
    return m;
  }, [team, contacts, interactions, threads]);

  // `inbox` is a fresh wrapper per read-state change (see useInboxReads), so
  // scanning an item invalidates this memo and the widget re-sorts.
  const inboxRows = useMemo(
    () =>
      ftInboxRows(inboxItems, {
        contacts,
        nameByUid,
        isRead: (id: string) => (uid ? inbox.isRead(uid, id) : true),
      }),
    [inboxItems, contacts, nameByUid, inbox, uid],
  );
  const unreadCount = useMemo(() => inboxRows.filter((r) => r.unread).length, [inboxRows]);

  // ── ask the team (#545) ───────────────────────────────────────────────────
  // One stack per asker, unanswered only, newest first. Read-state rides the
  // same InboxReads as the rest (keyed `ask:<id>`).
  const askStacks = useMemo<AskStack[]>(
    () => (uid ? coreAskStacksFor(asks, uid) : []),
    [asks, uid],
  );
  const askUnread = useMemo(
    () =>
      askStacks.reduce(
        (n, s) => n + s.items.filter((m) => !inbox.isRead(uid ?? '', 'ask:' + m.id)).length,
        0,
      ),
    [askStacks, inbox, uid],
  );

  // ── prayers, and the calendar ─────────────────────────────────────────────
  const openPrayers = useMemo(() => ftOpenPrayers(prayers), [prayers]);
  // Members' own asks ride in the same widget as the prayers staff logged, and
  // the glance tile counts the same rows so the two can't disagree.
  const carryRows = useMemo(
    () => ftCarryRows(openPrayers, requests, contacts),
    [openPrayers, requests, contacts],
  );
  const carrying = useMemo(() => ftCarrying(carryRows), [carryRows]);
  const homesOpen = useMemo(() => ftHomesOpen(offers), [offers]);
  const nextGathering = useMemo(() => ftNextGathering(events), [events]);
  const weekAhead = useMemo(() => ftWeekAhead(events), [events]);

  const summary = useMemo(
    () =>
      ftSummaryLine({
        needsYou: todos.today.length,
        fromTeam: unreadCount,
        quiet: quiet.length,
      }),
    [todos.today.length, unreadCount, quiet.length],
  );

  // The team roster a to-do can be handed to: approved staff, me first.
  const assignees = useMemo(() => ftAssignees(team, uid), [team, uid]);

  const shownLoading = useMinLoading(loading);

  return {
    loading: shownLoading,
    error,
    contacts,
    stages,
    events,
    nameByUid,

    // widgets
    summary,
    todos,
    inboxRows,
    unreadCount,
    askStacks,
    askUnread,
    quiet,
    openPrayers,
    carryRows,
    carrying,
    homesOpen,
    nextGathering,
    weekAhead,
    assignees,

    // ── writes ──────────────────────────────────────────────────────────────
    markTodoDone: (task: Task) => setTodoDone(task.id, true),
    handOver: (input: {
      title: string;
      assigneeId: string;
      dueDate: string | null;
      contact?: Contact | null;
    }) =>
      uid &&
      addTodo(
        {
          title: input.title,
          assigneeId: input.assigneeId,
          dueDate: input.dueDate,
          contactId: input.contact?.id ?? null,
          contactName: input.contact?.name ?? null,
        },
        { uid, name: meName },
      ),

    /** Write to a teammate on a person's thread, and scan the item off. */
    postNote: (item: InboxItem, kind: ThreadKind, body: string) => {
      if (!uid) return;
      const contact = contacts.find((c) => c.id === item.contactId);
      void addThreadMessage(
        item.contactId,
        { interactionId: item.interactionId ?? null, from: uid, fromName: meName, kind, body },
        { to: item.by, contactName: contact?.name },
      );
      InboxReads.markRead(uid, item.id);
    },
    markScanned: (id: string, scanned: boolean) =>
      uid && (scanned ? InboxReads.markRead(uid, id) : InboxReads.markUnread(uid, id)),

    /** Answer a person-less question; pings the asker's bell. The first
     *  full-timer to reply takes it off every full-timer's feed. */
    answerAsk: (parentId: string, owner: string, body: string) => {
      if (!uid) return;
      void addAskReply(parentId, { from: uid, fromName: meName, body }, owner, owner);
      InboxReads.markRead(uid, 'ask:' + parentId);
    },
    markAskScanned: (id: string) => uid && InboxReads.markRead(uid, 'ask:' + id),

    // "I prayed just now" is device-local, exactly as it is on the trainee's
    // queue (QueueCard's pray branch just marks the card handled): PrayerRecord
    // has no `prayedBy`, and there is no shared "who prayed today" anywhere in
    // Firestore. It shares queueState's per-day `handled` map — safe because
    // pickLandingForRole sends a manager to the queue and an admin here, so no
    // one user writes both.
    // Keyed by the carry row's own prefixed id, so a member's ask and a logged
    // prayer can be marked independently.
    prayedToday: (rowId: string) => !!queueState.handled[prayerCardId(rowId)],
    markPrayed: (rowId: string) => queueState.handle(prayerCardId(rowId)),

    /** Close out a member's ask — "the team prayed, and God answered". Unlike
     * "I prayed just now" this one is real and shared: the asker sees it. */
    markRequestAnswered: (requestId: string) => setPrayerRequestStatus(requestId, 'answered'),

    /** Opens (or finds) the DM with someone — how "Homes open to students"
     * turns an offer into a conversation. Returns the room id to route to. */
    messageThem: (theirUid: string, theirName: string): Promise<string | null> =>
      uid
        ? getOrCreateDirectChat(
            { uid, displayName: meName },
            { uid: theirUid, displayName: theirName },
          )
        : Promise.resolve(null),
  };
}
