import { describe, it, expect } from 'vitest';
import { planAttendanceMigration } from '../lib/attendanceMigration';
import type { Contact, Gathering } from '../types';

type Legacy = Record<string, boolean | 'absent' | 'late'>;

const contact = (id: string, attendance: Legacy = {}): Contact =>
  ({ id, name: id, role: 'Student', location: '', email: '', phone: '', stage: '', lastSeen: '', initials: id, attendance } as unknown as Contact);

const gathering = (id: string, over: Record<string, unknown> = {}): Gathering =>
  ({ id, name: id, date: '2026-09-09', order: 0, createdAt: '2026-09-01', ...over } as unknown as Gathering);

describe('planAttendanceMigration', () => {
  it('derives present/absent from the legacy Contact maps, folding late into present', () => {
    const contacts = [
      contact('c1', { e1: true, e2: 'late', e3: 'absent' }),
      contact('c2', { e1: 'absent' }),
    ];
    const events = [gathering('e1'), gathering('e2'), gathering('e3')];
    const plan = planAttendanceMigration(contacts, events);
    const byId = new Map(plan.expected.map((r) => [r.id, r.attendance]));
    expect(byId.get('e1')).toEqual({ present: ['c1'], absent: ['c2'] });
    expect(byId.get('e2')).toEqual({ present: ['c1'], absent: [] });
    expect(byId.get('e3')).toEqual({ present: [], absent: ['c1'] });
    expect(plan.updates).toHaveLength(3);
  });

  it('turns a stamp-only Gathering into an empty record', () => {
    const stamped = gathering('e1', { attendanceTakenAt: '2026-09-09T20:00:00Z' });
    const plan = planAttendanceMigration([], [stamped]);
    expect(plan.expected).toEqual([{ id: 'e1', attendance: { present: [], absent: [] } }]);
    expect(plan.stampedIds).toEqual(['e1']);
    expect(plan.updates[0].fromStampsOnly).toBe(true);
  });

  it('reports orphaned entries and leaves them out of the records', () => {
    const plan = planAttendanceMigration([contact('c1', { gone: true })], [gathering('e1')]);
    expect(plan.orphaned).toEqual([{ contactId: 'c1', gatheringId: 'gone' }]);
    expect(plan.updates).toHaveLength(0);
  });

  it('skips records that already match, but still expects them', () => {
    const events = [gathering('e1', { attendance: { present: ['c1'], absent: [] } })];
    const plan = planAttendanceMigration([contact('c1', { e1: true })], events);
    expect(plan.expected).toHaveLength(1);
    expect(plan.updates).toHaveLength(0);
    expect(plan.legacyContactIds).toEqual(['c1']);
  });
});
