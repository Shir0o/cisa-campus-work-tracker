import { describe, it, expect } from 'vitest';
import {
  findCombineCandidates,
  combineContactProfiles,
  diffCombineFields,
  buildCombinePlan,
  buildCombineUndoPlan,
  referenceKey,
  checkCombineMatch,
  historyScore,
  contactPairKey,
  chooseKeptContact,
  timestampMillis,
  type CombineReferences,
  type CombineUndoRecord,
  type CombineUndoCurrent,
  type ContactHistory,
} from '../lib/combineContactsPlan';
import type { Contact } from '../types';
import {
  isoCreatedContact,
  timestampCreatedContact,
  restTimestampCreatedContact,
  nullEmailContact,
  noOwnerContact,
  legacyContact,
} from './fixtures/contacts';

const EMPTY_REFS: CombineReferences = {
  interactions: [],
  threads: [],
  teamThreads: [],
  comments: [],
  prayers: [],
  tasks: [],
  visits: [],
  gatherings: [],
  rhythms: [],
  homes: [],
  outreach: [],
  attendeeAliases: [],
  pendingImports: [],
  personalPrayers: [],
  userPreferences: [],
  inboxStates: [],
  notifications: [],
  activities: [],
};

const META = { now: '2026-03-01T00:00:00.000Z', updatedById: 'u1', updatedByName: 'Admin' };

describe('findCombineCandidates', () => {
  it('detects pairs by normalized email', () => {
    const contacts: Partial<Contact>[] = [
      { id: '1', name: 'John Doe', email: 'john@example.com', createdAt: '2026-01-01' },
      { id: '2', name: 'Johnny D', email: '  JOHN@EXAMPLE.COM ', createdAt: '2026-01-02' },
      { id: '3', name: 'Jane Smith', email: 'jane@example.com', createdAt: '2026-01-03' },
    ];

    const pairs = findCombineCandidates(contacts as Contact[]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].kept.id).toBe('1');
    expect(pairs[0].combinedIn.id).toBe('2');
    expect(pairs[0].reason).toContain('email');
  });

  it('detects pairs by normalized phone', () => {
    const contacts: Partial<Contact>[] = [
      { id: '1', name: 'Mary', phone: '(555) 123-4567', createdAt: '2026-01-01' },
      { id: '2', name: 'Mary M', phone: '5551234567', createdAt: '2026-01-02' },
    ];

    const pairs = findCombineCandidates(contacts as Contact[]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].kept.id).toBe('1');
    expect(pairs[0].combinedIn.id).toBe('2');
    expect(pairs[0].reason).toContain('phone');
  });

  it('detects pairs by normalized name', () => {
    const contacts: Partial<Contact>[] = [
      { id: '1', name: 'David Lee', email: '', phone: '', createdAt: '2026-01-01' },
      { id: '2', name: 'david lee', email: '', phone: '', createdAt: '2026-01-02' },
    ];

    const pairs = findCombineCandidates(contacts as Contact[]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].reason).toContain('name');
  });

  it('keeps the older contact by default', () => {
    const contacts: Partial<Contact>[] = [
      { id: 'newer', name: 'Alice', email: 'alice@test.com', createdAt: '2026-02-01' },
      { id: 'older', name: 'Alice', email: 'alice@test.com', createdAt: '2026-01-01' },
    ];

    const pairs = findCombineCandidates(contacts as Contact[]);
    expect(pairs[0].kept.id).toBe('older');
    expect(pairs[0].combinedIn.id).toBe('newer');
  });

  it('checkCombineMatch returns null for unrelated contacts', () => {
    expect(
      checkCombineMatch(
        { id: 'a', name: 'A', email: 'a@x.com', phone: '', location: '', stage: 'Lead', lastSeen: '', initials: 'A' },
        { id: 'b', name: 'B', email: 'b@x.com', phone: '', location: '', stage: 'Lead', lastSeen: '', initials: 'B' },
      ),
    ).toBeNull();
  });
});

