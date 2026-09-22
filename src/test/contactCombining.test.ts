import { describe, it, expect } from 'vitest';
import {
  findCandidateDuplicates,
  combineContactProfiles,
  buildCombineOps,
  chunkOps,
  type FirestoreOp,
} from '../lib/contactCombining';
import type { Contact } from '../types';

describe('findCandidateDuplicates', () => {
  it('detects duplicates by normalized email', () => {
    const contacts: Partial<Contact>[] = [
      { id: '1', name: 'John Doe', email: 'john@example.com', createdAt: '2026-01-01' },
      { id: '2', name: 'Johnny D', email: '  JOHN@EXAMPLE.COM ', createdAt: '2026-01-02' },
      { id: '3', name: 'Jane Smith', email: 'jane@example.com', createdAt: '2026-01-03' },
    ];

    const pairs = findCandidateDuplicates(contacts as Contact[]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].survivor.id).toBe('1');
    expect(pairs[0].duplicate.id).toBe('2');
    expect(pairs[0].reason).toContain('email');
  });

  it('detects duplicates by normalized phone', () => {
    const contacts: Partial<Contact>[] = [
      { id: '1', name: 'Mary', phone: '(555) 123-4567', createdAt: '2026-01-01' },
      { id: '2', name: 'Mary M', phone: '5551234567', createdAt: '2026-01-02' },
    ];

    const pairs = findCandidateDuplicates(contacts as Contact[]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].survivor.id).toBe('1');
    expect(pairs[0].duplicate.id).toBe('2');
    expect(pairs[0].reason).toContain('phone');
  });

  it('detects duplicates by exact or word-boundary full name match', () => {
    const contacts: Partial<Contact>[] = [
      { id: '1', name: 'David Lee', email: '', phone: '', createdAt: '2026-01-01' },
      { id: '2', name: 'david lee', email: '', phone: '', createdAt: '2026-01-02' },
    ];

    const pairs = findCandidateDuplicates(contacts as Contact[]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].survivor.id).toBe('1');
    expect(pairs[0].duplicate.id).toBe('2');
    expect(pairs[0].reason).toContain('name');
  });

  it('defaults the older contact as survivor', () => {
    const contacts: Partial<Contact>[] = [
      { id: 'newer', name: 'Alice', email: 'alice@test.com', createdAt: '2026-02-01' },
      { id: 'older', name: 'Alice', email: 'alice@test.com', createdAt: '2026-01-01' },
    ];

    const pairs = findCandidateDuplicates(contacts as Contact[]);
    expect(pairs[0].survivor.id).toBe('older');
    expect(pairs[0].duplicate.id).toBe('newer');
  });
});

describe('combineContactProfiles', () => {
  it('unions relationship sets and preserves survivor scalar details while backfilling missing', () => {
    const survivor: Partial<Contact> = {
      id: 'c1',
      name: 'Bob Original',
      email: 'bob@test.com',
      phone: '1234567890',
      notes: 'First note',
      tags: ['Fall 2026'],
      founders: ['u1'],
      carers: ['u1'],
      coCreators: ['u2'],
      visibleTo: ['u1', 'u2'],
      major: 'Computer Science',
    };

    const duplicate: Partial<Contact> = {
      id: 'c2',
      name: 'Bob Newer',
      email: 'bob@test.com',
      phone: '1234567890',
      notes: 'Second note from signup',
      tags: ['Saved', 'Fall 2026'],
      founders: ['u3'],
      carers: ['u4'],
      coCreators: ['u3'],
      visibleTo: ['u3', 'u4'],
      year: 'Junior',
      spiritualBackground: 'Christian',
    };

    const merged = combineContactProfiles(survivor as Contact, duplicate as Contact);

    expect(merged.name).toBe('Bob Original');
    expect(merged.major).toBe('Computer Science');
    expect(merged.year).toBe('Junior');
    expect(merged.spiritualBackground).toBe('Christian');
    expect(merged.notes).toContain('First note');
    expect(merged.notes).toContain('Second note from signup');
    expect(merged.tags).toEqual(['Fall 2026', 'Saved']);
    expect(merged.founders).toEqual(['u1', 'u3']);
    expect(merged.carers).toEqual(['u1', 'u4']);
    expect(merged.coCreators).toEqual(['u2', 'u3']);
    expect(merged.visibleTo).toEqual(['u1', 'u2', 'u3', 'u4']);
  });
});

