import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as firestore from 'firebase/firestore';
import { useContactStory } from '../hooks/useContactStory';
import type { Contact, Interaction, PrayerRecord, Gathering, Rhythm, Stage } from '../types';

const hoisted = vi.hoisted(() => ({
  subscribeRhythms: vi.fn(),
  subscribeThreads: vi.fn(),
  logActivity: vi.fn(),
  handleFirestoreError: vi.fn(),
}));

vi.mock('../lib/rhythms', () => ({
  subscribeRhythms: hoisted.subscribeRhythms,
}));

vi.mock('../lib/threads', () => ({
  subscribeThreads: hoisted.subscribeThreads,
}));

vi.mock('../lib/firebase', () => ({
  db: {},
  handleFirestoreError: hoisted.handleFirestoreError,
  OperationType: { LIST: 'LIST', UPDATE: 'UPDATE', CREATE: 'CREATE', DELETE: 'DELETE' },
  logActivity: hoisted.logActivity,
  sendNotification: vi.fn(),
}));

vi.mock('firebase/firestore', () => {
  return {
    collection: vi.fn((_db, ...parts) => ({ type: 'collection', path: parts.join('/'), id: parts[parts.length - 1] })),
    doc: vi.fn((_db, ...parts) => ({ type: 'doc', path: parts.join('/'), id: parts[parts.length - 1] })),
    updateDoc: vi.fn().mockResolvedValue(true),
    addDoc: vi.fn().mockResolvedValue({ id: 'mock-new-id' }),
    deleteDoc: vi.fn().mockResolvedValue(true),
    arrayUnion: vi.fn((...args) => ({ _methodName: 'arrayUnion', args })),
    arrayRemove: vi.fn((...args) => ({ _methodName: 'arrayRemove', args })),
    query: vi.fn((ref, ...constraints) => ({ type: 'query', ref, constraints })),
    where: vi.fn((field, op, val) => ({ field, op, val })),
    orderBy: vi.fn((field, dir) => ({ field, dir })),
    limit: vi.fn((n) => ({ limit: n })),
    onSnapshot: vi.fn(),
    getDocs: vi.fn().mockResolvedValue({ size: 0, docs: [] }),
    serverTimestamp: vi.fn(() => 'MOCK_TIMESTAMP'),
    Timestamp: class MockTimestamp {
      static now() { return new MockTimestamp(); }
      static fromDate() { return new MockTimestamp(); }
      toDate() { return new Date(); }
    },
  };
});

