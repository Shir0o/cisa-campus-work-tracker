import { beforeEach, describe, expect, it, vi } from 'vitest';
import { confirmAttendanceImport, discardPendingAttendanceImport, subscribePendingAttendanceImports } from '../lib/sync/attdSync';
import type { Contact, Gathering, Rhythm } from '../types';
import type { PendingAttendanceImport } from '../lib/sync/attdCorrelator';

const hoisted = vi.hoisted(() => {
  let seq = 0;
  const batch = {
    set: vi.fn(),
    update: vi.fn(),
    commit: vi.fn().mockResolvedValue(undefined),
  };
  return {
    batch,
    nextId: () => `generated-${++seq}`,
    mockUpdateDoc: vi.fn().mockResolvedValue(undefined),
    mockOnSnapshot: vi.fn((_query: unknown, callback: (snap: unknown) => void) => {
      callback({ docs: [] });
      return vi.fn();
    }),
  };
});

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db: unknown, path: string) => ({ path })),
  doc: vi.fn((first: unknown, second?: unknown, id?: string) => {
    if (typeof second === 'string') return { path: second, id: id ?? `${second}-generated` };
    if (typeof first === 'string') return { path: first, id: id ?? `${first}-generated` };
    const ref = (second as { path?: string } | undefined) ?? (first as { path?: string });
    return { path: ref.path ?? 'collection', id: hoisted.nextId() };
  }),
  writeBatch: vi.fn(() => hoisted.batch),
  updateDoc: hoisted.mockUpdateDoc,
  onSnapshot: hoisted.mockOnSnapshot,
  query: vi.fn((...args: unknown[]) => ({ args })),
  orderBy: vi.fn((...args: unknown[]) => ({ args })),
  where: vi.fn((...args: unknown[]) => ({ args })),
}));

vi.mock('../lib/firebase', () => ({
  db: {},
  handleFirestoreError: vi.fn(),
  OperationType: { UPDATE: 'UPDATE' },
}));

const contact = (id: string, name: string): Contact => ({
  id,
  name,
  role: 'Student',
  location: '',
  email: '',
  phone: '',
  stage: 'Lead',
  lastSeen: '',
  initials: name,
});

const study: Rhythm = {
  id: 'r1',
  name: 'Wednesday Bible Study',
  cadence: { type: 'weekly', days: [3] },
  roster: [],
  termStart: '2026-09-01',
  termEnd: '2026-12-31',
  createdAt: '2026-09-01T00:00:00.000Z',
  createdById: 'u1',
};

const week: Gathering = {
  id: 'g1',
  name: 'Wednesday Bible Study',
  date: '2026-09-16',
  order: 0,
  rhythmId: 'r1',
  createdAt: '2026-09-01T00:00:00.000Z',
  attendance: { present: ['c2'], absent: [] },
};

const pending: PendingAttendanceImport = {
  id: 'import-1',
  attdEventId: 'event-1',
  eventName: 'Wednesday Bible Study',
  frequency: 'Weekly',
  repeatingDays: ['Wednesday'],
  sessionDate: '2026-09-16',
  records: [],
  preview: {
    attdEventId: 'event-1',
    eventName: 'Wednesday Bible Study',
    sessionDate: '2026-09-16',
    rhythmId: 'r1',
    rhythmName: 'Wednesday Bible Study',
    gatheringId: 'g1',
    gatheringName: 'Wednesday Bible Study',
    matchSource: 'cadence',
    attendees: [],
    conflicts: [],
    stats: { total: 0, present: 0, late: 0, absent: 0, matched: 0, walkIns: 0, conflicts: 0 },
  },
  status: 'pending',
};

