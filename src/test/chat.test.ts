import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as firestore from 'firebase/firestore';

const mockGetDoc = vi.fn();
const mockSetDoc = vi.fn().mockResolvedValue(undefined);
const mockAddDoc = vi.fn().mockResolvedValue({ id: 'new-doc-id' });
const mockUpdateDoc = vi.fn().mockResolvedValue(undefined);

vi.mock('firebase/firestore', () => ({
  getDoc: (...args: any[]) => mockGetDoc(...args),
  setDoc: (...args: any[]) => mockSetDoc(...args),
  addDoc: (...args: any[]) => mockAddDoc(...args),
  updateDoc: (...args: any[]) => mockUpdateDoc(...args),
  collection: vi.fn((_db: any, ...paths: string[]) => `col:${paths.join('/')}`),
  doc: vi.fn((_db: any, ...paths: string[]) => `doc:${paths.join('/')}`),
  serverTimestamp: vi.fn(() => 'SERVER_TS'),
  arrayUnion: vi.fn((...args: any[]) => ({ type: 'arrayUnion', args })),
  arrayRemove: vi.fn((...args: any[]) => ({ type: 'arrayRemove', args })),
}));

vi.mock('../lib/firebase', () => ({
  db: 'mock-db',
}));

import {
  getDirectChatId,
  getOrCreateDirectChat,
  createGroupChat,
  sendMessage,
  inviteToGroup,
  leaveGroup
} from '../services/chat';

describe('chat.ts services', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getDirectChatId', () => {
    it('sorts UIDs alphabetically and outputs direct ID', () => {
      expect(getDirectChatId('uidB', 'uidA')).toBe('direct_uidA_uidB');
      expect(getDirectChatId('uid123', 'uid456')).toBe('direct_uid123_uid456');
    });
  });

  describe('getOrCreateDirectChat', () => {
    it('returns roomId immediately if room document exists', async () => {
      mockGetDoc.mockResolvedValueOnce({
        exists: () => true
      });

      const roomId = await getOrCreateDirectChat(
        { uid: 'u1', displayName: 'User One' },
        { uid: 'u2', displayName: 'User Two' }
      );

      expect(roomId).toBe('direct_u1_u2');
      expect(mockGetDoc).toHaveBeenCalled();
      expect(mockSetDoc).not.toHaveBeenCalled();
    });

    it('creates room document if it does not exist', async () => {
      mockGetDoc.mockResolvedValueOnce({
        exists: () => false
      });

      const roomId = await getOrCreateDirectChat(
        { uid: 'u1', displayName: 'User One' },
        { uid: 'u2', displayName: 'User Two' }
      );

      expect(roomId).toBe('direct_u1_u2');
      expect(mockGetDoc).toHaveBeenCalled();
      expect(mockSetDoc).toHaveBeenCalledWith('doc:chatRooms/direct_u1_u2', {
        type: 'direct',
        memberIds: ['u1', 'u2'],
        createdById: 'u1',
        createdByName: 'User One',
        createdAt: 'SERVER_TS',
      });
    });
  });

  describe('createGroupChat', () => {
    it('adds group chat document and posts system message', async () => {
      const roomId = await createGroupChat(
        'My Team',
        ['u2', 'u3'],
        { uid: 'u1', displayName: 'User One' }
      );

      expect(roomId).toBe('new-doc-id');
      expect(mockAddDoc).toHaveBeenCalledTimes(2);

      // Verify group creation doc
      expect(mockAddDoc).toHaveBeenNthCalledWith(1, 'col:chatRooms', {
        type: 'group',
        name: 'My Team',
        memberIds: ['u1', 'u2', 'u3'],
        createdById: 'u1',
        createdByName: 'User One',
        createdAt: 'SERVER_TS'
      });

      // Verify system genesis message
      expect(mockAddDoc).toHaveBeenNthCalledWith(2, 'col:chatRooms/new-doc-id/messages', {
        roomId: 'new-doc-id',
        text: 'User One created group "My Team"',
        senderId: 'system',
        senderName: 'System',
        timestamp: 'SERVER_TS',
        type: 'system'
      });
    });
  });

  describe('sendMessage', () => {
    it('returns early if no text and no attachments', async () => {
      await sendMessage('r1', '', { uid: 'u1', displayName: 'User' });
      expect(mockAddDoc).not.toHaveBeenCalled();
      expect(mockUpdateDoc).not.toHaveBeenCalled();
    });

    it('sends text-only message and updates last message preview', async () => {
      await sendMessage('r1', 'hello world', { uid: 'u1', displayName: 'User One', photoURL: 'p1' });
      
      expect(mockAddDoc).toHaveBeenCalledWith('col:chatRooms/r1/messages', {
        roomId: 'r1',
        text: 'hello world',
        senderId: 'u1',
        senderName: 'User One',
        senderPhoto: 'p1',
        timestamp: 'SERVER_TS',
        type: 'text',
        attachments: []
      });

      expect(mockUpdateDoc).toHaveBeenCalledWith('doc:chatRooms/r1', {
        lastMessage: {
          text: 'hello world',
          senderId: 'u1',
          senderName: 'User One',
          timestamp: 'SERVER_TS'
        }
      });
    });

    it('sends attachment-only message and updates last message preview', async () => {
      const attachment = { type: 'contact' as const, id: 'c1', name: 'Alice' };
      await sendMessage('r1', '', { uid: 'u1', displayName: 'User One' }, [attachment]);

      expect(mockAddDoc).toHaveBeenCalledWith('col:chatRooms/r1/messages', {
        roomId: 'r1',
        text: '',
        senderId: 'u1',
        senderName: 'User One',
        senderPhoto: '',
        timestamp: 'SERVER_TS',
        type: 'text',
        attachments: [attachment]
      });

      expect(mockUpdateDoc).toHaveBeenCalledWith('doc:chatRooms/r1', {
        lastMessage: {
          text: 'Shared contact',
          senderId: 'u1',
          senderName: 'User One',
          timestamp: 'SERVER_TS'
        }
      });
    });
  });

  describe('inviteToGroup', () => {
    it('updates room memberIds and posts system message', async () => {
      await inviteToGroup('r1', ['u2'], ['Bob'], 'Alice');

      expect(mockUpdateDoc).toHaveBeenCalledWith('doc:chatRooms/r1', {
        memberIds: { type: 'arrayUnion', args: ['u2'] }
      });

      expect(mockAddDoc).toHaveBeenCalledWith('col:chatRooms/r1/messages', {
        roomId: 'r1',
        text: 'Alice added Bob to the group',
        senderId: 'system',
        senderName: 'System',
        timestamp: 'SERVER_TS',
        type: 'system'
      });
    });
  });

  describe('leaveGroup', () => {
    it('removes room memberId and posts system message', async () => {
      await leaveGroup('r1', { uid: 'u2', displayName: 'Bob' });

      expect(mockUpdateDoc).toHaveBeenCalledWith('doc:chatRooms/r1', {
        memberIds: { type: 'arrayRemove', args: ['u2'] }
      });

      expect(mockAddDoc).toHaveBeenCalledWith('col:chatRooms/r1/messages', {
        roomId: 'r1',
        text: 'Bob left the group',
        senderId: 'system',
        senderName: 'System',
        timestamp: 'SERVER_TS',
        type: 'system'
      });
    });
  });
});
