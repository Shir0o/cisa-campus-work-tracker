import { describe, it, expect, vi, beforeEach } from 'vitest';

const firestoreMock = vi.hoisted(() => ({
  collection: vi.fn(),
  addDoc: vi.fn(),
  serverTimestamp: vi.fn(() => ({ __serverTimestamp: true })),
  doc: vi.fn(),
  updateDoc: vi.fn(),
  arrayUnion: vi.fn((...args: unknown[]) => ({ __op: 'arrayUnion', args })),
  arrayRemove: vi.fn((...args: unknown[]) => ({ __op: 'arrayRemove', args })),
}));

vi.mock('firebase/firestore', () => firestoreMock);

import { addContact, removeContactCollaborator, setContactCarer, type NewContactInput } from '../src/data/contacts';
import { applyPartners } from '../src/data/partners';

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
  firestoreMock.doc.mockReturnValue({ __doc: 'contacts/c1' });
  firestoreMock.updateDoc.mockResolvedValue(undefined);
});

describe('addContact — creator stamp', () => {
  it('stamps the actor as creator when by.uid is provided', async () => {
    await addContact(
      {} as never,
      baseInput,
      { uid: 'staff-1', name: 'Staff One' },
    );

    const written = firestoreMock.addDoc.mock.calls[0][1] as Record<string, unknown>;
    expect(written.owner).toBeUndefined();
    expect(written.createdBy).toBe('staff-1');
    expect(written.createdByName).toBe('Staff One');
  });

  it('stamps creator as null when no actor uid is given (anon intake)', async () => {
    await addContact(
      {} as never,
      baseInput,
      { uid: null, name: null },
    );

    const written = firestoreMock.addDoc.mock.calls[0][1] as Record<string, unknown>;
    expect(written.owner).toBeUndefined();
    expect(written.createdBy).toBeNull();
  });

  it('does not write an owner field when the caller omitted the by field entirely', async () => {
    await addContact({} as never, baseInput);

    const written = firestoreMock.addDoc.mock.calls[0][1] as Record<string, unknown>;
    expect(written.owner).toBeUndefined();
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

describe('addContact — founding set (#1049)', () => {
  it('stamps the creator plus every live pairing member as founders, and folds them into visibleTo', async () => {
    applyPartners([{ id: 'p1', members: ['staff-1', 'staff-2'], startDate: '2026-08-01' }], new Date(2026, 8, 1));
    await addContact(
      {} as never,
      baseInput,
      { uid: 'staff-1', name: 'Staff One' },
    );

    const written = firestoreMock.addDoc.mock.calls[0][1] as Record<string, unknown>;
    expect(written.founders).toEqual(['staff-1', 'staff-2']);
    expect(written.visibleTo).toContain('staff-1');
    expect(written.visibleTo).toContain('staff-2');
    applyPartners([]);
  });

  it('stamps only the creator as founder when there is no live pairing', async () => {
    applyPartners([]);
    await addContact(
      {} as never,
      baseInput,
      { uid: 'staff-1', name: 'Staff One' },
    );

    const written = firestoreMock.addDoc.mock.calls[0][1] as Record<string, unknown>;
    expect(written.founders).toEqual(['staff-1']);
    expect(written.visibleTo).toEqual(['staff-1']);
  });
});

describe('setContactCarer (#1051)', () => {
  const contact = {
    id: 'c1',
    createdBy: 'u1',
    coCreators: ['u2'],
    founders: ['u1'],
    carers: ['u3'],
  };

  it('records the reader as a carer when they take the person on', async () => {
    await setContactCarer({} as never, contact, 'u4', true);

    expect(firestoreMock.updateDoc).toHaveBeenCalledWith(
      { __doc: 'contacts/c1' },
      {
        carers: { __op: 'arrayUnion', args: ['u4'] },
        visibleTo: ['u1', 'u2', 'u3', 'u4'],
      },
    );
  });

  it('removes the reader from carers when they give the person up', async () => {
    await setContactCarer({} as never, contact, 'u3', false);

    expect(firestoreMock.updateDoc).toHaveBeenCalledWith(
      { __doc: 'contacts/c1' },
      {
        carers: { __op: 'arrayRemove', args: ['u3'] },
        visibleTo: ['u1', 'u2'],
      },
    );
  });

  it('leaves a reader in the access list when another tie still holds them', async () => {
    const withOtherTie = { ...contact, coCreators: ['u2', 'u3'], carers: ['u3'] };
    await setContactCarer({} as never, withOtherTie, 'u3', false);

    expect(firestoreMock.updateDoc).toHaveBeenCalledWith(
      { __doc: 'contacts/c1' },
      {
        carers: { __op: 'arrayRemove', args: ['u3'] },
        visibleTo: ['u1', 'u2', 'u3'],
      },
    );
  });

  it('taking on twice is idempotent for the access list', async () => {
    const already = { ...contact, carers: ['u3', 'u4'] };
    await setContactCarer({} as never, already, 'u4', true);

    expect(firestoreMock.updateDoc).toHaveBeenCalledWith(
      { __doc: 'contacts/c1' },
      {
        carers: { __op: 'arrayUnion', args: ['u4'] },
        visibleTo: ['u1', 'u2', 'u3', 'u4'],
      },
    );
  });
});

describe('removeContactCollaborator (#1052)', () => {
  it('drops the removed collaborator from carers and the access list in the same write', async () => {
    const contact = {
      id: 'c1',
      createdBy: 'u1',
      coCreators: ['u2', 'u3'],
      founders: ['u1'],
      carers: ['u3'],
    };
    await removeContactCollaborator({} as never, contact, 'u3');

    expect(firestoreMock.updateDoc).toHaveBeenCalledWith(
      { __doc: 'contacts/c1' },
      {
        coCreators: { __op: 'arrayRemove', args: ['u3'] },
        carers: { __op: 'arrayRemove', args: ['u3'] },
        visibleTo: ['u1', 'u2'],
        updatedAt: expect.any(String),
        updatedBy: null,
        updatedByName: null,
      },
    );
  });

  it('keeps a founder-carer tie — founding is permanent — and never touches carers', async () => {
    const contact = {
      id: 'c1',
      createdBy: 'u1',
      coCreators: ['u2', 'u3'],
      founders: ['u3'],
      carers: ['u3'],
    };
    await removeContactCollaborator({} as never, contact, 'u3');

    expect(firestoreMock.updateDoc).toHaveBeenCalledWith(
      { __doc: 'contacts/c1' },
      expect.objectContaining({
        coCreators: { __op: 'arrayRemove', args: ['u3'] },
        visibleTo: ['u1', 'u2', 'u3'],
      }),
    );
    const patch = firestoreMock.updateDoc.mock.calls[0][1] as Record<string, unknown>;
    expect(patch.carers).toBeUndefined();
  });

  it('leaves a carer who is not the removed collaborator untouched', async () => {
    const contact = {
      id: 'c1',
      createdBy: 'u1',
      coCreators: ['u2', 'u3'],
      founders: ['u1'],
      carers: ['u3', 'u4'],
    };
    await removeContactCollaborator({} as never, contact, 'u3');

    expect(firestoreMock.updateDoc).toHaveBeenCalledWith(
      { __doc: 'contacts/c1' },
      {
        coCreators: { __op: 'arrayRemove', args: ['u3'] },
        carers: { __op: 'arrayRemove', args: ['u3'] },
        visibleTo: ['u1', 'u2', 'u4'],
        updatedAt: expect.any(String),
        updatedBy: null,
        updatedByName: null,
      },
    );
  });

  it('does not touch carers when the removed collaborator never took the person on', async () => {
    const contact = {
      id: 'c1',
      createdBy: 'u1',
      coCreators: ['u2', 'u3'],
      founders: ['u1'],
      carers: ['u4'],
    };
    await removeContactCollaborator({} as never, contact, 'u3');

    const patch = firestoreMock.updateDoc.mock.calls[0][1] as Record<string, unknown>;
    expect(patch.carers).toBeUndefined();
    expect(patch.visibleTo).toEqual(['u1', 'u2', 'u4']);
  });
});