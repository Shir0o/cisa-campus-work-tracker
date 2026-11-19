import { describe, it, expect, vi, beforeEach } from 'vitest';

const firestoreMock = vi.hoisted(() => ({
  collection: vi.fn(),
  addDoc: vi.fn(),
  doc: vi.fn(),
  updateDoc: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  onSnapshot: vi.fn(),
  writeBatch: vi.fn(),
  deleteField: vi.fn(),
}));
const REMOVED = { __deleteField: true };
const batch = vi.hoisted(() => ({ set: vi.fn(), update: vi.fn(), commit: vi.fn() }));

vi.mock('firebase/firestore', () => firestoreMock);

import { addPrayer, addTeamPrayer, setTeamPrayer } from '../src/data/prayers';

const COLLECTION = { __collection: 'prayers' };
const by = { uid: 'u1', name: 'Mei Tanaka' };

beforeEach(() => {
  vi.clearAllMocks();
  firestoreMock.writeBatch.mockReturnValue(batch);
  firestoreMock.deleteField.mockReturnValue(REMOVED);
  firestoreMock.collection.mockReturnValue(COLLECTION);
  firestoreMock.addDoc.mockResolvedValue({ id: 'p-new' });
});

describe('addPrayer (packages/core)', () => {
  it('writes teamPrayer: true when the caller asks for the team page', async () => {
    await addPrayer({} as never, { contactId: 'c1', burden: ' Peace ', teamPrayer: true }, by);
    expect(firestoreMock.collection).toHaveBeenCalledWith({}, 'prayers');
    const [ref, data] = firestoreMock.addDoc.mock.calls[0];
    expect(ref).toBe(COLLECTION);
    expect(data).toMatchObject({ contactId: 'c1', burden: 'Peace', status: 'pending', teamPrayer: true });
  });

  it('writes teamPrayer: false when the caller keeps it off the team page', async () => {
    await addPrayer({} as never, { contactId: 'c1', burden: 'Peace', teamPrayer: false }, by);
    expect(firestoreMock.addDoc.mock.calls[0][1]).toMatchObject({ teamPrayer: false });
  });

  // `prayerPage: true` means "written on the prayer page". Neither caller of
  // this helper (the log sheet, the contact Pray sheet) is that page.
  it('does not stamp prayerPage', async () => {
    await addPrayer({} as never, { contactId: 'c1', burden: 'Peace', teamPrayer: true }, by);
    expect(firestoreMock.addDoc.mock.calls[0][1]).not.toHaveProperty('prayerPage');
  });
});

describe('addTeamPrayer (packages/core)', () => {
  beforeEach(() => {
    firestoreMock.doc.mockImplementation((_db: unknown, ...parts: string[]) => ({ path: parts.join('/') }));
  });

  // Fix round 1: the log sheet's "Bring it to team prayer" makes the burden and
  // the person's flag one write — a failure writes neither.
  it('writes the prayer and the person’s team flag in one batch', async () => {
    await addTeamPrayer({} as never, { contactId: 'c1', burden: ' Peace ' }, by);

    expect(firestoreMock.writeBatch).toHaveBeenCalledTimes(1);
    expect(firestoreMock.addDoc).not.toHaveBeenCalled();
    expect(firestoreMock.updateDoc).not.toHaveBeenCalled();

    const [, wrote] = batch.set.mock.calls[0];
    expect(wrote).toMatchObject({
      contactId: 'c1',
      burden: 'Peace',
      status: 'pending',
      teamPrayer: true,
    });

    const [contactRef, patch] = batch.update.mock.calls[0];
    expect(contactRef).toEqual({ path: 'contacts/c1' });
    expect(patch).toMatchObject({
      teamPrayer: true,
      prayerListRemoved: REMOVED,
      updatedBy: 'u1',
      updatedByName: 'Mei Tanaka',
    });

    expect(batch.commit).toHaveBeenCalledTimes(1);
  });
});

describe('setTeamPrayer (packages/core)', () => {
  beforeEach(() => {
    firestoreMock.doc.mockImplementation((_db: unknown, ...parts: string[]) => ({ path: parts.join('/') }));
  });

  it('puts the person on team prayer and clears the team removal in one write', async () => {
    await setTeamPrayer({} as never, 'c1', true, by);
    const [ref, data] = firestoreMock.updateDoc.mock.calls[0];
    expect(ref).toEqual({ path: 'contacts/c1' });
    expect(data).toMatchObject({
      teamPrayer: true,
      prayerListRemoved: REMOVED,
      updatedBy: 'u1',
      updatedByName: 'Mei Tanaka',
    });
  });

  it('takes the person off without touching the team removal', async () => {
    await setTeamPrayer({} as never, 'c1', false, by);
    const [, data] = firestoreMock.updateDoc.mock.calls[0];
    expect(data).toMatchObject({ teamPrayer: false, updatedBy: 'u1' });
    expect(data).not.toHaveProperty('prayerListRemoved');
  });
});
