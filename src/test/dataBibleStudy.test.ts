import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  subscribePublishedStudyMeetings,
  subscribeStudyMeetings,
  subscribeMeeting,
  saveMeeting,
  setMeetingPublished,
  deleteMeeting,
} from '../lib/data/bibleStudy';

vi.mock('../lib/firebase', () => ({ db: {} }));

const mockDocs: any[] = [];
let mockDocExists = true;
let mockDocData = {};

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db, name) => ({ path: name })),
  doc: vi.fn((_db, name, id) => ({ path: `${name}/${id}`, id })),
  query: vi.fn((...args) => ({ args })),
  where: vi.fn((field, op, val) => ({ field, op, val })),
  orderBy: vi.fn((field, dir) => ({ field, dir })),
  onSnapshot: vi.fn((target, onNext, onError) => {
    if (target.path && target.path.includes('/')) {
      // doc listener
      onNext({
        id: target.id || 'm1',
        exists: () => mockDocExists,
        data: () => mockDocData,
      });
    } else {
      // query listener
      onNext({
        docs: mockDocs,
      });
    }
    return vi.fn(); // unsubscribe
  }),
  setDoc: vi.fn().mockResolvedValue(undefined),
  updateDoc: vi.fn().mockResolvedValue(undefined),
  deleteDoc: vi.fn().mockResolvedValue(undefined),
  serverTimestamp: vi.fn(() => 'mock-server-timestamp'),
}));

describe('bibleStudy data service', () => {
  const fakeDb = {} as any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDocs.length = 0;
    mockDocExists = true;
    mockDocData = {};
  });

  it('subscribePublishedStudyMeetings invokes callback with mapped meetings', () => {
    mockDocs.push({
      id: 'meeting-1',
      data: () => ({
        studyId: 'romans',
        date: '2026-09-01',
        title: 'Peace',
        sections: [],
        published: true,
      }),
    });

    const cb = vi.fn();
    const unsub = subscribePublishedStudyMeetings(fakeDb, 'romans', cb);

    expect(cb).toHaveBeenCalledWith([
      expect.objectContaining({
        id: 'meeting-1',
        studyId: 'romans',
        title: 'Peace',
        published: true,
      }),
    ]);
    expect(typeof unsub).toBe('function');
  });

  it('subscribeStudyMeetings passes full list to callback', () => {
    mockDocs.push({
      id: 'meeting-2',
      data: () => ({
        studyId: 'romans',
        date: '2026-09-08',
        title: 'Suffering',
        sections: [],
        published: false,
      }),
    });

    const cb = vi.fn();
    subscribeStudyMeetings(fakeDb, 'romans', cb);

    expect(cb).toHaveBeenCalledWith([
      expect.objectContaining({
        id: 'meeting-2',
        title: 'Suffering',
        published: false,
      }),
    ]);
  });

  it('subscribeMeeting maps existing doc or null', () => {
    mockDocData = {
      studyId: 'romans',
      date: '2026-09-01',
      title: 'Doc Meeting',
      sections: [],
      published: true,
    };

    const cb = vi.fn();
    subscribeMeeting(fakeDb, 'meeting-1', cb);
    expect(cb).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Doc Meeting',
      }),
    );

    mockDocExists = false;
    const cb2 = vi.fn();
    subscribeMeeting(fakeDb, 'meeting-none', cb2);
    expect(cb2).toHaveBeenCalledWith(null);
  });

  it('saveMeeting handles new meeting creation and existing updates', async () => {
    const id = await saveMeeting(
      fakeDb,
      {
        studyId: 'romans',
        date: '2026-09-01',
        title: 'New Study',
        sections: [],
        published: true,
      },
      'u123',
    );

    expect(id).toBe('romans-2026-09-01');

    const idWithExisting = await saveMeeting(fakeDb, {
      id: 'custom-id',
      studyId: 'romans',
      date: '2026-09-01',
      title: 'Existing',
      sections: [],
      published: false,
    });

    expect(idWithExisting).toBe('custom-id');
  });

  it('setMeetingPublished and deleteMeeting call firestore methods', async () => {
    await setMeetingPublished(fakeDb, 'm1', true);
    await deleteMeeting(fakeDb, 'm1');
  });
});
