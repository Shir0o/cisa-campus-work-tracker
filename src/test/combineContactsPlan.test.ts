import { describe, it, expect } from 'vitest';
import {
  findCombineCandidates,
  mergeContactProfiles,
  diffCombineFields,
  buildCombinePlan,
  buildCombineUndoPlan,
  referenceKey,
  checkCombineMatch,
  historyScore,
  contactPairKey,
  chooseKeptContact,
  type CombineReferences,
  type CombineUndoRecord,
  type CombineUndoCurrent,
  type ContactHistory,
} from '../lib/combineContactsPlan';
import type { Contact } from '../types';

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
  it('detects duplicates by normalized email', () => {
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

  it('detects duplicates by normalized phone', () => {
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

  it('detects duplicates by normalized name', () => {
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

describe('mergeContactProfiles', () => {
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

    const merged = mergeContactProfiles(kept as Contact, combinedIn as Contact);

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

  it('does not stamp a role on the combined profile (#1345)', () => {
    const kept = { id: 's', name: 'Survivor', stage: 'Lead', location: '', email: '', phone: '', lastSeen: '', initials: 'S' } as Contact;
    const combinedIn = { ...kept, id: 'd', name: 'Duplicate', role: 'Student' } as unknown as Contact;
    expect(mergeContactProfiles(kept, combinedIn)).not.toHaveProperty('role');
  });
});

describe('diffCombineFields', () => {
  const kept: Partial<Contact> = {
    id: 's',
    name: 'Survivor',
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
    name: 'Duplicate',
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

  const rowsFor = () => diffCombineFields(kept as Contact, combinedIn as Contact, mergeContactProfiles(kept as Contact, combinedIn as Contact));

  it('returns a row for every reviewed field', () => {
    const fields = rowsFor().map((r) => r.field);
    expect(fields).toContain('name');
    expect(fields).toContain('phone');
    expect(fields).toContain('notes');
    expect(fields).toContain('tags');
    expect(fields.length).toBeGreaterThanOrEqual(20);
  });

  it('labels backfilled, kept, merged and combined-notes rows', () => {
    const rows = rowsFor();
    expect(rows.find((r) => r.field === 'phone')).toMatchObject({ kind: 'filled-in', result: '5551234' });
    expect(rows.find((r) => r.field === 'location')).toMatchObject({ kind: 'kept', result: 'Dorm A' });
    expect(rows.find((r) => r.field === 'tags')).toMatchObject({ kind: 'merged', added: ['B'] });
    expect(rows.find((r) => r.field === 'notes')).toMatchObject({ kind: 'merged' });
  });

  it('labels identical fields as same', () => {
    const rows = diffCombineFields(
      { ...kept, email: 'a@x.com' } as Contact,
      { ...combinedIn, email: 'a@x.com' } as Contact,
      mergeContactProfiles({ ...kept, email: 'a@x.com' } as Contact, { ...combinedIn, email: 'a@x.com' } as Contact),
    );
    expect(rows.find((r) => r.field === 'email')).toMatchObject({ kind: 'same' });
  });

  it('flags a conflicting name as a pick with the kept result by default', () => {
    const rows = rowsFor();
    expect(rows.find((r) => r.field === 'name')).toMatchObject({
      kind: 'pick',
      kept: 'Survivor',
      combinedIn: 'Duplicate',
      result: 'Survivor',
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

  it('writes the merged profile and stamps the update', () => {
    const plan = buildCombinePlan(kept, combinedIn, EMPTY_REFS, META);
    expect(plan.keptId).toBe('s1');
    expect(plan.combinedInId).toBe('d1');
    expect(plan.keptData.name).toBe('Kept');
    expect(plan.keptData.phone).toBe('');
    expect(plan.keptData.updatedAt).toBe(META.now);
    expect(plan.keptData.updatedBy).toBe('u1');
    expect(plan.keptData).not.toHaveProperty('role');
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

  it('drops the duplicate kept id a visit rewrite would create', () => {
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
    const keptPick = mergeContactProfiles(kept, combinedIn);
    expect(keptPick.name).toBe('Kept Name');

    const combinedInPick = mergeContactProfiles(kept, combinedIn, {
      fields: { name: 'combined-in' as const },
    });
    expect(combinedInPick.name).toBe('In Name');
  });

  it('keeps one side of the notes or both', () => {
    expect(mergeContactProfiles(kept, combinedIn).notes).toContain('kept notes');
    expect(mergeContactProfiles(kept, combinedIn).notes).toContain('in notes');
    expect(mergeContactProfiles(kept, combinedIn, { notes: 'kept' }).notes).toBe('kept notes');
    expect(mergeContactProfiles(kept, combinedIn, { notes: 'combined-in' }).notes).toBe('in notes');
  });

  it('takes first added and added by from the earlier record', () => {
    const merged = mergeContactProfiles(kept, combinedIn);
    expect(merged.createdAt).toBe('2026-01-01T00:00:00.000Z');
    expect(merged.addedBy).toBe('u-earlier');
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

    const merged = mergeContactProfiles(keptTs, combinedInTs);
    expect(merged.addedBy).toBe('u-older');
    expect(merged.createdAt).toEqual({ _seconds: 1735689600, nanoseconds: 0 });
  });

  it('takes last contacted and last seen from the later record', () => {
    const merged = mergeContactProfiles(kept, combinedIn);
    expect(merged.lastSeen).toBe('2026-04-01');
    expect(merged.lastContactedDate).toBe('2026-05-01');
  });

  it('merges interests, story links and the legacy attendance map', () => {
    const merged = mergeContactProfiles(kept, combinedIn) as Contact & {
      attendance?: Record<string, unknown>;
    };
    expect(merged.interests).toEqual(['music', 'sports']);
    expect(merged.storyMessageIds).toEqual(['m1', 'm2']);
    expect(merged.attendance).toEqual({ e1: true, e2: true });
  });

  it('lets the kept contact win per event in the legacy attendance map', () => {
    const shared = { ...combinedIn, attendance: { e1: 'absent', e3: true } } as unknown as Contact;
    const merged = mergeContactProfiles(kept, shared) as Contact & {
      attendance?: Record<string, unknown>;
    };
    expect(merged.attendance).toEqual({ e1: true, e3: true });
  });

  it('labels every row kind, including picks, earlier wins and latest wins', () => {
    const merged = mergeContactProfiles(kept, combinedIn);
    const rows = diffCombineFields(kept, combinedIn, merged);
    const byField = (f: string) => rows.find((r) => r.field === f);

    expect(byField('name')).toMatchObject({ kind: 'pick', result: 'Kept Name' });
    expect(byField('location')).toMatchObject({ kind: 'kept' });
    expect(byField('stage')).toMatchObject({ kind: 'pick' });
    expect(byField('phone')).toMatchObject({ kind: 'same' });
    expect(byField('notes')).toMatchObject({ kind: 'merged' });
    expect(byField('tags')).toMatchObject({ kind: 'merged', added: ['B'] });
    expect(byField('interests')).toMatchObject({ kind: 'merged', added: ['sports'] });
    expect(byField('storyMessageIds')).toMatchObject({ kind: 'merged', added: ['m2'] });
    expect(byField('createdAt')).toMatchObject({ kind: 'earlier-wins' });
    expect(byField('addedBy')).toMatchObject({ kind: 'earlier-wins', result: 'u-earlier' });
    expect(byField('lastSeen')).toMatchObject({ kind: 'latest-wins', result: '2026-04-01' });
    expect(byField('lastContactedDate')).toMatchObject({ kind: 'latest-wins' });
    expect(byField('attendance')).toMatchObject({ kind: 'merged', added: ['e2'] });
  });

  it('reflects the pick in the result column and the written profile', () => {
    const picks = { fields: { name: 'combined-in' as const } };
    const merged = mergeContactProfiles(kept, combinedIn, picks);
    const rows = diffCombineFields(kept, combinedIn, merged);
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
    expect(plan.referenceReverts).toHaveLength(3);
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
    const current = baseCurrent();
    current.kept.email = 'newer@x.com';

    const plan = buildCombineUndoPlan(record, current);

    expect(plan.keptUpdates.find((u) => u.field === 'email')).toBeUndefined();
    expect(plan.notRestored).toContainEqual({ kind: 'field', label: 'email' });
  });

  it('removes only the merged-list items the combine added, keeping later additions', () => {
    const current = baseCurrent();
    current.kept.tags = ['A', 'B', 'C'];

    const plan = buildCombineUndoPlan(record, current);

    expect(plan.keptUpdates).toContainEqual({ field: 'tags', value: ['A', 'C'] });
  });

  it('reverts a rewritten reference only while it still holds the combine value', () => {
    const current = baseCurrent();
    current.referenceValues[referenceKey('prayers', 'p1', 'contactId')] = 'other';

    const plan = buildCombineUndoPlan(record, current);

    expect(plan.referenceReverts.find((r) => r.collection === 'prayers')).toBeUndefined();
    expect(plan.notRestored).toContainEqual({ kind: 'reference', label: 'prayers.contactId' });
    expect(plan.referenceReverts.find((r) => r.collection === 'tasks')).toBeDefined();
  });

  it('reverts an object-valued reference by deep equality', () => {
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

    expect(plan.referenceReverts).toContainEqual({
      collection: 'events',
      document: 'e1',
      field: 'attendance',
      value: { present: ['d1'], absent: [] },
    });
    expect(plan.notRestored).toEqual([]);
  });
});
