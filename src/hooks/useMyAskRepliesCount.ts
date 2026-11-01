import { useEffect, useState } from 'react';
import { askUnreadFor, subscribeAsks, type AskMessage } from '../lib/asks';
import { useInboxReads } from '../lib/inboxReads';

/**
 * Live count of replies waiting on the reader's *own* questions — the number a
 * trainee is owed, and the one their bar carries (#1806).
 *
 * This is deliberately not `useWaitingAsksCount`: that one counts other
 * people's unanswered questions, which is a full-timer's queue. The two agree
 * with the rules rather than inventing a third reading — `askVisibleFor` lets
 * staff read every question, while `askUnreadFor` already defines a trainee's
 * unread as replies on their own threads (#563). Same source of truth as the
 * Messages channel header, so the bar and the page cannot disagree.
 *
 * Returns 0 for an unauthenticated caller, and 0 until the first snapshot.
 */
export function useMyAskRepliesCount(uid: string | null | undefined): number {
  const inbox = useInboxReads();
  const [asks, setAsks] = useState<AskMessage[]>([]);

  useEffect(() => {
    if (!uid) {
      setAsks([]);
      return;
    }
    return subscribeAsks(setAsks, undefined, { uid, isStaff: true });
  }, [uid]);

  if (!uid) return 0;
  return askUnreadFor(asks, uid, false, (key) => inbox.isRead(uid, key));
}
