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
const batch = vi.hoisted(() => ({ update: vi.fn(), commit: vi.fn() }));

vi.mock('firebase/firestore', () => firestoreMock);

import { addPrayer, setPrayerTeamPrayer } from '../src/data/prayers';

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

describe('setPrayerTeamPrayer (packages/core)', () => {
  beforeEach(() => {
    firestoreMock.doc.mockImplementation((_db: unknown, ...parts: string[]) => ({ path: parts.join('/') }));
    batch.update.mockClear();
    batch.commit.mockClear();
    batch.commit.mockResolvedValue(undefined);
  });

  it('brings a burden to the team and clears the contact removal flag in the same batch', async () => {
    await setPrayerTeamPrayer({} as never, 'p1', 'c1', true, by);
    const [prayerRef, prayerData] = batch.update.mock.calls[0];
    expect(prayerRef).toEqual({ path: 'prayers/p1' });
    expect(prayerData).toMatchObject({ teamPrayer: true, updatedBy: 'u1', updatedByName: 'Mei Tanaka' });
    const [contactRef, contactData] = batch.update.mock.calls[1];
    expect(contactRef).toEqual({ path: 'contacts/c1' });
    expect(contactData).toMatchObject({ prayerListRemoved: REMOVED, updatedBy: 'u1', updatedByName: 'Mei Tanaka' });
    expect(batch.commit).toHaveBeenCalledTimes(1);
  });

  // An absent flag reads as the team's, so taking it off must write false;
  // the contact is left alone.
  it('writes an explicit teamPrayer: false and leaves the contact untouched', async () => {
    await setPrayerTeamPrayer({} as never, 'p1', 'c1', false, by);
    expect(batch.update).toHaveBeenCalledTimes(1);
    expect(batch.update.mock.calls[0][0]).toEqual({ path: 'prayers/p1' });
    expect(batch.update.mock.calls[0][1].teamPrayer).toBe(false);
  });
});
