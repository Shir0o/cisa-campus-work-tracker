// Live data for a single Messages thread — the active room doc, its member
// roster, and its messages (day-grouped). Mirrors the subscriptions in web's
// src/views/Messages.tsx active-chat pane.
//
// Inviting and leaving are gone with the Material details sheet: mobile v2 has
// no room administration (the design's `M2Thread` is read-and-reply), so that
// stays on the desktop site.
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  contactIdForEmail,
  type AppUser,
  type ChatAttachment,
  type ChatMessage,
  type ChatRoom,
  type ChatUserSummary,
  type Contact,
} from '@cisa/core';
import { useAuth } from './AuthProvider';
import { handleFirestoreError, OperationType } from './firebase';
import {
  acknowledgeAnnouncement,
  markAnnouncementRead,
  removeMessageForEveryone,
  sendMessage as sendMessageApi,
  subscribeChatRoom,
  subscribeRoomMessages,
  togglePinMessage,
} from './data/chat';
import { readMarkOf } from './chatStream';
import { subscribeContacts } from './data/contacts';
import { subscribeUsers } from './data/users';
import { ChatReads } from './data/chatReads';
import { useIdentityReset } from './useIdentityReset';
import { useMinLoading } from './useMinLoading';

export function useChatThreadData(roomId: string) {
  const { uid, role, user } = useAuth();
  const [room, setRoom] = useState<ChatRoom | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // The room's last-read from before this visit, kept for the New line: opening
  // the room marks it read, which would otherwise erase the line at once.
  const [lastReadAt, setLastReadAt] = useState<string | null>(null);
  const readCaptured = useRef(false);

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
    setLastReadAt(null);
    readCaptured.current = false;
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
        if (!readCaptured.current) {
          readCaptured.current = true;
          setLastReadAt(readMarkOf(ChatReads.getLastRead(uid, roomId)));
        }
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
    return subscribeContacts(setContacts, () => setContacts([]), { role, staffId: uid });
  }, [uid, role, partnerEmail]);

  const partnerContactId = useMemo(
    () => contactIdForEmail(contacts, partnerEmail),
    [contacts, partnerEmail],
  );

  const shownLoading = useMinLoading(loading);

  return {
    room,
    usersCache,
    messages,
    users,
    lastReadAt,
    partnerContactId,
    loading: shownLoading,
    error,

    send: async (text: string, parentId?: string | null, attachments?: ChatAttachment[]) => {
      if (!uid || !room || (!text.trim() && !(attachments && attachments.length > 0))) return;
      await sendMessageApi(
        roomId,
        text,
        { uid, displayName: user?.displayName || 'Member', photoURL: user?.photoURL || '' },
        attachments,
        room.memberIds,
        { type: room.type, name: room.name },
        parentId ?? null,
      );
    },

    /** Toggles the viewer's "Got it" on an announcement post. */
    acknowledge: async (message: ChatMessage) => {
      if (uid) await acknowledgeAnnouncement(roomId, message.id, uid, message.acknowledged ?? []);
    },
    /** A passive read receipt when an announcement post comes into view (#1277). */
    markRead: async (messageId: string) => {
      if (uid) await markAnnouncementRead(roomId, messageId, uid);
    },
    pin: async (messageId: string, pinned: boolean) => {
      if (uid) await togglePinMessage(roomId, messageId, pinned, uid);
    },
    /** Takes a message back for everyone. */
    remove: async (messageId: string) => {
      if (uid) await removeMessageForEveryone(roomId, messageId, uid);
    },
  };
}
