// Live data for the To ask screen (#1649): the same feeds the web page reads
// (people, interactions, Thread messages incl. the Full-timers stream,
// gatherings, the roster, and the private notepad), fed to the shared
// @cisa/core `buildToAsk` so the phone shows exactly the list and count the
// web page does.
import { useEffect, useMemo, useRef, useState } from 'react';
import { collectionGroup, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import {
  buildToAsk,
  reachByContact,
  type AppUser,
  type Contact,
  type Event,
  type Interaction,
  type ThreadMessageWithContact,
  type ToAskNotepad,
  type ToAskTeamFilter,
  type ToAskView,
} from '@cisa/core';
import { db, handleFirestoreError, OperationType } from './firebase';
import { subscribeContacts } from './data/contacts';
import { subscribeEvents } from './data/events';
import { subscribeAllThreads } from './data/threads';
import { subscribeUsers } from './data/users';
import { replaceToAskDrafted, subscribeToAskNotepad } from './data/toAsk';
import {
  interactionMs,
  toAskInteractionsOf,
  toAskMessagesOf,
  toAskPeopleOf,
  toAskTraineesOf,
} from './toAskView';
import { useIdentityReset } from './useIdentityReset';
import { useLoadTimeout } from './useLoadTimeout';
import { useMinLoading } from './useMinLoading';

const nowMs = () => Date.now();

const FEEDS = ['contacts', 'interactions', 'events', 'threads', 'users', 'notepad'] as const;

export function useToAskData(uid: string | null) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [threads, setThreads] = useState<ThreadMessageWithContact[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [notepad, setNotepad] = useState<ToAskNotepad>({});
  // Which feeds have delivered at least once — the drafted write-back waits
  // for all of them, and never runs after one failed.
  const [arrived, setArrived] = useState<ReadonlySet<string>>(() => new Set());
  const [failed, setFailed] = useState(false);
  const [timedOut, setTimedOut] = useState(false);

  useIdentityReset(uid, () => {
    setContacts([]);
    setInteractions([]);
    setThreads([]);
    setEvents([]);
    setUsers([]);
    setNotepad({});
    setArrived(new Set());
    setFailed(false);
    setTimedOut(false);
  });

  useEffect(() => {
    if (!uid) return;
    const arrive = (feed: string) => setArrived((s) => (s.has(feed) ? s : new Set(s).add(feed)));
    const onLoadError = (feed: string, path: string) => (e: unknown) => {
      setFailed(true);
      arrive(feed);
      handleFirestoreError(e, OperationType.LIST, path, { rethrow: false });
    };
    const unsubs = [
      subscribeContacts((next) => {
        setContacts(next);
        arrive('contacts');
      }, onLoadError('contacts', 'contacts')),
      // Newest 500, like the full-timer home: a LIVE collection-group read.
      onSnapshot(
        query(collectionGroup(db, 'interactions'), orderBy('createdAt', 'desc'), limit(500)),
        (snap) => {
          setInteractions(
            snap.docs.map((d) => ({
              id: d.id,
              ...(d.data() as Record<string, unknown>),
              contactId: d.ref.path.split('/')[1] ?? '',
            })) as Interaction[],
          );
          arrive('interactions');
        },
        onLoadError('interactions', 'interactions (collectionGroup)'),
      ),
      subscribeEvents((next) => {
        setEvents(next);
        arrive('events');
      }, onLoadError('events', 'events')),
      subscribeAllThreads(
        (next) => {
          setThreads(next);
          arrive('threads');
        },
        onLoadError('threads', 'threads (collectionGroup)'),
        { includeTeam: true },
      ),
      subscribeUsers((next) => {
        setUsers(next);
        arrive('users');
      }, onLoadError('users', 'users')),
      subscribeToAskNotepad(
        uid,
        (next) => {
          setNotepad(next);
          arrive('notepad');
        },
        onLoadError('notepad', `toAskNotes/${uid}`),
      ),
    ];
    return () => unsubs.forEach((u) => u());
  }, [uid]);

  useLoadTimeout(uid, () => setTimedOut(true));

  // Undo runs after later snapshots, so it rewrites from the latest notepad.
  const notepadRef = useRef(notepad);
  useEffect(() => {
    notepadRef.current = notepad;
  }, [notepad]);

  const nameByUid = useMemo(() => {
    const m: Record<string, string> = {};
    for (const u of users) if (u.uid && u.displayName) m[u.uid] ??= u.displayName;
    for (const c of contacts) if (c.createdBy && c.createdByName) m[c.createdBy] ??= c.createdByName;
    for (const i of interactions) {
      const u = i.reachedById ?? i.userId ?? i.createdById;
      const n = i.reachedByName ?? i.userName ?? i.createdByName;
      if (u && n) m[u] ??= n;
    }
    for (const m2 of threads) if (m2.from && m2.fromName) m[m2.from] ??= m2.fromName;
    return m;
  }, [users, contacts, interactions, threads]);

  const people = useMemo(() => toAskPeopleOf(contacts), [contacts]);
  const messages = useMemo(() => toAskMessagesOf(threads), [threads]);
  const trainees = useMemo(() => toAskTraineesOf(users, nameByUid), [users, nameByUid]);
  const reach = useMemo(
    () =>
      reachByContact({
        interactions: interactions.map((i) => ({ contactId: i.contactId ?? '', ms: interactionMs(i) })),
        gatherings: events,
        contacts,
      }),
    [interactions, events, contacts],
  );

  const filter: ToAskTeamFilter = notepad.teamFilter ?? 'all';
  const view: ToAskView = useMemo(
    () =>
      buildToAsk({
        uid: uid ?? '',
        now: nowMs(),
        filter,
        people,
        reach,
        trainees,
        messages,
        interactions: toAskInteractionsOf(interactions),
        notepad,
      }),
    [uid, filter, people, reach, trainees, messages, interactions, notepad],
  );

  // Persist the drafted keys the derivation has seen, so a line that clears
  // without ever being touched can still say what cleared it for a week.
  // Replace semantics, so a key the derivation dropped goes too; written only
  // when the key sets differ, so the snapshot of this write never re-fires it.
  // Waits for every feed and the notepad, or a half-loaded derivation would
  // replace the stored map with a partial one.
  const loaded = FEEDS.every((f) => arrived.has(f));
  useEffect(() => {
    if (!uid || !loaded || failed) return;
    const stored = Object.keys(notepad.drafted ?? {});
    const next = Object.keys(view.drafted);
    const storedSet = new Set(stored);
    const changed = stored.length !== next.length || next.some((k) => !storedSet.has(k));
    if (changed) void replaceToAskDrafted(uid, view.drafted);
  }, [uid, loaded, failed, view.drafted, notepad.drafted]);

  const contactById = useMemo(() => new Map(contacts.map((c) => [c.id, c])), [contacts]);

  return {
    view,
    notepad,
    notepadRef,
    filter,
    messages,
    contactById,
    loading: useMinLoading(!loaded && !timedOut),
    error: failed ? "Couldn't load everything. Some lines may be missing." : null,
  };
}