describe('buildCombineOps', () => {
  const survivor: Contact = {
    id: 's1',
    name: 'Survivor',
    email: 's@test.com',
    phone: '',
    role: 'Student',
    stage: 'Lead',
    location: '',
    lastSeen: '',
    initials: 'S',
    createdAt: '2026-01-01T00:00:00.000Z',
  };
  const duplicate: Contact = {
    id: 'd1',
    name: 'Duplicate',
    email: 'd@test.com',
    phone: '',
    role: 'Student',
    stage: 'Contact',
    location: '',
    lastSeen: '',
    initials: 'D',
    createdAt: '2026-02-01T00:00:00.000Z',
  };
  const combined = combineContactProfiles(survivor, duplicate);

  const now = '2026-03-01T00:00:00.000Z';

  it('updates the survivor profile and deletes the duplicate contact', () => {
    const ops = buildCombineOps(survivor, duplicate, combined, now, 'u1', 'Admin');

    const survivorUpdate = ops.find(
      (o): o is Extract<FirestoreOp, { op: 'update' }> =>
        o.op === 'update' && o.collection === 'contacts' && o.docId === 's1'
    );
    expect(survivorUpdate).toBeDefined();
    expect(survivorUpdate.data.name).toBe('Survivor');
    expect(survivorUpdate.data.updatedAt).toBe(now);
    expect(survivorUpdate.data.updatedBy).toBe('u1');
    expect(survivorUpdate.data.updatedByName).toBe('Admin');

    const duplicateDelete = ops.find((o) => o.op === 'delete' && o.collection === 'contacts' && o.docId === 'd1');
    expect(duplicateDelete).toBeDefined();
  });

  it('copies interactions and threads subcollections to the survivor then deletes originals', () => {
    const ops = buildCombineOps(
      survivor,
      duplicate,
      combined,
      now,
      'u1',
      'Admin',
      {
        interactions: [
          { id: 'i1', data: { content: 'hello' } },
          { id: 'i2', data: { content: 'again' } },
        ],
        threads: [{ id: 't1', data: { body: 'note' } }],
        prayers: [],
        tasks: [],
        visits: [],
      }
    );

    expect(ops).toContainEqual({
      op: 'set',
      collection: 'contacts/s1/interactions',
      docId: 'i1',
      data: { content: 'hello' },
    });
    expect(ops).toContainEqual({
      op: 'delete',
      collection: 'contacts/d1/interactions',
      docId: 'i1',
    });
    expect(ops).toContainEqual({
      op: 'set',
      collection: 'contacts/s1/interactions',
      docId: 'i2',
      data: { content: 'again' },
    });
    expect(ops).toContainEqual({
      op: 'set',
      collection: 'contacts/s1/threads',
      docId: 't1',
      data: { body: 'note' },
    });
    expect(ops).toContainEqual({
      op: 'delete',
      collection: 'contacts/d1/threads',
      docId: 't1',
    });
  });

  it('re-parents prayers and tasks and rewrites visit contactIds', () => {
    const ops = buildCombineOps(
      survivor,
      duplicate,
      combined,
      now,
      'u1',
      'Admin',
      {
        interactions: [],
        threads: [],
        prayers: ['p1', 'p2'],
        tasks: ['k1'],
        visits: [
          { id: 'v1', contactIds: ['d1', 's1'] },
          { id: 'v2', contactIds: ['other'] },
        ],
      }
    );

    expect(ops).toContainEqual({ op: 'update', collection: 'prayers', docId: 'p1', data: { contactId: 's1' } });
    expect(ops).toContainEqual({ op: 'update', collection: 'prayers', docId: 'p2', data: { contactId: 's1' } });
    expect(ops).toContainEqual({ op: 'update', collection: 'tasks', docId: 'k1', data: { contactId: 's1' } });
    expect(ops).toContainEqual({ op: 'update', collection: 'visits', docId: 'v1', data: { contactIds: ['s1', 's1'] } });
    expect(ops).toContainEqual({ op: 'update', collection: 'visits', docId: 'v2', data: { contactIds: ['other'] } });
  });
});

describe('chunkOps', () => {
  it('chunks ops into batches of the given size', () => {
    const ops: FirestoreOp[] = Array.from({ length: 1020 }, (_, i) => ({
      op: 'delete',
      collection: 'contacts',
      docId: String(i),
    }));

    const chunks = chunkOps(ops, 500);
    expect(chunks).toHaveLength(3);
    expect(chunks[0]).toHaveLength(500);
    expect(chunks[1]).toHaveLength(500);
    expect(chunks[2]).toHaveLength(20);
  });
});
