// Creating a week must never write over one that is already stored. The index
// hands `createMeeting` whatever list it currently holds, and that list can be
// stale or still empty (cold cache, a stale tab, a week prepared on another
// device). The date-derived id must not be trusted on its own: the write
// claims the date in a transaction and moves to the next free week instead of
// merging into the week already sitting there.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Meeting } from '../lib/bibleStudy';

const store = new Map<string, Record<string, unknown>>();

vi.mock('../lib/firebase', () => ({ db: {} }));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db, name) => ({ path: name })),
  doc: vi.fn((_db, name, id) => ({ path: `${name}/${id}`, id })),
  query: vi.fn((...args) => ({ args })),
  where: vi.fn(() => ({})),
  orderBy: vi.fn(() => ({})),
  onSnapshot: vi.fn(() => vi.fn()),
  setDoc: vi.fn(async (ref: { path: string }, data: Record<string, unknown>, opts?: { merge?: boolean }) => {
    if (opts?.merge) store.set(ref.path, { ...(store.get(ref.path) ?? {}), ...data });
    else store.set(ref.path, data);
  }),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  getDocs: vi.fn(),
  serverTimestamp: vi.fn(() => 'server-timestamp'),
  runTransaction: vi.fn(async (_db, fn) =>
    fn({
      get: async (ref: { path: string }) => ({
        exists: () => store.has(ref.path),
        data: () => store.get(ref.path),
      }),
      set: (ref: { path: string }, data: Record<string, unknown>) => {
        store.set(ref.path, data);
      },
    }),
  ),
}));

const { createMeeting } = await import('../lib/data/bibleStudy');
const db = {} as any;

const MEETING_PATH = 'bible_study_meetings';

function stubMeeting(over: Partial<Meeting> & { date: string }): Meeting {
  return {
    id: `romans-${over.date}`,
    studyId: 'romans',
    title: 'A week',
    sections: [],
    published: true,
    md: 'precious words',
    ...over,
  };
}

describe('createMeeting', () => {
  beforeEach(() => {
    store.clear();
    vi.clearAllMocks();
  });

  it('starts the first week on the next Wednesday with created stamps', async () => {
    const week = await createMeeting(
      db,
      { studyId: 'romans', title: '', sections: [], md: '## This week' },
      [],
      '2026-11-01', // Sunday
      'u-admin-1',
    );

    expect(week.date).toBe('2026-11-04');
    expect(week.id).toBe('romans-2026-11-04');
    expect(week.published).toBe(false);
    expect(store.get(`${MEETING_PATH}/romans-2026-11-04`)).toMatchObject({
      studyId: 'romans',
      date: '2026-11-04',
      title: '',
      published: false,
      md: '## This week',
      createdAt: 'server-timestamp',
      createdBy: 'u-admin-1',
    });
  });

  it('never overwrites the week already sitting on the computed date', async () => {
    // The list handed in is empty — a cold cache, a stale tab, or a week
    // prepared on another device — while the store already holds the upcoming
    // week. This is the reported "new week replaces the last bible study".
    const existing = stubMeeting({ date: '2026-11-04' });
    store.set(`${MEETING_PATH}/romans-2026-11-04`, existing);

    const week = await createMeeting(
      db,
      { studyId: 'romans', title: '', sections: [], md: '## This week' },
      [],
      '2026-11-01',
      'u-admin-1',
    );

    expect(week.date).toBe('2026-11-11');
    expect(store.get(`${MEETING_PATH}/romans-2026-11-04`)).toEqual(existing);
    expect(store.get(`${MEETING_PATH}/romans-2026-11-11`)).toMatchObject({
      studyId: 'romans',
      date: '2026-11-11',
      md: '## This week',
    });
  });

  it('skips a whole run of weeks already taken after the known list', async () => {
    const nov4 = stubMeeting({ date: '2026-11-04' });
    const nov11 = stubMeeting({ date: '2026-11-11', title: 'Next one' });
    store.set(`${MEETING_PATH}/romans-2026-11-04`, nov4);
    store.set(`${MEETING_PATH}/romans-2026-11-11`, nov11);

    const week = await createMeeting(
      db,
      { studyId: 'romans', title: 'Week after', sections: [], md: '## Later' },
      [stubMeeting({ date: '2026-10-28', id: 'romans-2026-10-28' })],
      '2026-11-01',
      'u-admin-1',
    );

    expect(week.date).toBe('2026-11-18');
    expect(store.get(`${MEETING_PATH}/romans-2026-11-04`)).toEqual(nov4);
    expect(store.get(`${MEETING_PATH}/romans-2026-11-11`)).toEqual(nov11);
    expect(store.get(`${MEETING_PATH}/romans-2026-11-18`)).toMatchObject({ md: '## Later' });
  });
});
