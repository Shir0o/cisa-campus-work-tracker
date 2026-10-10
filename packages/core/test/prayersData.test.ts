import { describe, it, expect, vi, beforeEach } from 'vitest';

const firestoreMock = vi.hoisted(() => ({
  collection: vi.fn(),
  addDoc: vi.fn(),
  doc: vi.fn(),
  updateDoc: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  onSnapshot: vi.fn(),
}));

vi.mock('firebase/firestore', () => firestoreMock);

import { addPrayer } from '../src/data/prayers';

const COLLECTION = { __collection: 'prayers' };
const by = { uid: 'u1', name: 'Mei Tanaka' };

beforeEach(() => {
  vi.clearAllMocks();
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
