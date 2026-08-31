import { useEffect, useState } from 'react';
import { askAnswered, askQuestions, subscribeAsks } from '../lib/asks';

/**
 * Live count of "waiting" questions for the given staff user — top-level
 * questions asked by anyone else that nobody has answered yet.
 *
 * The same source of truth is used by the top bar (#646) and the rail (#665),
 * so two shells can mount this hook in parallel and stay in sync — Firestore's
 * `onSnapshot` already deduplicates per document server-side.
 *
 * Returns 0 for unauthenticated or non-staff callers and 0 when there's no
 * data yet (the initial state).
 */
export function useWaitingAsksCount(
  uid: string | null | undefined,
  isStaff: boolean,
): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!isStaff || !uid) {
      setCount(0);
      return;
    }
    return subscribeAsks(
      (msgs) =>
        setCount(
          askQuestions(msgs).filter((m) => m.from !== uid && !askAnswered(msgs, m)).length,
        ),
      undefined,
      { uid, isStaff: true },
    );
  }, [isStaff, uid]);
  return count;
}
