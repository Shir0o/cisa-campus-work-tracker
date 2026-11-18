import { useEffect, useState } from 'react';
import {
  collection,
  getDocs,
  limit,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore';
import { db } from './firebase';
import type { FirstRunPredicateContext } from './firstRun';

export type FirstRunRecordFlags = Pick<
  FirstRunPredicateContext,
  'docsCount' | 'messagesCount'
>;

export const EMPTY_FIRST_RUN_RECORDS: FirstRunRecordFlags = {
  docsCount: 0,
  messagesCount: 0,
};

export function existenceFlag(present: boolean): number {
  return present ? 1 : 0;
}

export interface FirstRunRecordSources {
  docs: boolean;
  messages: boolean;
}

export function firstRunRecordSources(role?: string | null): FirstRunRecordSources {
  const norm = (role || 'trainee').toLowerCase();
  const fullTimer = norm === 'admin' || norm === 'ft';
  const trainee = norm === 'trainee' || norm === 'manager';
  return {
    docs: fullTimer,
    messages: trainee,
  };
}

export function useFirstRunRecords(
  role?: string | null,
  uid?: string | null,
): FirstRunRecordFlags {
  const { docs, messages } = firstRunRecordSources(role);
  const [flags, setFlags] = useState<FirstRunRecordFlags>(EMPTY_FIRST_RUN_RECORDS);
  const [lastUid, setLastUid] = useState(uid);

  if (lastUid !== uid) {
    setLastUid(uid);
    setFlags(EMPTY_FIRST_RUN_RECORDS);
  }

  useEffect(() => {
    if (!uid || !docs) return;
    return onSnapshot(
      query(collection(db, 'board_docs'), where('createdBy', '==', uid), limit(1)),
      (snap) => setFlags((f) => ({ ...f, docsCount: existenceFlag(!snap.empty) })),
      () => setFlags((f) => ({ ...f, docsCount: 0 })),
    );
  }, [uid, docs]);

  useEffect(() => {
    if (!uid || !messages) return;
    let cancelled = false;
    const unsubscribe = onSnapshot(
      query(collection(db, 'chatRooms'), where('memberIds', 'array-contains', uid)),
      (rooms) => {
        void Promise.all(
          rooms.docs.map((room: { id: string }) =>
            getDocs(
              query(
                collection(db, 'chatRooms', room.id, 'messages'),
                where('senderId', '==', uid),
                limit(1),
              ),
            )
              .then((snap) => !snap.empty)
              .catch(() => false),
          ),
        ).then((hits) => {
          if (!cancelled) {
            setFlags((f) => ({
              ...f,
              messagesCount: existenceFlag(hits.some(Boolean)),
            }));
          }
        });
      },
      () => setFlags((f) => ({ ...f, messagesCount: 0 })),
    );
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [uid, messages]);

  return {
    docsCount: docs ? flags.docsCount : 0,
    messagesCount: messages ? flags.messagesCount : 0,
  };
}
