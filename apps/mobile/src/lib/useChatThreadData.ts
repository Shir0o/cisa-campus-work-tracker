// Live data for a single Messages thread — the active room doc, its member
// roster, and its messages (day-grouped). Mirrors the subscriptions in web's
// src/views/Messages.tsx active-chat pane.
import { useEffect, useMemo, useState } from 'react';
import { groupMessagesByDay, type AppUser, type ChatMessage, type ChatRoom, type ChatUserSummary } from '@cisa/core';
import { useAuth } from './AuthProvider';
import { handleFirestoreError, OperationType } from './firebase';
import {
  inviteToGroup as inviteToGroupApi,
  leaveGroup as leaveGroupApi,
  sendMessage as sendMessageApi,
  subscribeChatRoom,
  subscribeRoomMessages,
} from './data/chat';
import { subscribeUsers } from './data/users';
import { ChatReads } from './data/chatReads';

export function useChatThreadData(roomId: string) {
  const { uid, user } = useAuth();
  const [room, setRoom] = useState<ChatRoom | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!uid || !roomId) return;
    const onLoadError = (e: unknown, path: string) => {
      setError(`Couldn't load ${path}.`);
      handleFirestoreError(e, OperationType.LIST, path, { rethrow: false });
    };
    const unsubRoom = subscribeChatRoom(roomId, setRoom, (e) => onLoadError(e, `chatRooms/${roomId}`));
    const unsubMessages = subscribeRoomMessages(
      roomId,
      (list) => {
        setMessages(list);
        setLoading(false);
        ChatReads.markRead(uid, roomId);
      },
      (e) => onLoadError(e, `chatRooms/${roomId}/messages`),
    );
    const unsubUsers = subscribeUsers(setUsers, (e) => onLoadError(e, 'users'));
    return () => {
      unsubRoom();
      unsubMessages();
      unsubUsers();
    };
  }, [uid, roomId]);

  const usersCache = useMemo(() => {
    const map: Record<string, ChatUserSummary> = {};
    for (const u of users) map[u.uid] = { displayName: u.displayName, photoURL: u.photoURL };
    return map;
  }, [users]);

  const dayGroups = useMemo(() => groupMessagesByDay(messages), [messages]);

  return {
    room,
    users,
    usersCache,
    dayGroups,
    loading,
    error,

    send: async (text: string) => {
      if (!uid || !room || !text.trim()) return;
      await sendMessageApi(
        roomId,
        text,
        { uid, displayName: user?.displayName || 'Member', photoURL: user?.photoURL || '' },
        undefined,
        room.memberIds,
      );
    },

    invite: async (uids: string[], names: string[]) => {
      if (!uid || !user) return;
      await inviteToGroupApi(roomId, uids, names, { uid, displayName: user.displayName || 'Member' });
    },

    leave: async () => {
      if (!uid) return;
      await leaveGroupApi(roomId, { uid, displayName: user?.displayName || 'Member' });
    },
  };
}
