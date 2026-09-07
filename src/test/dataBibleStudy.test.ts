import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  subscribePublishedStudyMeetings,
  subscribeStudyMeetings,
  subscribeMeeting,
  subscribeStudy,
  subscribeEntryPoint,
  saveMeeting,
  setMeetingPublished,
  deleteMeeting,
  createStudy,
  createEntryPoint,
  setActiveStudy,
} from '../lib/data/bibleStudy';
import { setDoc, updateDoc } from 'firebase/firestore';
import type { Section, Meeting } from '../lib/bibleStudy';

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
        // Legacy documents may still carry the removed field (issue #858).
        siblingId: 'romans-wk2',
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
    // A legacy document that still carries the removed siblingId field maps
    // cleanly — the field is dropped, not rejected (issue #858).
    const mapped = cb.mock.calls[0]?.[0] as Meeting[] | undefined;
    expect(mapped).toHaveLength(1);
    expect('siblingId' in mapped![0]).toBe(false);
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
    const emptySections: Section[] = [];
    const id = await saveMeeting(
      fakeDb,
      {
        studyId: 'romans',
        date: '2026-09-01',
        title: 'New Study',
        sections: emptySections,
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
      sections: emptySections,
      published: false,
    });

    expect(idWithExisting).toBe('custom-id');
  });

  it('subscribeStudy maps the study doc or null', () => {
    mockDocData = { title: 'Romans', term: 'Fall 2026' };
    const cb = vi.fn();
    subscribeStudy(fakeDb, 'romans-fall26', cb);
    expect(cb).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'romans-fall26', title: 'Romans', term: 'Fall 2026' }),
    );

    mockDocExists = false;
    const cb2 = vi.fn();
    subscribeStudy(fakeDb, 'missing', cb2);
    expect(cb2).toHaveBeenCalledWith(null);
  });

  it('subscribeEntryPoint maps the entry point doc or null', () => {
    mockDocData = { slug: 'cisa-wednesday', name: 'Wednesday Bible Study', activeStudyId: 'romans-fall26' };
    const cb = vi.fn();
    subscribeEntryPoint(fakeDb, 'cisa-wednesday', cb);
    expect(cb).toHaveBeenCalledWith(
      expect.objectContaining({ slug: 'cisa-wednesday', name: 'Wednesday Bible Study', activeStudyId: 'romans-fall26' }),
    );

    // An entry point parked between terms carries no active Study.
    mockDocData = { slug: 'cisa-wednesday', name: 'Wednesday Bible Study' };
    const cb2 = vi.fn();
    subscribeEntryPoint(fakeDb, 'cisa-wednesday', cb2);
    expect(cb2).toHaveBeenCalledWith(expect.objectContaining({ activeStudyId: null }));

    mockDocExists = false;
    const cb3 = vi.fn();
    subscribeEntryPoint(fakeDb, 'missing', cb3);
    expect(cb3).toHaveBeenCalledWith(null);
  });

  it('setMeetingPublished and deleteMeeting call firestore methods', async () => {
    await setMeetingPublished(fakeDb, 'm1', true);
    await deleteMeeting(fakeDb, 'm1');
  });

  // ── Starting a study or a term (issue #822) ─────────────────────────────
  // These writes had no caller: the Study and Entry point could only be made
  // by a seed script holding a service-account key.

  it('createStudy writes only the keys the rules allow — no id field', async () => {
    const id = await createStudy(
      fakeDb,
      { id: 'romans-fall-2026', title: 'Romans', term: 'Fall 2026' },
      'u-admin-1',
    );

    expect(id).toBe('romans-fall-2026');
    const [ref, data] = vi.mocked(setDoc).mock.calls[0];
    expect((ref as any).path).toBe('bible_study_studies/romans-fall-2026');
    // firestore.rules isValidStudy uses hasOnly — an `id` field is rejected.
    expect(Object.keys(data as object).sort()).toEqual([
      'createdAt',
      'createdBy',
      'term',
      'title',
      'updatedAt',
    ]);
    expect(data).toMatchObject({ title: 'Romans', term: 'Fall 2026', createdBy: 'u-admin-1' });
  });

  it('createEntryPoint writes the slug as both the document id and the field', async () => {
    const slug = await createEntryPoint(
      fakeDb,
      { slug: 'cisa-wednesday', name: 'Wednesday Bible Study', activeStudyId: 'romans-fall-2026' },
      'u-admin-1',
    );

    expect(slug).toBe('cisa-wednesday');
    const [ref, data] = vi.mocked(setDoc).mock.calls[0];
    // Rule EP4: the field and the document id must agree.
    expect((ref as any).path).toBe('bible_study_entry_points/cisa-wednesday');
    expect(data).toMatchObject({
      slug: 'cisa-wednesday',
      name: 'Wednesday Bible Study',
      activeStudyId: 'romans-fall-2026',
    });
  });

  it('setActiveStudy repoints an existing code, and can park it between terms', async () => {
    await setActiveStudy(fakeDb, 'cisa-wednesday', 'acts-spring-2027');
    let [ref, data] = vi.mocked(updateDoc).mock.calls[0];
    expect((ref as any).path).toBe('bible_study_entry_points/cisa-wednesday');
    expect(data).toMatchObject({ activeStudyId: 'acts-spring-2027' });
    // The slug is untouched — that is the whole point of the durable code.
    expect(Object.keys(data as object)).not.toContain('slug');

    vi.mocked(updateDoc).mockClear();
    await setActiveStudy(fakeDb, 'cisa-wednesday', null);
    [, data] = vi.mocked(updateDoc).mock.calls[0];
    expect(data).toMatchObject({ activeStudyId: null });
  });
});
