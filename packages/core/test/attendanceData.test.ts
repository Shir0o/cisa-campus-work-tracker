import { describe, it, expect, vi, beforeEach } from 'vitest';

const firestoreMock = vi.hoisted(() => ({
  doc: vi.fn((_db: unknown, path: string, id: string) => ({ path, id })),
  writeBatch: vi.fn(),
}));

vi.mock('firebase/firestore', () => firestoreMock);

import { setGatheringAttendance } from '../src/data/attendance';
import type { Contact, Gathering } from '../src/types';

const gathering = (over: Partial<Gathering> = {}): Gathering => ({
  id: 'e1',
  name: 'Gathering',
  date: '2026-08-01',
  order: 0,
  createdAt: '',
  ...over,
});

const contact = (over: Partial<Contact> = {}): Contact =>
  ({ id: 'c1', name: 'Alex', initials: 'A', ...over } as Contact);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('setGatheringAttendance (packages/core)', () => {
  it('removes the legacy gathering key when a mark is cleared', async () => {
    const batch = { update: vi.fn(), commit: vi.fn(() => Promise.resolve()) };
    firestoreMock.writeBatch.mockReturnValue(batch);
    const c = contact({ attendance: { e1: true, e2: 'absent' } } as Partial<Contact>);

    await setGatheringAttendance(
      {} as never,
      gathering({ attendance: { present: ['c1'], absent: [] } }),
      c,
      undefined,
      { uid: 'u1', name: 'Ana' },
      '2026-08-01',
    );

    expect(batch.update).toHaveBeenCalledWith({ path: 'events', id: 'e1' }, { attendance: { present: [], absent: [] } });
    const contactCall = batch.update.mock.calls.find((call) => call[0]?.path === 'contacts');
    expect(contactCall?.[1].attendance).toEqual({ e2: 'absent' });
  });

  it('mirrors a present mark into the legacy map', async () => {
    const batch = { update: vi.fn(), commit: vi.fn(() => Promise.resolve()) };
    firestoreMock.writeBatch.mockReturnValue(batch);
    const c = contact({ attendance: { e1: true } } as Partial<Contact>);

    await setGatheringAttendance({} as never, gathering(), c, 'absent', { uid: 'u1', name: 'Ana' }, '2026-08-01');

    expect(batch.update).toHaveBeenCalledWith({ path: 'events', id: 'e1' }, { attendance: { present: [], absent: ['c1'] } });
    const contactCall = batch.update.mock.calls.find((call) => call[0]?.path === 'contacts');
    expect(contactCall?.[1].attendance).toEqual({ e1: 'absent' });
  });
});
