import { describe, it, expect, vi, beforeEach } from 'vitest';

const firestoreMock = vi.hoisted(() => ({
  collection: vi.fn(),
  addDoc: vi.fn(),
  serverTimestamp: vi.fn(() => ({ __serverTimestamp: true })),
}));

vi.mock('firebase/firestore', () => firestoreMock);

import { addContact, type NewContactInput } from '../src/data/contacts';

const DOC_REF = { id: 'c-new' };

const baseInput: NewContactInput = {
  name: 'Alex',
  role: '',
  location: '',
  email: '',
  phone: '',
  stage: 'Contact',
  tags: [],
  notes: '',
  spiritualBackground: '',
  initials: 'A',
};

beforeEach(() => {
  vi.clearAllMocks();
  firestoreMock.collection.mockReturnValue({ __collection: 'contacts' });
  firestoreMock.addDoc.mockResolvedValue(DOC_REF);
});

describe('addContact — owner stamp', () => {
  it('stamps the actor as owner when by.uid is provided', async () => {
    await addContact(
      {} as never,
      baseInput,
      { uid: 'staff-1', name: 'Staff One' },
    );

    const written = firestoreMock.addDoc.mock.calls[0][1] as Record<string, unknown>;
    expect(written.owner).toBe('staff-1');
    expect(written.createdBy).toBe('staff-1');
    expect(written.createdByName).toBe('Staff One');
  });

  it('stamps owner as null when no actor uid is given (anon intake)', async () => {
    await addContact(
      {} as never,
      baseInput,
      { uid: null, name: null },
    );

    const written = firestoreMock.addDoc.mock.calls[0][1] as Record<string, unknown>;
    expect(written.owner).toBeNull();
    expect(written.createdBy).toBeNull();
  });

  it('does not invent an owner when the caller omitted the by field entirely', async () => {
    await addContact({} as never, baseInput);

    const written = firestoreMock.addDoc.mock.calls[0][1] as Record<string, unknown>;
    // Undefined values are stripped by addContact before writing, so the key
    // either is absent or is explicitly null. Either way: not the placeholder
    // string 'undefined' and not someone else's uid.
    expect(written.owner == null || written.owner === undefined).toBe(true);
    expect(written.owner).not.toBe('undefined');
  });

  it('returns the new document id', async () => {
    const id = await addContact(
      {} as never,
      baseInput,
      { uid: 'staff-1', name: 'Staff One' },
    );
    expect(id).toBe('c-new');
  });
});