describe('combineContactProfiles', () => {
  it('unions relationship sets and preserves kept scalars while backfilling gaps', () => {
    const kept: Partial<Contact> = {
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
    const combinedIn: Partial<Contact> = {
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

    const combined = combineContactProfiles(kept as Contact, combinedIn as Contact);

    expect(combined.name).toBe('Bob Original');
    expect(combined.major).toBe('Computer Science');
    expect(combined.year).toBe('Junior');
    expect(combined.spiritualBackground).toBe('Christian');
    expect(combined.notes).toContain('First note');
    expect(combined.notes).toContain('Second note from signup');
    expect(combined.tags).toEqual(['Fall 2026', 'Saved']);
    expect(combined.founders).toEqual(['u1', 'u3']);
    expect(combined.carers).toEqual(['u1', 'u4']);
    expect(combined.coCreators).toEqual(['u2', 'u3']);
    expect(combined.visibleTo).toEqual(['u1', 'u2', 'u3', 'u4']);
  });

  it('does not stamp a role on the combined profile (#1345)', () => {
    const kept = { id: 's', name: 'Kept Person', stage: 'Lead', location: '', email: '', phone: '', lastSeen: '', initials: 'S' } as Contact;
    const combinedIn = { ...kept, id: 'd', name: 'Other Person', role: 'Student' } as unknown as Contact;
    expect(combineContactProfiles(kept, combinedIn)).not.toHaveProperty('role');
  });
});

describe('diffCombineFields', () => {
  const kept: Partial<Contact> = {
    id: 's',
    name: 'Kept Person',
    stage: 'Lead',
    location: 'Dorm A',
    email: '',
    phone: '',
    lastSeen: '',
    initials: 'S',
    tags: ['A'],
    notes: 'first note',
    createdAt: '2026-01-01',
  };
  const combinedIn: Partial<Contact> = {
    id: 'd',
    name: 'Other Person',
    stage: 'Lead',
    location: '',
    email: '',
    phone: '5551234',
    lastSeen: '',
    initials: 'D',
    tags: ['A', 'B'],
    notes: 'second note',
    createdAt: '2026-02-01',
  };

  const rowsFor = () => diffCombineFields(kept as Contact, combinedIn as Contact, combineContactProfiles(kept as Contact, combinedIn as Contact));

  it('returns a row for every reviewed field', () => {
    const fields = rowsFor().map((r) => r.field);
    expect(fields).toContain('name');
    expect(fields).toContain('phone');
    expect(fields).toContain('notes');
    expect(fields).toContain('tags');
    expect(fields.length).toBeGreaterThanOrEqual(20);
  });

  it('labels backfilled, kept, combined and combined-notes rows', () => {
    const rows = rowsFor();
    expect(rows.find((r) => r.field === 'phone')).toMatchObject({ kind: 'filled-in', result: '5551234' });
    expect(rows.find((r) => r.field === 'location')).toMatchObject({ kind: 'kept', result: 'Dorm A' });
    expect(rows.find((r) => r.field === 'tags')).toMatchObject({ kind: 'combined', added: ['B'] });
    expect(rows.find((r) => r.field === 'notes')).toMatchObject({ kind: 'combined' });
  });

  it('labels identical fields as same', () => {
    const rows = diffCombineFields(
      { ...kept, email: 'a@x.com' } as Contact,
      { ...combinedIn, email: 'a@x.com' } as Contact,
      combineContactProfiles({ ...kept, email: 'a@x.com' } as Contact, { ...combinedIn, email: 'a@x.com' } as Contact),
    );
    expect(rows.find((r) => r.field === 'email')).toMatchObject({ kind: 'same' });
  });

  it('flags a conflicting name as a pick with the kept result by default', () => {
    const rows = rowsFor();
    expect(rows.find((r) => r.field === 'name')).toMatchObject({
      kind: 'pick',
      kept: 'Kept Person',
      combinedIn: 'Other Person',
      result: 'Kept Person',
    });
  });
});

describe('buildCombinePlan', () => {
  const kept: Contact = {
    id: 's1',
    name: 'Kept',
    email: 's@test.com',
    phone: '',
    stage: 'Lead',
    location: '',
    lastSeen: '',
    initials: 'K',
    createdAt: '2026-01-01T00:00:00.000Z',
  };
  const combinedIn: Contact = {
    id: 'd1',
    name: 'Combined In',
    email: 'd@test.com',
    phone: '',
    stage: 'Contact',
    location: '',
    lastSeen: '',
    initials: 'C',
    createdAt: '2026-02-01T00:00:00.000Z',
  };

  it('writes the combined profile and stamps the update', () => {
    const plan = buildCombinePlan(kept, combinedIn, EMPTY_REFS, META);
    expect(plan.keptId).toBe('s1');
    expect(plan.combinedInId).toBe('d1');
    expect(plan.keptData.name).toBe('Kept');
    expect(plan.keptData.phone).toBe('');
    expect(plan.keptData.updatedAt).toBe(META.now);
    expect(plan.keptData.updatedBy).toBe('u1');
    expect(plan.keptData).not.toHaveProperty('role');
  });

  it('refreshes cached names to the result name when the combined-in name is picked (#1430)', () => {
    const plan = buildCombinePlan(
      kept,
      combinedIn,
      {
        ...EMPTY_REFS,
        tasks: [{ id: 'k1', data: { contactId: 'd1', contactName: 'Old Spelling', text: 'Call' } }],
        visits: [
          {
            id: 'v1',
            contactIds: ['d1', 'x9'],
            data: { contactNames: ['Old Spelling', 'Other'] },
          },
        ],
        outreach: [
          { id: 'o1', data: { names: [{ id: 'ON-1', name: 'Combined In', contactId: 'd1' }] } },
        ],
        activities: [
          {
            id: 'ac1',
            data: { targetId: 'd1', targetName: 'Old Spelling', targetType: 'contact' },
          },
        ],
      },
      META,
      { fields: { name: 'combined-in' } },
    );

    expect(plan.keptData.name).toBe('Combined In');
    const after = (collection: string, field: string) =>
      plan.rewrittenReferences.find((r) => r.collection === collection && r.field === field)?.after;
    expect(after('tasks', 'contactName')).toBe('Combined In');
    expect(after('visits', 'contactNames')).toEqual(['Combined In', 'Other']);
    expect(after('outreach', 'names')).toEqual([
      { id: 'ON-1', name: 'Combined In', contactId: 's1' },
    ]);
    expect(after('activities', 'targetName')).toBe('Combined In');
  });

  it('carries the combined-in reach onto a kept contact nobody had reached (#1335)', () => {
    const reached = { ...combinedIn, reachedAt: '2025-01-10' } as Contact;
    const plan = buildCombinePlan(kept, reached, EMPTY_REFS, META);
    expect(plan.keptData.reachedAt).toBe('2025-01-10');
    expect(buildCombinePlan(kept, combinedIn, EMPTY_REFS, META).keptData).not.toHaveProperty('reachedAt');
  });

  it('lists moved subcollection documents grouped with counts', () => {
    const plan = buildCombinePlan(kept, combinedIn, {
      ...EMPTY_REFS,
      interactions: [
        { id: 'i1', data: { content: 'hello' } },
        { id: 'i2', data: { content: 'again' } },
      ],
      threads: [{ id: 't1', data: { body: 'note' } }],
      teamThreads: [{ id: 'tt1', data: { body: 'team' } }],
    }, META);

    expect(plan.movedDocuments).toContainEqual({
      originalPath: 'contacts/d1/interactions/i1',
      newPath: 'contacts/s1/interactions/i1',
      originalData: { content: 'hello' },
    });
    expect(plan.movedDocuments).toContainEqual({
      originalPath: 'contacts/d1/teamThreads/tt1',
      newPath: 'contacts/s1/teamThreads/tt1',
      originalData: { body: 'team' },
    });
    const interactions = plan.moves.find((m) => m.kind === 'interactions');
    expect(interactions).toMatchObject({ count: 2 });
    expect(interactions?.items).toContainEqual({ id: 'i1', label: 'hello' });
    expect(plan.moves.find((m) => m.kind === 'threads')).toMatchObject({ count: 1 });
    expect(plan.moves.find((m) => m.kind === 'teamThreads')).toMatchObject({ count: 1 });
  });

  it('re-points prayers, to-dos and visits and records the rewrite', () => {
    const plan = buildCombinePlan(kept, combinedIn, {
      ...EMPTY_REFS,
      prayers: [{ id: 'p1', data: { contactId: 'd1', burden: 'healing' } }],
      tasks: [{ id: 'k1', data: { contactId: 'd1', contactName: 'Combined In', text: 'Call' } }],
      visits: [{ id: 'v1', contactIds: ['d1', 'other'], data: { date: '2026-02-02' } }],
    }, META);

    expect(plan.rewrittenReferences).toContainEqual({
      collection: 'prayers',
      document: 'p1',
      field: 'contactId',
      before: 'd1',
      after: 's1',
    });
    expect(plan.rewrittenReferences).toContainEqual({
      collection: 'tasks',
      document: 'k1',
      field: 'contactName',
      before: 'Combined In',
      after: 'Kept',
    });
    expect(plan.rewrittenReferences).toContainEqual({
      collection: 'visits',
      document: 'v1',
      field: 'contactIds',
      before: ['d1', 'other'],
      after: ['s1', 'other'],
    });
    expect(plan.moves.find((m) => m.kind === 'prayers')).toMatchObject({ count: 1 });
    expect(plan.moves.find((m) => m.kind === 'tasks')).toMatchObject({ count: 1 });
    expect(plan.moves.find((m) => m.kind === 'visits')).toMatchObject({ count: 1 });
  });

  it('drops the repeated kept id a visit rewrite would create', () => {
    const plan = buildCombinePlan(kept, combinedIn, {
      ...EMPTY_REFS,
      visits: [{ id: 'v1', contactIds: ['d1', 's1'] }],
    }, META);
    const ref = plan.rewrittenReferences.find((r) => r.field === 'contactIds');
    expect(ref?.after).toEqual(['s1']);
  });

  it('re-points every remaining reference kind and refreshes cached names', () => {
    const plan = buildCombinePlan(kept, combinedIn, {
      ...EMPTY_REFS,
      comments: [{ id: 'c1', data: { text: 'hey' } }],
      gatherings: [
        {
          id: 'e1',
          data: {
            name: 'Friday',
            roster: ['d1', 's1'],
            rosterOverride: ['d1'],
            rosterOverrideBase: ['d1'],
            attendance: { present: ['d1'], absent: ['d1'] },
          },
        },
      ],
      rhythms: [{ id: 'r1', data: { name: 'Wed', roster: ['d1', 'other'] } }],
      homes: [{ id: 'h1', data: { label: 'Peinados', members: ['d1'] } }],
      outreach: [
        { id: 'o1', data: { names: [{ id: 'ON-1', name: 'Combined In', contactId: 'd1' }] } },
      ],
      attendeeAliases: [{ id: 'a1', data: { contactId: 'd1' } }],
      pendingImports: [
        {
          id: 'pi1',
          data: { preview: { attendees: [{ contactId: 'd1' }], conflicts: [{ contactId: 'd1' }] } },
        },
      ],
      personalPrayers: [{ id: 'pp1', userId: 'u2', data: { contactId: 'd1', title: 'heal' } }],
      userPreferences: [{ id: 'u2', data: { personalContactIds: ['d1', 'x'] } }],
      inboxStates: [
        { id: 'u2', data: { seen: { 'att:contact:d1': 't1' }, completed: { 'att:contact:d1': 't2' } } },
      ],
      notifications: [{ id: 'n1', data: { targetId: 'd1', link: '/people/d1', message: 'm' } }],
      activities: [
        { id: 'ac1', data: { targetId: 'd1', targetName: 'Combined In', targetType: 'contact' } },
      ],
      visits: [{ id: 'v1', contactIds: ['d1', 's1'], data: { contactNames: ['Combined In', 'Kept'] } }],
    }, META);

    expect(plan.movedDocuments).toContainEqual({
      originalPath: 'contacts/d1/comments/c1',
      newPath: 'contacts/s1/comments/c1',
      originalData: { text: 'hey' },
    });
    expect(plan.rewrittenReferences).toContainEqual({
      collection: 'events',
      document: 'e1',
      field: 'roster',
      before: ['d1', 's1'],
      after: ['s1'],
    });
    expect(plan.rewrittenReferences).toContainEqual({
      collection: 'events',
      document: 'e1',
      field: 'attendance',
      before: { present: ['d1'], absent: ['d1'] },
      after: { present: ['s1'], absent: ['s1'] },
    });
    expect(plan.rewrittenReferences).toContainEqual({
      collection: 'rhythms',
      document: 'r1',
      field: 'roster',
      before: ['d1', 'other'],
      after: ['s1', 'other'],
    });
    expect(plan.rewrittenReferences).toContainEqual({
      collection: 'homes',
      document: 'h1',
      field: 'members',
      before: ['d1'],
      after: ['s1'],
    });
    expect(plan.rewrittenReferences).toContainEqual({
      collection: 'outreach',
      document: 'o1',
      field: 'names',
      before: [{ id: 'ON-1', name: 'Combined In', contactId: 'd1' }],
      after: [{ id: 'ON-1', name: 'Kept', contactId: 's1' }],
    });
    expect(plan.rewrittenReferences).toContainEqual({
      collection: 'attendee_aliases',
      document: 'a1',
      field: 'contactId',
      before: 'd1',
      after: 's1',
    });
    expect(plan.rewrittenReferences).toContainEqual({
      collection: 'pending_attendance_imports',
      document: 'pi1',
      field: 'preview',
      before: { attendees: [{ contactId: 'd1' }], conflicts: [{ contactId: 'd1' }] },
      after: { attendees: [{ contactId: 's1' }], conflicts: [{ contactId: 's1' }] },
    });
    expect(plan.rewrittenReferences).toContainEqual({
      collection: 'users/u2/personalPrayers',
      document: 'pp1',
      field: 'contactId',
      before: 'd1',
      after: 's1',
    });
    expect(plan.rewrittenReferences).toContainEqual({
      collection: 'userPreferences',
      document: 'u2',
      field: 'personalContactIds',
      before: ['d1', 'x'],
      after: ['s1', 'x'],
    });
    expect(plan.rewrittenReferences).toContainEqual({
      collection: 'inboxState',
      document: 'u2',
      field: 'seen',
      before: { 'att:contact:d1': 't1' },
      after: { 'att:contact:s1': 't1' },
    });
    expect(plan.rewrittenReferences).toContainEqual({
      collection: 'inboxState',
      document: 'u2',
      field: 'completed',
      before: { 'att:contact:d1': 't2' },
      after: { 'att:contact:s1': 't2' },
    });
    expect(plan.rewrittenReferences).toContainEqual({
      collection: 'notifications',
      document: 'n1',
      field: 'targetId',
      before: 'd1',
      after: 's1',
    });
    expect(plan.rewrittenReferences).toContainEqual({
      collection: 'notifications',
      document: 'n1',
      field: 'link',
      before: '/people/d1',
      after: '/people/s1',
    });
    expect(plan.rewrittenReferences).toContainEqual({
      collection: 'activities',
      document: 'ac1',
      field: 'targetName',
      before: 'Combined In',
      after: 'Kept',
    });
    expect(plan.rewrittenReferences).toContainEqual({
      collection: 'visits',
      document: 'v1',
      field: 'contactNames',
      before: ['Combined In', 'Kept'],
      after: ['Kept'],
    });

    for (const kind of [
      'comments',
      'gatherings',
      'rhythms',
      'homes',
      'outreach',
      'attendeeAliases',
      'pendingImports',
      'personalPrayers',
      'userPreferences',
      'inboxStates',
      'notifications',
      'activities',
    ] as const) {
      expect(plan.moves.find((m) => m.kind === kind)?.count).toBeGreaterThan(0);
    }
  });
});

describe('combine picks and fixed field rules (#1431)', () => {
  const kept = {
    id: 's1',
    name: 'Kept Name',
    email: 's@x.com',
    phone: '',
    stage: 'Lead',
    location: 'Dorm A',
    lastSeen: '2026-03-10',
    initials: 'K',
    createdAt: '2026-02-01T00:00:00.000Z',
    addedBy: 'u-later',
    lastContactedDate: '2026-01-01',
    interests: ['music'],
    storyMessageIds: ['m1'],
    tags: ['A'],
    notes: 'kept notes',
    attendance: { e1: true },
  } as unknown as Contact;

  const combinedIn = {
    id: 'd1',
    name: 'In Name',
    email: 'd@x.com',
    phone: '',
    stage: 'Contact',
    location: '',
    lastSeen: '2026-04-01',
    initials: 'I',
    createdAt: '2026-01-01T00:00:00.000Z',
    addedBy: 'u-earlier',
    lastContactedDate: '2026-05-01',
    interests: ['sports'],
    storyMessageIds: ['m2'],
    tags: ['A', 'B'],
    notes: 'in notes',
    isStudent: true,
    attendance: { e2: true },
  } as unknown as Contact;

  it('uses the Full-timer pick when a single value conflicts', () => {
    const keptPick = combineContactProfiles(kept, combinedIn);
    expect(keptPick.name).toBe('Kept Name');

    const combinedInPick = combineContactProfiles(kept, combinedIn, {
      fields: { name: 'combined-in' as const },
    });
    expect(combinedInPick.name).toBe('In Name');
  });

  it('keeps one side of the notes or both', () => {
    expect(combineContactProfiles(kept, combinedIn).notes).toContain('kept notes');
    expect(combineContactProfiles(kept, combinedIn).notes).toContain('in notes');
    expect(combineContactProfiles(kept, combinedIn, { notes: 'kept' }).notes).toBe('kept notes');
    expect(combineContactProfiles(kept, combinedIn, { notes: 'combined-in' }).notes).toBe('in notes');
  });

  it('takes first added and added by from the earlier record', () => {
    const combined = combineContactProfiles(kept, combinedIn);
    expect(combined.createdAt).toBe('2026-01-01T00:00:00.000Z');
    expect(combined.addedBy).toBe('u-earlier');
  });

  it('compares ISO strings and Firestore timestamps when deciding the earlier record', () => {
    const keptTs = {
      ...kept,
      createdAt: { seconds: 1738368000, nanoseconds: 0 },
    } as unknown as Contact;
    const combinedInTs = {
      ...combinedIn,
      createdAt: { _seconds: 1735689600, nanoseconds: 0 },
      addedBy: 'u-older',
    } as unknown as Contact;

    const combined = combineContactProfiles(keptTs, combinedInTs);
    expect(combined.addedBy).toBe('u-older');
    expect(combined.createdAt).toEqual({ _seconds: 1735689600, nanoseconds: 0 });
  });

  it('takes last contacted and last seen from the later record', () => {
    const combined = combineContactProfiles(kept, combinedIn);
    expect(combined.lastSeen).toBe('2026-04-01');
    expect(combined.lastContactedDate).toBe('2026-05-01');
  });

  it('combines interests, story links and the legacy attendance map', () => {
    const combined = combineContactProfiles(kept, combinedIn) as Contact & {
      attendance?: Record<string, unknown>;
    };
    expect(combined.interests).toEqual(['music', 'sports']);
    expect(combined.storyMessageIds).toEqual(['m1', 'm2']);
    expect(combined.attendance).toEqual({ e1: true, e2: true });
  });

  it('lets the kept contact win per event in the legacy attendance map', () => {
    const shared = { ...combinedIn, attendance: { e1: 'absent', e3: true } } as unknown as Contact;
    const combined = combineContactProfiles(kept, shared) as Contact & {
      attendance?: Record<string, unknown>;
    };
    expect(combined.attendance).toEqual({ e1: true, e3: true });
  });

  it('labels every row kind, including picks, earlier wins and latest wins', () => {
    const combined = combineContactProfiles(kept, combinedIn);
    const rows = diffCombineFields(kept, combinedIn, combined);
    const byField = (f: string) => rows.find((r) => r.field === f);

    expect(byField('name')).toMatchObject({ kind: 'pick', result: 'Kept Name' });
    expect(byField('location')).toMatchObject({ kind: 'kept' });
    expect(byField('stage')).toMatchObject({ kind: 'pick' });
    expect(byField('phone')).toMatchObject({ kind: 'same' });
    expect(byField('notes')).toMatchObject({ kind: 'combined' });
    expect(byField('tags')).toMatchObject({ kind: 'combined', added: ['B'] });
    expect(byField('interests')).toMatchObject({ kind: 'combined', added: ['sports'] });
    expect(byField('storyMessageIds')).toMatchObject({ kind: 'combined', added: ['m2'] });
    expect(byField('createdAt')).toMatchObject({ kind: 'earlier-wins' });
    expect(byField('addedBy')).toMatchObject({ kind: 'earlier-wins', result: 'u-earlier' });
    expect(byField('lastSeen')).toMatchObject({ kind: 'latest-wins', result: '2026-04-01' });
    expect(byField('lastContactedDate')).toMatchObject({ kind: 'latest-wins' });
    expect(byField('attendance')).toMatchObject({ kind: 'combined', added: ['e2'] });
  });

  it('reflects the pick in the result column and the written profile', () => {
    const picks = { fields: { name: 'combined-in' as const } };
    const combined = combineContactProfiles(kept, combinedIn, picks);
    const rows = diffCombineFields(kept, combinedIn, combined);
    expect(rows.find((r) => r.field === 'name')?.result).toBe('In Name');

    const plan = buildCombinePlan(kept, combinedIn, EMPTY_REFS, META, picks);
    expect(plan.keptData.name).toBe('In Name');
  });
});

describe('findCombineCandidates by history', () => {
  const contacts: Partial<Contact>[] = [
    { id: 'a', name: 'Alex', email: 'alex@x.com', createdAt: '2026-01-01' },
    { id: 'b', name: 'Alex', email: 'alex@x.com', createdAt: '2026-02-01' },
  ];

  it('scores history as interactions plus comments plus roster entries', () => {
    const history: ContactHistory = { interactions: 2, comments: 1, rosterEntries: 3 };
    expect(historyScore(history)).toBe(6);
  });

  it('keeps the record with more history even when it is newer', () => {
    const pairs = findCombineCandidates(contacts as Contact[], {
      a: { interactions: 0, comments: 0, rosterEntries: 0 },
      b: { interactions: 3, comments: 1, rosterEntries: 2 },
    });
    expect(pairs[0].kept.id).toBe('b');
    expect(pairs[0].combinedIn.id).toBe('a');
  });

  it('falls back to the older record when history ties', () => {
    const pairs = findCombineCandidates(contacts as Contact[], {
      a: { interactions: 1, comments: 0, rosterEntries: 0 },
      b: { interactions: 1, comments: 0, rosterEntries: 0 },
    });
    expect(pairs[0].kept.id).toBe('a');
  });
});

describe('chooseKeptContact (#1433)', () => {
  const older: Partial<Contact> = { id: 'old', name: 'Jon S.', email: 'jon@x.com', createdAt: '2026-01-01' };
  const newer: Partial<Contact> = { id: 'new', name: 'Jonathan Smith', email: 'js@x.com', createdAt: '2026-02-01' };

  it('keeps the older record when history ties or is unknown', () => {
    expect(chooseKeptContact(older as Contact, newer as Contact).kept.id).toBe('old');
  });

  it('keeps the record with more history even when it is newer', () => {
    const { kept, combinedIn } = chooseKeptContact(older as Contact, newer as Contact, {
      old: { interactions: 0, comments: 0, rosterEntries: 0 },
      new: { interactions: 2, comments: 1, rosterEntries: 0 },
    });
    expect(kept.id).toBe('new');
    expect(combinedIn.id).toBe('old');
  });
});

describe('Not the same person marks (#1432)', () => {
  const contacts: Partial<Contact>[] = [
    { id: '1', name: 'John Doe', email: 'john@example.com', createdAt: '2026-01-01' },
    { id: '2', name: 'Johnny D', email: 'john@example.com', createdAt: '2026-01-02' },
  ];

  it('builds one pair key regardless of order', () => {
    expect(contactPairKey('b', 'a')).toBe(contactPairKey('a', 'b'));
  });

  it('excludes a pair that was marked Not the same person', () => {
    expect(findCombineCandidates(contacts as Contact[])).toHaveLength(1);
    const excluded = new Set([contactPairKey('2', '1')]);
    expect(findCombineCandidates(contacts as Contact[], {}, excluded)).toHaveLength(0);
  });
});

describe('buildCombineUndoPlan', () => {
  const record: CombineUndoRecord = {
    keptId: 's1',
    combinedInId: 'd1',
    keptBefore: { name: 'Kept', tags: ['A'], email: 's@x.com' },
    combinedInBefore: { name: 'In', tags: ['A', 'B'], email: 'd@x.com' },
    keptAfter: {
      name: 'Kept',
      tags: ['A', 'B'],
      email: 's@x.com',
      updatedAt: 'T',
      updatedByName: 'Test',
    },
    movedDocuments: [
      {
        originalPath: 'contacts/d1/interactions/i1',
        newPath: 'contacts/s1/interactions/i1',
        originalData: { content: 'hi' },
      },
      {
        originalPath: 'contacts/d1/threads/t1',
        newPath: 'contacts/s1/threads/t1',
        originalData: { body: 'note' },
      },
    ],
    rewrittenReferences: [
      { collection: 'prayers', document: 'p1', field: 'contactId', before: 'd1', after: 's1' },
      { collection: 'tasks', document: 'k1', field: 'contactId', before: 'd1', after: 's1' },
      { collection: 'tasks', document: 'k1', field: 'contactName', before: 'In', after: 'Kept' },
    ],
  };

  const baseCurrent = (): CombineUndoCurrent => ({
    kept: { name: 'Kept', tags: ['A', 'B'], email: 's@x.com', updatedAt: 'T', updatedByName: 'Test' },
    keptSubDocs: {
      interactions: [{ id: 'i1', data: { content: 'hi' } }],
      threads: [{ id: 't1', data: { body: 'note' } }],
      teamThreads: [],
      comments: [],
    },
    movedCurrent: {
      'contacts/d1/interactions/i1': { content: 'hi' },
      'contacts/d1/threads/t1': { body: 'note' },
    },
    referenceValues: {
      [referenceKey('prayers', 'p1', 'contactId')]: 's1',
      [referenceKey('tasks', 'k1', 'contactId')]: 's1',
      [referenceKey('tasks', 'k1', 'contactName')]: 'Kept',
    },
  });

  it('undoes a combine nothing has changed since, restoring the before-image', () => {
    const plan = buildCombineUndoPlan(record, baseCurrent());

    expect(plan.movedBack.map((m) => m.originalPath)).toEqual([
      'contacts/d1/interactions/i1',
      'contacts/d1/threads/t1',
    ]);
    expect(plan.referenceRestores).toHaveLength(3);
    expect(plan.notRestored).toEqual([]);
    expect(plan.stays).toEqual([]);
    // Metadata the combine stamped is removed; unchanged fields are not touched.
    expect(plan.keptUpdates).toContainEqual({ field: 'updatedAt', remove: true });
    expect(plan.keptUpdates).toContainEqual({ field: 'updatedByName', remove: true });
    expect(plan.keptUpdates.find((u) => u.field === 'name')).toBeUndefined();
    // Only the tags the combine added are removed.
    expect(plan.keptUpdates).toContainEqual({ field: 'tags', value: ['A'] });
  });

  it('returns a moved document edited after the combine with its edit', () => {
    const current = baseCurrent();
    current.movedCurrent['contacts/d1/interactions/i1'] = { content: 'edited' };
    current.keptSubDocs.interactions = [{ id: 'i1', data: { content: 'edited' } }];

    const plan = buildCombineUndoPlan(record, current);

    const moved = plan.movedBack.find((m) => m.originalPath === 'contacts/d1/interactions/i1');
    expect(moved?.data).toEqual({ content: 'edited' });
  });

  it('leaves a document added to the kept contact after the combine', () => {
    const current = baseCurrent();
    current.keptSubDocs.interactions.push({ id: 'new1', data: { content: 'later' } });

    const plan = buildCombineUndoPlan(record, current);

    expect(plan.stays).toContainEqual({ kind: 'interactions', id: 'new1', label: 'later' });
    expect(plan.movedBack.map((m) => m.originalPath)).not.toContain('contacts/d1/interactions/new1');
  });

  it('keeps a kept-contact field edited after the combine and lists it as not restored', () => {
    const changed: CombineUndoRecord = {
      ...record,
      keptAfter: { ...record.keptAfter, email: 'd@x.com' },
    };
    const current = baseCurrent();
    current.kept.email = 'newer@x.com';

    const plan = buildCombineUndoPlan(changed, current);

    expect(plan.keptUpdates.find((u) => u.field === 'email')).toBeUndefined();
    expect(plan.notRestored).toContainEqual({ kind: 'field', label: 'email' });
  });

  it('does not list a field the combine left unchanged, edited since, as not restored', () => {
    const current = baseCurrent();
    current.kept.email = 'newer@x.com';

    const plan = buildCombineUndoPlan(record, current);

    expect(plan.notRestored).toEqual([]);
    expect(plan.keptUpdates.find((u) => u.field === 'email')).toBeUndefined();
  });

  it('removes only the combined-list items the combine added, keeping later additions', () => {
    const current = baseCurrent();
    current.kept.tags = ['A', 'B', 'C'];

    const plan = buildCombineUndoPlan(record, current);

    expect(plan.keptUpdates).toContainEqual({ field: 'tags', value: ['A', 'C'] });
  });

  it('restores a rewritten reference only while it still holds the combine value', () => {
    const current = baseCurrent();
    current.referenceValues[referenceKey('prayers', 'p1', 'contactId')] = 'other';

    const plan = buildCombineUndoPlan(record, current);

    expect(plan.referenceRestores.find((r) => r.collection === 'prayers')).toBeUndefined();
    expect(plan.notRestored).toContainEqual({ kind: 'reference', label: 'prayers.contactId' });
    expect(plan.referenceRestores.find((r) => r.collection === 'tasks')).toBeDefined();
  });

  it('restores an object-valued reference by deep equality', () => {
    const objectRecord: CombineUndoRecord = {
      ...record,
      rewrittenReferences: [
        {
          collection: 'events',
          document: 'e1',
          field: 'attendance',
          before: { present: ['d1'], absent: [] },
          after: { present: ['s1'], absent: [] },
        },
      ],
    };
    const current = {
      ...baseCurrent(),
      referenceValues: {
        [referenceKey('events', 'e1', 'attendance')]: { present: ['s1'], absent: [] },
      },
    };

    const plan = buildCombineUndoPlan(objectRecord, current);

    expect(plan.referenceRestores).toContainEqual({
      collection: 'events',
      document: 'e1',
      field: 'attendance',
      value: { present: ['d1'], absent: [] },
    });
    expect(plan.notRestored).toEqual([]);
  });

  it('removes the combined-from banner stamped by the combine (#1434)', () => {
    const banner = { name: 'In', at: 'T', byName: 'Test', combineRecordId: 'r1' };
    const withBanner: CombineUndoRecord = {
      ...record,
      keptAfter: { ...record.keptAfter, combinedFrom: banner },
    };
    const current = { ...baseCurrent(), kept: { ...baseCurrent().kept, combinedFrom: banner } };

    const plan = buildCombineUndoPlan(withBanner, current);

    expect(plan.keptUpdates).toContainEqual({ field: 'combinedFrom', remove: true });
    expect(plan.notRestored).toEqual([]);
  });

  it('restores the earlier combined-from banner when a later combine is undone (#1434)', () => {
    const earlier = { name: 'First', at: 'T1', byName: 'A', combineRecordId: 'r0' };
    const later = { name: 'Second', at: 'T2', byName: 'B', combineRecordId: 'r1' };
    const withBanner: CombineUndoRecord = {
      ...record,
      keptBefore: { ...record.keptBefore, combinedFrom: earlier },
      keptAfter: { ...record.keptAfter, combinedFrom: later },
    };
    const current = { ...baseCurrent(), kept: { ...baseCurrent().kept, combinedFrom: later } };

    const plan = buildCombineUndoPlan(withBanner, current);

    expect(plan.keptUpdates).toContainEqual({ field: 'combinedFrom', value: earlier });
  });

  it('leaves a combined-from banner edited after the combine alone (#1434)', () => {
    const later = { name: 'Second', at: 'T2', byName: 'B', combineRecordId: 'r1' };
    const withBanner: CombineUndoRecord = {
      ...record,
      keptAfter: { ...record.keptAfter, combinedFrom: later },
    };
    const edited = { ...later, byName: 'Someone else' };
    const current = { ...baseCurrent(), kept: { ...baseCurrent().kept, combinedFrom: edited } };

    const plan = buildCombineUndoPlan(withBanner, current);

    expect(plan.keptUpdates.find((u) => u.field === 'combinedFrom')).toBeUndefined();
    expect(plan.notRestored).toEqual([]);
  });

  describe('list-shaped references restore entry by entry', () => {
    const planFor = (
      refs: CombineUndoRecord['rewrittenReferences'],
      values: Record<string, unknown>,
    ) =>
      buildCombineUndoPlan(
        { ...record, rewrittenReferences: refs },
        { ...baseCurrent(), referenceValues: values },
      );

    it('puts the combined-in contact back on a roster that gained a member since', () => {
      const plan = planFor(
        [{ collection: 'events', document: 'e1', field: 'roster', before: ['d1', 'x'], after: ['s1', 'x'] }],
        { [referenceKey('events', 'e1', 'roster')]: ['s1', 'x', 'later'] },
      );

      expect(plan.referenceRestores).toEqual([
        { collection: 'events', document: 'e1', field: 'roster', value: ['d1', 'x', 'later'] },
      ]);
      expect(plan.notRestored).toEqual([]);
    });

    it('restores a collapsed entry beside the kept contact, which keeps its own', () => {
      const plan = planFor(
        [{ collection: 'rhythms', document: 'r1', field: 'roster', before: ['d1', 's1'], after: ['s1'] }],
        { [referenceKey('rhythms', 'r1', 'roster')]: ['s1', 'later'] },
      );

      expect(plan.referenceRestores[0]?.value).toEqual(['d1', 's1', 'later']);
    });

    it('restores the combined-in inbox key when another key was marked since', () => {
      const plan = planFor(
        [
          {
            collection: 'inboxState',
            document: 'u2',
            field: 'seen',
            before: { 'att:contact:d1': 't1', 'att:task:q': 't0' },
            after: { 'att:contact:s1': 't1', 'att:task:q': 't0' },
          },
        ],
        {
          [referenceKey('inboxState', 'u2', 'seen')]: {
            'att:contact:s1': 't1',
            'att:task:q': 't0',
            'att:contact:z': 't9',
          },
        },
      );

      expect(plan.referenceRestores[0]?.value).toEqual({
        'att:contact:d1': 't1',
        'att:task:q': 't0',
        'att:contact:z': 't9',
      });
      expect(plan.notRestored).toEqual([]);
    });

    it('keeps the kept contact\'s own inbox key when the combine collapsed it', () => {
      const plan = planFor(
        [
          {
            collection: 'inboxState',
            document: 'u2',
            field: 'completed',
            before: { 'att:contact:d1': 't1', 'att:contact:s1': 't2' },
            after: { 'att:contact:s1': 't2' },
          },
        ],
        { [referenceKey('inboxState', 'u2', 'completed')]: { 'att:contact:s1': 't2', other: 't3' } },
      );

      expect(plan.referenceRestores[0]?.value).toEqual({
        'att:contact:d1': 't1',
        'att:contact:s1': 't2',
        other: 't3',
      });
    });

    it('puts both contacts back on a collapsed visit, names alongside', () => {
      const plan = planFor(
        [
          { collection: 'visits', document: 'v1', field: 'contactIds', before: ['d1', 's1'], after: ['s1'] },
          {
            collection: 'visits',
            document: 'v1',
            field: 'contactNames',
            before: ['In', 'Kept'],
            after: ['Kept'],
          },
        ],
        {
          [referenceKey('visits', 'v1', 'contactIds')]: ['s1', 'n9'],
          [referenceKey('visits', 'v1', 'contactNames')]: ['Kept', 'Nine'],
        },
      );

      expect(plan.referenceRestores).toEqual([
        { collection: 'visits', document: 'v1', field: 'contactIds', value: ['d1', 's1', 'n9'] },
        { collection: 'visits', document: 'v1', field: 'contactNames', value: ['In', 'Kept', 'Nine'] },
      ]);
    });

    it('re-adds no one to a home the kept contact was removed from, and reports it', () => {
      const plan = planFor(
        [{ collection: 'homes', document: 'h1', field: 'members', before: ['d1'], after: ['s1'] }],
        { [referenceKey('homes', 'h1', 'members')]: ['other'] },
      );

      expect(plan.referenceRestores).toEqual([]);
      expect(plan.notRestored).toContainEqual({ kind: 'reference', label: 'homes.members' });
    });

    it('restores each attendance key on its own', () => {
      const plan = planFor(
        [
          {
            collection: 'events',
            document: 'e1',
            field: 'attendance',
            before: { present: ['d1', 'x'], absent: ['d1'] },
            after: { present: ['s1', 'x'], absent: ['s1'] },
          },
        ],
        { [referenceKey('events', 'e1', 'attendance')]: { present: ['s1', 'x', 'y'], absent: [] } },
      );

      expect(plan.referenceRestores[0]?.value).toEqual({ present: ['d1', 'x', 'y'], absent: [] });
      expect(plan.notRestored).toContainEqual({ kind: 'reference', label: 'events.attendance.absent' });
    });

    it('restores the rewritten outreach entry and leaves entries added since', () => {
      const plan = planFor(
        [
          {
            collection: 'outreach',
            document: 'o1',
            field: 'names',
            before: [{ id: 'ON-1', name: 'In', contactId: 'd1' }],
            after: [{ id: 'ON-1', name: 'Kept', contactId: 's1' }],
          },
        ],
        {
          [referenceKey('outreach', 'o1', 'names')]: [
            { id: 'ON-2', name: 'New', contactId: 'n2' },
            { id: 'ON-1', name: 'Kept', contactId: 's1', note: 'later' },
          ],
        },
      );

      expect(plan.referenceRestores[0]?.value).toEqual([
        { id: 'ON-2', name: 'New', contactId: 'n2' },
        { id: 'ON-1', name: 'In', contactId: 'd1', note: 'later' },
      ]);
    });
  });

  describe('combined profile lists lose only the items the combine added', () => {
    it('keeps an interest added after the combine and removes the one the combine added', () => {
      const plan = buildCombineUndoPlan(
        {
          ...record,
          keptBefore: { ...record.keptBefore, interests: ['music'], storyMessageIds: ['m1'] },
          keptAfter: { ...record.keptAfter, interests: ['music', 'art'], storyMessageIds: ['m1', 'm2'] },
        },
        {
          ...baseCurrent(),
          kept: {
            ...baseCurrent().kept,
            interests: ['music', 'art', 'chess'],
            storyMessageIds: ['m1', 'm2', 'm3'],
          },
        },
      );

      expect(plan.keptUpdates).toContainEqual({ field: 'interests', value: ['music', 'chess'] });
      expect(plan.keptUpdates).toContainEqual({ field: 'storyMessageIds', value: ['m1', 'm3'] });
      expect(plan.notRestored).toEqual([]);
    });

    it('removes only the unchanged attendance events the combine added', () => {
      const plan = buildCombineUndoPlan(
        {
          ...record,
          keptBefore: { ...record.keptBefore, attendance: { e1: 'present' } },
          keptAfter: {
            ...record.keptAfter,
            attendance: { e1: 'present', e2: 'present', e3: 'absent' },
          },
        },
        {
          ...baseCurrent(),
          kept: {
            ...baseCurrent().kept,
            attendance: { e1: 'present', e2: 'present', e3: 'present', e4: 'absent' },
          },
        },
      );

      expect(plan.keptUpdates).toContainEqual({
        field: 'attendance',
        value: { e1: 'present', e3: 'present', e4: 'absent' },
      });
      expect(plan.notRestored).toContainEqual({ kind: 'field', label: 'attendance.e3' });
    });
  });
});

describe('legacy contact shapes (#1472, escape rows 10, 17 and 20)', () => {
  const newerIso = legacyContact({
    id: 'newer-iso',
    name: 'Newer Iso',
    createdAt: '2026-02-01T00:00:00.000Z',
  });

  it('keeps the older record when one side matches on a Firestore Timestamp createdAt', () => {
    // Escape 10: Combine assumed an ISO string and crashed on a sign-up's
    // Timestamp (#1130). timestampMillis reads it; undo that parse (a
    // string-only Date.parse, as #1132 replaced) and the timestamp side reads
    // as 0, so the newer ISO record is kept instead of the older Timestamp.
    const { kept, combinedIn } = chooseKeptContact(newerIso, timestampCreatedContact);
    expect(kept.id).toBe('legacy-timestamp');
    expect(combinedIn.id).toBe('newer-iso');
  });

  it('reads the REST _seconds shape when choosing the earlier record', () => {
    const { kept } = chooseKeptContact(newerIso, restTimestampCreatedContact);
    expect(kept.id).toBe('legacy-rest-timestamp');
  });

  it('combines a timestamp-created contact and carries the earlier createdAt through', () => {
    const combined = combineContactProfiles(newerIso, timestampCreatedContact);
    expect(combined.createdAt).toEqual({ seconds: 1767225600, nanoseconds: 0 });
  });

  it('backfills an email from the other side when one contact carries null', () => {
    // Escape 20: a quick-add or sign-up leaves email null, not "". Treated as
    // a blank it backfills rather than overwriting the real address.
    const withEmail = legacyContact({ id: 'has-email', email: 'real@example.com' });
    expect(combineContactProfiles(nullEmailContact, withEmail).email).toBe('real@example.com');
  });

  it('combines a contact that never had an owner without throwing', () => {
    // Escape 17: older documents have no owner key. The combine must not read it.
    const combined = combineContactProfiles(noOwnerContact, isoCreatedContact);
    expect(combined.name).toBe('No Owner');
  });
});

describe('timestampMillis', () => {
  it('reduces every stored form of one instant to the same milliseconds', () => {
    const ms = 1767225600123;
    const forms = [
      '2026-01-01T00:00:00.123Z',
      { toDate: () => new Date(ms) },
      { seconds: 1767225600, nanoseconds: 123000000 },
      { _seconds: 1767225600, _nanoseconds: 123000000 },
    ];
    for (const form of forms) expect(timestampMillis(form)).toBe(ms);
  });

  it('treats a missing nanoseconds part as zero and a missing value as 0', () => {
    expect(timestampMillis({ seconds: 5 })).toBe(5000);
    expect(timestampMillis(null)).toBe(0);
  });
});
