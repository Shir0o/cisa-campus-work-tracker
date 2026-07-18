// Live data for the native Messages room list — mirrors the subscriptions in
// web's src/views/Messages.tsx + src/components/modals/CreateChatModal.tsx.
// Also backs the "More" tab's unread-room-count badge (same double-listener
// pattern already accepted for Notifications' badge).
import { useEffect, useMemo, useState } from 'react';
import { filterChatUsers, filterRooms, isRoomUnread, type AppUser, type ChatRoom } from '@cisa/core';
import { useAuth } from './AuthProvider';
import { handleFirestoreError, OperationType } from './firebase';
import { createGroupChat, getOrCreateDirectChat, subscribeChatRooms } from './data/chat';
import { subscribeUsers } from './data/users';
import { useChatReads } from './data/chatReads';

export function useMessagesData() {
  const { uid, role, user } = useAuth();
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const reads = useChatReads();

  const isAdmin = role === 'admin';

  useEffect(() => {
    if (!uid) return;
    const onLoadError = (e: unknown, path: string) => {
      setError(`Couldn't load ${path}.`);
      handleFirestoreError(e, OperationType.LIST, path, { rethrow: false });
    };
    const unsubRooms = subscribeChatRooms(
      uid,
      isAdmin,
      (list) => {
        setRooms(list);
        setLoading(false);
      },
      (e) => onLoadError(e, 'chatRooms'),
    );
    const unsubUsers = subscribeUsers(setUsers, (e) => onLoadError(e, 'users'));
    return () => {
      unsubRooms();
      unsubUsers();
    };
  }, [uid, isAdmin]);

  const usersCache = useMemo(() => {
    const map: Record<string, { displayName: string; photoURL?: string }> = {};
    for (const u of users) map[u.uid] = { displayName: u.displayName, photoURL: u.photoURL };
    return map;
  }, [users]);

  const visibleRooms = useMemo(() => filterRooms(rooms, uid, usersCache, search), [rooms, uid, usersCache, search]);

  const candidateUsers = useMemo(() => filterChatUsers(users, uid, ''), [users, uid]);

  const isUnread = (room: ChatRoom) => isRoomUnread(room, uid, uid ? reads.getLastRead(uid, room.id) : null);

  const unreadCount = useMemo(() => rooms.filter(isUnread).length, [rooms, uid, reads]);

  return {
    rooms: visibleRooms,
    usersCache,
    candidateUsers,
    search,
    setSearch,
    unreadCount,
    isUnread,
    loading,
    error,

    startDirectChat: (targetUser: AppUser): Promise<string> => {
      if (!uid) return Promise.reject(new Error('not signed in'));
      return getOrCreateDirectChat(
        { uid, displayName: user?.displayName || 'Member' },
        { uid: targetUser.uid, displayName: targetUser.displayName },
      );
    },
    createGroup: (groupName: string, memberUids: string[]): Promise<string> => {
      if (!uid) return Promise.reject(new Error('not signed in'));
      return createGroupChat(groupName, memberUids, { uid, displayName: user?.displayName || 'Member' });
    },
  };
}
