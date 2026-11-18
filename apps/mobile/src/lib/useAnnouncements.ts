// What the phone's home needs from Announcements: the cards this person has not
// marked Got it, and — for a Full-timer — what they posted this week and the
// team to count it against.
import { useEffect, useMemo, useState } from 'react';
import { openAnnouncements, yourAnnouncements, type Announcement, type AppUser } from '@cisa/core';
import { subscribeAnnouncements, subscribeTeam } from './data/announcements';

export function useAnnouncements(uid: string | null | undefined, isFullTimer: boolean) {
  const [list, setList] = useState<Announcement[]>([]);
  const [team, setTeam] = useState<AppUser[]>([]);

  useEffect(() => {
    if (!uid) return;
    return subscribeAnnouncements(setList, () => setList([]));
  }, [uid]);

  useEffect(() => {
    if (!uid || !isFullTimer) return;
    return subscribeTeam(setTeam, () => setTeam([]));
  }, [uid, isFullTimer]);

  const open = useMemo(() => (uid ? openAnnouncements(list, uid) : []), [list, uid]);
  const mine = useMemo(() => (uid && isFullTimer ? yourAnnouncements(list, uid) : []), [list, uid, isFullTimer]);
  return { open, mine, team };
}
