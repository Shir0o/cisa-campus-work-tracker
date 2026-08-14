// Live data for the native Messages room list — mirrors the `chatRooms`
// subscription in web's src/views/Messages.tsx. Also backs the tab bar's
// unread-room-count badge (same double-listener pattern already accepted for
// Notifications' badge).
//
// Starting a conversation is no longer among the things this hook does: mobile
// v2 has no create affordance on either the member or the staff list (the
// design's `M2Messages` is a list of what you're already part of), so the
// create/search plumbing came out with the Material sheet that used it.
import { useEffect, useMemo, useState } from 'react';
import { filterRooms, isRoomUnread, type AppUser, type ChatRoom } from '@cisa/core';
import { useAuth } from './AuthProvider';
import { handleFirestoreError, OperationType } from './firebase';
import { subscribeChatRooms } from './data/chat';
import { subscribeUsers } from './data/users';
import { useChatReads } from './data/chatReads';
import { useIdentityReset } from './useIdentityReset';
import { useMinLoading } from './useMinLoading';

export function useMessagesData() {
  const { uid } = useAuth();
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const reads = useChatReads();

  // Same impersonation guard as useChatThreadData: drop the previous identity's
  // room list synchronously instead of flashing it until the new snapshot.
  useIdentityReset(uid, () => {
    setRooms([]);
    setLoading(true);
    setError(null);
  });

  useEffect(() => {
    if (!uid) return;
    const onLoadError = (e: unknown, path: string) => {
      setError(`Couldn't load ${path}.`);
      handleFirestoreError(e, OperationType.LIST, path, { rethrow: false });
    };
    const unsubRooms = subscribeChatRooms(
      uid,
      (list) => {
        setRooms(list);
        setLoading(false);
      },
      () => {
        setRooms([]);
        setLoading(false);
      },
    );
    const unsubUsers = subscribeUsers(setUsers, () => setUsers([]));
    return () => {
      unsubRooms();
      unsubUsers();
    };
  }, [uid]);

  const usersCache = useMemo(() => {
    const map: Record<string, { displayName: string; photoURL?: string }> = {};
    for (const u of users) map[u.uid] = { displayName: u.displayName, photoURL: u.photoURL };
    return map;
  }, [users]);

  // Still `filterRooms` with an empty query: besides searching, it also strips
  // the `cisa-` test-fixture rooms out of the list.
  const visibleRooms = useMemo(() => filterRooms(rooms, uid, usersCache, ''), [rooms, uid, usersCache]);

  const isUnread = (room: ChatRoom) => isRoomUnread(room, uid, uid ? reads.getLastRead(uid, room.id) : null);

  // Count unread from the VISIBLE list — a room the user deleted-for-themselves
  // (`filterRooms` strips it) must not keep lighting the tab-bar badge.
  const unreadCount = useMemo(() => visibleRooms.filter(isUnread).length, [visibleRooms, uid, reads]);

  const shownLoading = useMinLoading(loading);

  return { rooms: visibleRooms, usersCache, unreadCount, isUnread, loading: shownLoading, error };
}
