// Quick add (§26): the server-side parse and merge, independent of Gemini.
// The model call is injected so the mapping from a canned response can be
// pinned: every field the preview shows, and every name match, nothing picked.
import { describe, it, expect, vi } from 'vitest';
import {
  buildQuickAddPrompt,
  resolveQuickAddAccess,
  runQuickAddParse,
  selectQuickAddContacts,
} from '../server/quickAddEngine';

const existing = [
  { id: 'c1', name: 'Jordan Lee' },
  { id: 'c2', name: 'jordan  lee' },
  { id: 'c3', name: 'Jordan Smith' },
  { id: 'c4', name: 'Ama Osei' },
];

const canned = {
  contact: {
    name: 'Jordan Lee',
    phone: '(555) 010-2030',
    email: 'jordan-lee-contact',
    year: 'sophomore',
    step: 'Contact',
    tags: ['Bible study', '  Bible study  ', ''],
  },
  interaction: {
    type: 'meeting',
    when: '2026-11-17',
    notes: 'Met at the club table',
  },
  prayer: ' pray for his exams ',
  reminder: { when: '2026-11-24', text: 'Text Jordan about Bible study' },
};

describe('quick add parse (server module)', () => {
  it('includes the note and the existing names in the prompt', () => {
    const prompt = buildQuickAddPrompt(
      'Met Jordan at the club table, sophomore, wants Bible study, pray for his exams',
      existing,
    );
    expect(prompt).toContain('Met Jordan at the club table, sophomore, wants Bible study, pray for his exams');
    expect(prompt).toContain('Jordan Lee');
    expect(prompt).toContain('"c1"');
  });

  it('maps every field from the model response', async () => {
    const generate = vi.fn().mockResolvedValue(JSON.stringify(canned));
    const result = await runQuickAddParse({ text: 'Met Jordan at the club table', contacts: existing }, generate);

    expect(generate).toHaveBeenCalledTimes(1);
    expect(generate.mock.calls[0][0]).toContain('Met Jordan at the club table');

    expect(result.contact).toEqual({
      name: 'Jordan Lee',
      phone: '(555) 010-2030',
      email: 'jordan-lee-contact',
      year: 'Sophomore',
      step: 'contact',
      tags: ['Bible study'],
    });
    expect(result.interaction).toEqual({
      type: 'meeting',
      when: '2026-11-17',
      notes: 'Met at the club table',
    });
    expect(result.prayer).toBe('pray for his exams');
    expect(result.reminder).toEqual({ when: '2026-11-24', text: 'Text Jordan about Bible study' });
  });

  it('returns every name match, case-insensitively on first and last name, and picks none', async () => {
    const generate = vi.fn().mockResolvedValue(JSON.stringify(canned));
    const result = await runQuickAddParse({ text: 'x', contacts: existing }, generate);

    expect(result.match.map((m) => m.id)).toEqual(['c1', 'c2']);
    // No "chosen" field: the preview makes the person pick one.
    expect(result).not.toHaveProperty('matchedContactId');
    expect(result).not.toHaveProperty('contactId');
  });

  it('matches a first name alone to every person with that first name', async () => {
    const generate = vi.fn().mockResolvedValue(JSON.stringify({ contact: { name: 'Jordan' } }));
    const result = await runQuickAddParse({ text: 'Jordan', contacts: existing }, generate);
    expect(result.match.map((m) => m.id)).toEqual(['c1', 'c2', 'c3']);
  });

  it('returns no name and no match when the note names nobody', async () => {
    const generate = vi.fn().mockResolvedValue(JSON.stringify({ contact: { phone: '555-0100' } }));
    const result = await runQuickAddParse({ text: 'Someone from the quad', contacts: existing }, generate);
    expect(result.contact.name).toBe('');
    expect(result.match).toEqual([]);
  });

  it('drops a year and a step outside their fixed lists', async () => {
    const generate = vi
      .fn()
      .mockResolvedValue(JSON.stringify({ contact: { name: 'Ama Osei', year: 'fourth year', step: 'vetting' } }));
    const result = await runQuickAddParse({ text: 'Ama', contacts: existing }, generate);
    expect(result.contact.year).toBe('');
    expect(result.contact.step).toBe('');
  });

  it('leaves optional parts out when the model returns none', async () => {
    const generate = vi.fn().mockResolvedValue(JSON.stringify({ contact: { name: 'Ama Osei' } }));
    const result = await runQuickAddParse({ text: 'Ama', contacts: existing }, generate);
    expect(result.interaction).toBeUndefined();
    expect(result.prayer).toBeUndefined();
    expect(result.reminder).toBeUndefined();
  });

  it('fails loudly when the model returns something that is not JSON', async () => {
    const generate = vi.fn().mockResolvedValue('not json');
    await expect(runQuickAddParse({ text: 'x', contacts: existing }, generate)).rejects.toThrow(
      /Failed to parse AI response/,
    );
  });
});

// A Trainee may use Quick add, but only sees the people tied to them — the
// same visibleTo scope every other read uses. A Full-timer sees everyone; an
// unapproved account (or a cut role) is refused outright.
describe('quick add caller scope (server module)', () => {
  const directory = [
    { id: 'c1', name: 'Jordan Lee', visibleTo: ['manager1'] },
    { id: 'c2', name: 'Ama Osei', visibleTo: ['manager2'] },
    { id: 'c3', name: 'No tie', visibleTo: [] },
  ];

  it('lets an approved Trainee parse, scoped to the people tied to them', () => {
    const access = resolveQuickAddAccess('manager1', { role: 'manager', approved: true });
    expect(access).toEqual({ allowed: true, uid: 'manager1', seesAll: false });
    expect(selectQuickAddContacts(directory, access).map((c) => c.id)).toEqual(['c1']);
  });

  it('lets an approved Full-timer parse every person', () => {
    const access = resolveQuickAddAccess('admin1', { role: 'admin', approved: true, secondFactor: true });
    expect(access).toEqual({ allowed: true, uid: 'admin1', seesAll: true });
    expect(selectQuickAddContacts(directory, access).map((c) => c.id)).toEqual(['c1', 'c2', 'c3']);
  });

  it('refuses a Full-timer whose sign-in skipped the second factor, like every admin route', () => {
    const access = resolveQuickAddAccess('admin1', { role: 'admin', approved: true, secondFactor: false });
    expect(access.allowed).toBe(false);
    expect(selectQuickAddContacts(directory, access)).toEqual([]);
  });

  it('refuses an unapproved account, a missing user, and a cut role', () => {
    for (const caller of [null, { role: 'manager', approved: false }, { role: 'student', approved: true }]) {
      const access = resolveQuickAddAccess('u1', caller);
      expect(access.allowed).toBe(false);
      expect(selectQuickAddContacts(directory, access)).toEqual([]);
    }
  });
});