describe('useContactStory', () => {
  let snapshotCallbacks: { ref: any; onNext: (snap: any) => void; onError?: (err: any) => void; unsub: ReturnType<typeof vi.fn> }[];
  let rhythmsUnsub: ReturnType<typeof vi.fn>;
  let threadsUnsub: ReturnType<typeof vi.fn>;
  let rhythmsCallback: ((r: Rhythm[]) => void) | null;
  let threadsCallback: ((m: any[]) => void) | null;

  beforeEach(() => {
    snapshotCallbacks = [];
    rhythmsUnsub = vi.fn();
    threadsUnsub = vi.fn();
    rhythmsCallback = null;
    threadsCallback = null;

    vi.clearAllMocks();

    (firestore.onSnapshot as any).mockImplementation((ref: any, onNext: any, onError: any) => {
      const unsub = vi.fn();
      snapshotCallbacks.push({ ref, onNext, onError, unsub });
      return unsub;
    });

    hoisted.subscribeRhythms.mockImplementation((cb: (r: Rhythm[]) => void) => {
      rhythmsCallback = cb;
      return rhythmsUnsub;
    });

    hoisted.subscribeThreads.mockImplementation((_id: string, cb: (m: any[]) => void) => {
      threadsCallback = cb;
      return threadsUnsub;
    });
  });

  it('subscribes to all nine collections and manages deterministic teardown on unmount', () => {
    const contact: Contact = { id: 'c1', name: 'Alice Smith', createdAt: '2026-01-01T00:00:00Z' } as Contact;
    const { result, unmount } = renderHook(() => useContactStory(contact, { enabled: true }));

    // Verify 7 onSnapshot subscriptions + 1 rhythms subscription + 1 threads subscription = 9 listeners total
    // 7 onSnapshot: contact doc, interactions subcollection, prayers, activities, gatherings (events), users, stages
    expect(snapshotCallbacks.length).toBe(7);
    expect(hoisted.subscribeRhythms).toHaveBeenCalledTimes(1);
    expect(hoisted.subscribeThreads).toHaveBeenCalledTimes(1);

    expect(result.current.loading).toBe(true);
    expect(result.current.error).toBeNull();
    expect(Array.isArray(result.current.story)).toBe(true);
    expect(typeof result.current.actions).toBe('object');

    unmount();

    // Verify all 7 snapshot unsubs called
    snapshotCallbacks.forEach((sub) => {
      expect(sub.unsub).toHaveBeenCalledTimes(1);
    });
    // Verify rhythms and threads unsubs called
    expect(rhythmsUnsub).toHaveBeenCalledTimes(1);
    expect(threadsUnsub).toHaveBeenCalledTimes(1);
  });

  it('does not subscribe when enabled is false or contactId is falsy', () => {
    const { result, unmount } = renderHook(() => useContactStory(null, { enabled: false }));
    expect(snapshotCallbacks.length).toBe(0);
    expect(hoisted.subscribeRhythms).not.toHaveBeenCalled();
    expect(hoisted.subscribeThreads).not.toHaveBeenCalled();
    expect(result.current.story).toEqual([]);
    unmount();
  });

  it('tears down old listeners and subscribes new ones when contact ID changes', () => {
    const contactA: Contact = { id: 'c1', name: 'Alice' } as Contact;
    const contactB: Contact = { id: 'c2', name: 'Bob' } as Contact;

    let currentContact = contactA;
    const { rerender } = renderHook(() => useContactStory(currentContact, { enabled: true }));

    expect(snapshotCallbacks.length).toBe(7);
    const firstSubs = [...snapshotCallbacks];

    currentContact = contactB;
    rerender();

    // First batch was unmounted
    firstSubs.forEach((sub) => {
      expect(sub.unsub).toHaveBeenCalledTimes(1);
    });
    expect(rhythmsUnsub).toHaveBeenCalledTimes(1);
    expect(threadsUnsub).toHaveBeenCalledTimes(1);

    // New subscriptions opened
    expect(hoisted.subscribeThreads).toHaveBeenCalledTimes(2);
  });

  it('assembles unified chronological story timeline across multiple collection events', () => {
    const contact: Contact = {
      id: 'c1',
      name: 'Alice',
      createdAt: '2026-01-01T00:00:00Z',
      createdByName: 'Staff Member',
    } as Contact;

    const { result } = renderHook(() => useContactStory(contact, { enabled: true }));

    // Find the callbacks
    const contactSub = snapshotCallbacks.find((s) => s.ref?.path === 'contacts/c1');
    const interactionsSub = snapshotCallbacks.find((s) => s.ref?.ref?.path === 'contacts/c1/interactions');
    const prayersSub = snapshotCallbacks.find((s) => s.ref?.ref?.path === 'prayers');
    const activitiesSub = snapshotCallbacks.find((s) => s.ref?.ref?.path === 'activities');
    const gatheringsSub = snapshotCallbacks.find((s) => s.ref?.ref?.path === 'events');

    expect(contactSub).toBeDefined();
    expect(interactionsSub).toBeDefined();

    act(() => {
      contactSub?.onNext({
        id: 'c1',
        exists: () => true,
        data: () => ({ ...contact, stage: 'Regular' }),
      });
      interactionsSub?.onNext({
        docs: [
          {
            id: 'i1',
            data: () => ({
              id: 'i1',
              type: 'call',
              content: 'Discussed campus Bible study',
              dateTime: '2026-02-15T10:00:00Z',
              createdAt: '2026-02-15T10:00:00Z',
            }),
          },
        ],
      });
      prayersSub?.onNext({
        docs: [
          {
            id: 'p1',
            data: () => ({
              id: 'p1',
              contactId: 'c1',
              text: 'Pray for midterms',
              date: '2026-03-01T00:00:00Z',
              status: 'open',
            }),
          },
        ],
      });
      activitiesSub?.onNext({ docs: [] });
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.story.length).toBeGreaterThan(0);

    const kinds = result.current.story.map((entry) => entry.kind);
    // Story should contain conversation, prayer, and added entry at the bottom
    expect(kinds).toContain('conversation');
    expect(kinds).toContain('prayer');
    expect(kinds[kinds.length - 1]).toBe('added');
  });

  it('handles empty or missing subcollections gracefully', () => {
    const contact: Contact = { id: 'c1', name: 'Alice' } as Contact;
    const { result } = renderHook(() => useContactStory(contact, { enabled: true }));

    // Emit empty docs for all
    act(() => {
      snapshotCallbacks.forEach((s) => {
        if (s.ref?.type === 'doc') {
          s.onNext({ id: 'c1', exists: () => true, data: () => ({ ...contact }) });
        } else {
          s.onNext({ docs: [] });
        }
      });
      rhythmsCallback?.([]);
      threadsCallback?.([]);
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.story.length).toBe(1); // 'added' entry
    expect(result.current.story[0].kind).toBe('added');
  });

  it('captures subscription errors', () => {
    const contact: Contact = { id: 'c1', name: 'Alice' } as Contact;
    const { result } = renderHook(() => useContactStory(contact, { enabled: true }));

    const error = new Error('Permission denied');
    act(() => {
      snapshotCallbacks[0].onError?.(error);
    });

    expect(result.current.error).toEqual(error);
  });

  it('delegates modal actions correctly', async () => {
    const contact: Contact = { id: 'c1', name: 'Alice', stage: 'First Contact', storyMessageIds: ['m1'] } as Contact;
    const { result } = renderHook(() => useContactStory(contact, { enabled: true }));

    // Toggle story message
    await act(async () => {
      await result.current.actions.toggleStoryMessage({ id: 'm1' });
    });
    expect(firestore.updateDoc).toHaveBeenCalled();

    // Move stage
    await act(async () => {
      await result.current.actions.moveStage('Regular');
    });
    expect(firestore.updateDoc).toHaveBeenCalled();
    expect(hoisted.logActivity).toHaveBeenCalled();

    // Change kind
    await act(async () => {
      await result.current.actions.changeKind('our-own');
    });
    expect(firestore.updateDoc).toHaveBeenCalled();

    // Add interaction
    await act(async () => {
      await result.current.actions.addInteraction({ content: 'Met for coffee', type: 'interaction' });
    });
    expect(firestore.addDoc).toHaveBeenCalled();

    // Update interaction
    await act(async () => {
      await result.current.actions.updateInteraction('int1', { content: 'Updated content', type: 'call' });
    });
    expect(firestore.updateDoc).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'contacts/c1/interactions/int1' }),
      {
        content: 'Updated content',
        type: 'call',
      }
    );

    // Add prayer
    await act(async () => {
      await result.current.actions.addPrayer({ text: 'Pray for salvation' });
    });
    expect(firestore.addDoc).toHaveBeenCalled();

    // Update prayer status
    await act(async () => {
      await result.current.actions.updatePrayerStatus({ id: 'p1', text: 'Pray' } as any, 'answered', 'Sep 24');
    });
    expect(firestore.updateDoc).toHaveBeenCalled();

    // Delete contact
    await act(async () => {
      await result.current.actions.deleteContact();
    });
    expect(firestore.deleteDoc).toHaveBeenCalled();
  });
});