describe('attdSync', () => {
  beforeEach(() => {
    hoisted.batch.set.mockClear();
    hoisted.batch.update.mockClear();
    hoisted.batch.commit.mockClear();
    hoisted.mockUpdateDoc.mockClear();
    hoisted.mockOnSnapshot.mockClear();
  });

  it('commits marks, aliases, mapping, and import status in one batch', async () => {
    await confirmAttendanceImport({
      importId: 'import-1',
      preview: pending.preview,
      decisions: [
        { rowIndex: 0, memberId: 'm1', attdName: 'Alex Chen', status: 'present', isLate: false, contactId: 'c1', contactName: 'Alex Chen', keepCisa: false },
        { rowIndex: 1, memberId: null, attdName: 'New Person', status: 'late', isLate: true, contactId: null, contactName: null, keepCisa: false },
      ],
      contacts: [contact('c1', 'Alex Chen')],
      rhythms: [study],
      gatherings: [week],
      targetRhythmId: 'r1',
      targetGatheringId: 'g1',
      createGathering: false,
      userId: 'u-admin',
      userName: 'Admin',
    });

    expect(hoisted.batch.commit).toHaveBeenCalledTimes(1);
    const eventUpdate = hoisted.batch.update.mock.calls.find((call) => call[0].path === 'events') as [any, any] | undefined;
    expect(eventUpdate).toBeDefined();
    if (eventUpdate) {
      expect(eventUpdate[1].attendance.present).toContain('c1');
      expect(eventUpdate[1].attendance.present.length).toBe(3);
    }
    const contactUpdates = hoisted.batch.update.mock.calls.filter((call) => call[0].path === 'contacts');
    expect(contactUpdates).toHaveLength(1);
    expect(contactUpdates[0][1].attendance).toEqual({ g1: true });
    const aliasWrites = hoisted.batch.set.mock.calls.filter((call) => call[0].path === 'attendee_aliases');
    expect(aliasWrites).toHaveLength(2);
    const mappingWrites = hoisted.batch.set.mock.calls.filter((call) => call[0].path === 'integrations_attd_event_mappings');
    expect(mappingWrites).toHaveLength(1);
    const importUpdates = hoisted.batch.update.mock.calls.filter((call) => call[0].path === 'pending_attendance_imports');
    expect(importUpdates).toHaveLength(1);
    expect(importUpdates[0][1].status).toBe('confirmed');
  });

  // #1024 phase 4: a walk-in contact created here carries `createdBy` as its
  // only tie, so it must carry the derived `visibleTo` in the same write --
  // otherwise the rules hide the new person from the reviewer who just made
  // them.
  it('stamps visibleTo on the walk-in contacts it creates', async () => {
    await confirmAttendanceImport({
      importId: 'import-1',
      preview: pending.preview,
      decisions: [
        { rowIndex: 0, memberId: null, attdName: 'New Person', status: 'present', isLate: false, contactId: null, contactName: null, keepCisa: false },
      ],
      contacts: [],
      rhythms: [study],
      gatherings: [week],
      targetRhythmId: 'r1',
      targetGatheringId: 'g1',
      createGathering: false,
      userId: 'u-admin',
      userName: 'Admin',
    });

    const contactSets = hoisted.batch.set.mock.calls.filter((call) => call[0].path === 'contacts');
    expect(contactSets).toHaveLength(1);
    expect(contactSets[0][1].createdBy).toBe('u-admin');
    expect(contactSets[0][1].visibleTo).toEqual(['u-admin']);
  });

  it('creates a new occasion when the reviewer asks for one', async () => {
    await confirmAttendanceImport({
      importId: 'import-1',
      preview: pending.preview,
      decisions: [],
      contacts: [],
      rhythms: [study],
      gatherings: [],
      targetRhythmId: 'r1',
      targetGatheringId: null,
      createGathering: true,
      userId: 'u-admin',
      userName: 'Admin',
    });
    const eventSets = hoisted.batch.set.mock.calls.filter((call) => call[0].path === 'events');
    expect(eventSets).toHaveLength(1);
    expect(eventSets[0][1].rhythmId).toBe('r1');
    expect(eventSets[0][1].date).toBe('2026-09-16');
  });

  it('discards a pending import', async () => {
    await discardPendingAttendanceImport('import-1');
    expect(hoisted.mockUpdateDoc).toHaveBeenCalledTimes(1);
    const call = hoisted.mockUpdateDoc.mock.calls[0];
    expect(call[0].path).toBe('pending_attendance_imports');
    expect(call[1].status).toBe('discarded');
  });

  it('emits pending imports from the subscription', () => {
    const cb = vi.fn();
    hoisted.mockOnSnapshot.mockImplementationOnce((_query, callback) => {
      callback({ docs: [{ id: 'import-2', data: () => ({ ...pending, id: undefined }) }] });
      return vi.fn();
    });
    subscribePendingAttendanceImports(cb);
    expect(cb).toHaveBeenCalledWith([expect.objectContaining({ id: 'import-2', status: 'pending' })]);
  });
  it('refuses to confirm without a gathering target', async () => {
    await expect(
      confirmAttendanceImport({
        importId: 'import-1',
        preview: pending.preview,
        decisions: [],
        contacts: [],
        rhythms: [study],
        gatherings: [],
        targetRhythmId: 'r1',
        targetGatheringId: null,
        createGathering: false,
        userId: 'u-admin',
        userName: 'Admin',
      }),
    ).rejects.toThrow('Choose a Gathering or create one.');
  });

});
