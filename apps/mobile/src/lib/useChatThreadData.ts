// Live data for a single Messages thread — the active room doc, its member
// roster, and its messages (day-grouped). Mirrors the subscriptions in web's
// src/views/Messages.tsx active-chat pane.
//
// Inviting and leaving are gone with the Material details sheet: mobile v2 has
// no room administration (the design's `M2Thread` is read-and-reply), so that
// stays on the desktop site.
import { useEffect, useMemo, useState } from 'react';
import {
  contactIdForEmail,
  groupMessagesByDay,
  type AppUser,
  type ChatMessage,
  type ChatRoom,
  type ChatUserSummary,
  type Contact,
} from '@cisa/core';
import { useAuth } from './AuthProvider';
import { handleFirestoreError, OperationType } from './firebase';
import { sendMessage as sendMessageApi, subscribeChatRoom, subscribeRoomMessages } from './data/chat';
import { subscribeContacts } from './data/contacts';
import { subscribeUsers } from './data/users';
import { ChatReads } from './data/chatReads';
import { useIdentityReset } from './useIdentityReset';

export function useChatThreadData(roomId: string) {
  const { uid, user } = useAuth();
  const [room, setRoom] = useState<ChatRoom | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // When the identity changes — impersonation's "See it as they do" most
  // loudly — the previous viewer's content must not stay rendered until the
  // new subscription's first snapshot lands, or it flashes and then vanishes.
  // Reset synchronously (a render-phase adjustment) so the first frame after
  // the change is already the loading skeleton.
  useIdentityReset(`${uid}:${roomId}`, () => {
    setRoom(null);
    setMessages([]);
    setLoading(true);
    setError(null);
  });

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

  // The design offers "Open {first}'s page →" in a direct chat. A room is
  // user-to-user and a Contact has no uid, so the join is the address they
  // signed up with — see contactIdForEmail. Only a DM pays for the listener.
  const isDirect = room?.type === 'direct';
  const partnerEmail = useMemo(() => {
    if (!isDirect || !room) return null;
    const otherUid = room.memberIds.find((id) => id !== uid);
    return users.find((u) => u.uid === otherUid)?.email ?? null;
  }, [isDirect, room, users, uid]);

  useEffect(() => {
    if (!uid || !partnerEmail) {
      setContacts([]);
      return;
    }
    return subscribeContacts(setContacts, () => setContacts([]));
  }, [uid, partnerEmail]);

  const partnerContactId = useMemo(
    () => contactIdForEmail(contacts, partnerEmail),
    [contacts, partnerEmail],
  );

  return {
    room,
    usersCache,
    dayGroups,
    partnerContactId,
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
  };
}
