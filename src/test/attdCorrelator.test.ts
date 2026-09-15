import { describe, expect, it } from 'vitest';
import {
  buildAttendancePreview,
  correlateAttendees,
  dayNameToNumber,
  detectConflicts,
  nameSimilarity,
  normalizeName,
  resolveRhythmForEvent,
} from '../lib/sync/attdCorrelator';
import type {
  AttdEventMapping,
  AttdSyncPayload,
  AttendeeAlias,
} from '../lib/sync/attdCorrelator';
import type { Contact, Gathering, Rhythm } from '../types';

const contact = (id: string, name: string): Contact => ({
  id,
  name,
  role: 'Student',
  location: '',
  email: '',
  phone: '',
  stage: 'Lead',
  lastSeen: '',
  initials: name,
});

const rhythm = (id: string, name: string, days: number[] = [3]): Rhythm => ({
  id,
  name,
  cadence: { type: 'weekly', days },
  roster: [],
  termStart: '2026-09-01',
  termEnd: '2026-12-31',
  createdAt: '2026-09-01T00:00:00.000Z',
  createdById: 'u1',
});

const gathering = (id: string, rhythmId: string, date: string, name: string): Gathering => ({
  id,
  name,
  date,
  order: 0,
  rhythmId,
  createdAt: '2026-09-01T00:00:00.000Z',
});

const basePayload = (overrides: Partial<AttdSyncPayload> = {}): AttdSyncPayload => ({
  attdEventId: 'event-1',
  eventName: 'Wednesday Bible Study',
  frequency: 'Weekly',
  repeatingDays: ['Wednesday'],
  sessionDate: '2026-09-16',
  records: [],
  ...overrides,
});

describe('name helpers', () => {
  it('normalizes case, punctuation, and accents', () => {
    expect(normalizeName("  Jose  O'Brien-Smith ")).toBe('jose o brien smith');
  });

  it('scores exact names and surname-initial variants highly', () => {
    expect(nameSimilarity('Alex Chen', 'Alex Chen')).toBe(1);
    expect(nameSimilarity('Alex Chen', 'Alexander Chen')).toBeGreaterThanOrEqual(0.9);
    expect(nameSimilarity('Alex Chen', 'Jordan Patel')).toBeLessThan(0.5);
  });

  it('maps full, short, and numeric day names', () => {
    expect(dayNameToNumber('Wednesday')).toBe(3);
    expect(dayNameToNumber('wed')).toBe(3);
    expect(dayNameToNumber(4)).toBe(4);
    expect(dayNameToNumber('nonday')).toBeNull();
  });
});

describe('resolveRhythmForEvent', () => {
  const study = rhythm('r1', 'Wednesday Bible Study', [3]);
  const college = rhythm('r2', 'Thursday College Meeting', [4]);
  const sep16 = gathering('g1', 'r1', '2026-09-16', 'Wednesday Bible Study');

  it('prefers a remembered mapping even when today would not cadence-match', () => {
    const mappings: AttdEventMapping[] = [
      { attdEventId: 'event-old', rhythmId: 'r2', updatedAt: '2026-09-01T00:00:00.000Z' },
    ];
    const result = resolveRhythmForEvent({
      payload: basePayload({ attdEventId: 'event-old', repeatingDays: ['Friday'] }),
      rhythms: [study, college],
      mappings,
      gatherings: [],
    });
    expect(result.source).toBe('mapping');
    expect(result.rhythm?.id).toBe('r2');
  });

  it('falls back to cadence plus title similarity', () => {
    const result = resolveRhythmForEvent({
      payload: basePayload(),
      rhythms: [college, study],
      mappings: [],
      gatherings: [sep16],
    });
    expect(result.source).toBe('cadence');
    expect(result.rhythm?.id).toBe('r1');
    expect(result.gathering?.id).toBe('g1');
  });

  it('returns the gathering for the resolved rhythm and session date', () => {
    const wrongWeek = gathering('g0', 'r1', '2026-09-09', 'Wednesday Bible Study');
    const result = resolveRhythmForEvent({
      payload: basePayload(),
      rhythms: [study],
      mappings: [],
      gatherings: [wrongWeek, sep16],
    });
    expect(result.gathering?.id).toBe('g1');
  });

  it('falls back to an exact-date one-off when no rhythm matches', () => {
    const oneOff = { ...gathering('one', 'x', '2026-09-16', 'Welcome BBQ'), rhythmId: undefined };
    const result = resolveRhythmForEvent({
      payload: basePayload({ eventName: 'Welcome BBQ', repeatingDays: [] }),
      rhythms: [study],
      mappings: [],
      gatherings: [oneOff],
    });
    expect(result.rhythm).toBeNull();
    expect(result.gathering?.id).toBe('one');
    expect(result.source).toBe('date');
  });
});

describe('correlateAttendees', () => {
  const alex = contact('c1', 'Alex Chen');
  const jordan = contact('c2', 'Jordan Patel');

  it('links a remembered attd member id at full confidence', () => {
    const aliases: AttendeeAlias[] = [
      { attdMemberId: 'm1', attdName: 'Alex C', contactId: 'c1', updatedAt: '2026-09-01T00:00:00.000Z' },
    ];
    const rows = correlateAttendees({
      records: [{ memberId: 'm1', attendee: 'Alex C', status: 'present' }],
      contacts: [alex, jordan],
      aliases,
    });
    expect(rows[0].contactId).toBe('c1');
    expect(rows[0].matchType).toBe('alias');
    expect(rows[0].confidence).toBe(1);
  });

  it('links an exact normalized name when no member alias exists', () => {
    const rows = correlateAttendees({
      records: [{ memberId: 'm2', attendee: 'alex chen', status: 'late', isLate: true }],
      contacts: [alex, jordan],
      aliases: [],
    });
    expect(rows[0].contactId).toBe('c1');
    expect(rows[0].matchType).toBe('name');
    expect(rows[0].isLate).toBe(true);
  });

  it('suggests a fuzzy contact when the names are close', () => {
    const rows = correlateAttendees({
      records: [{ memberId: 'm3', attendee: 'Alexander Chen', status: 'present' }],
      contacts: [alex, jordan],
      aliases: [],
    });
    expect(rows[0].contactId).toBe('c1');
    expect(rows[0].matchType).toBe('fuzzy');
  });

  it('defaults an unmatched name to a walk-in candidate', () => {
    const rows = correlateAttendees({
      records: [{ attendee: 'Brand New Person', status: 'present' }],
      contacts: [alex, jordan],
      aliases: [],
    });
    expect(rows[0].contactId).toBeNull();
    expect(rows[0].matchType).toBe('new');
  });
});

describe('detectConflicts', () => {
  it('flags a mismatch between an existing CISA mark and the attd mark', () => {
    const withAttendance: Gathering = {
      ...gathering('g1', 'r1', '2026-09-16', 'Wednesday Bible Study'),
      attendance: { present: [], absent: ['c1'] },
    };
    const conflicts = detectConflicts(
      [{ memberId: 'm1', attdName: 'Alex Chen', status: 'present', isLate: false, contactId: 'c1', contactName: 'Alex Chen', matchType: 'alias', confidence: 1 }],
      withAttendance,
    );
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].cisaStatus).toBe('absent');
    expect(conflicts[0].attdStatus).toBe('present');
  });

  it('does not create a conflict for an unmarked contact', () => {
    const unmarked = gathering('g1', 'r1', '2026-09-16', 'Wednesday Bible Study');
    const conflicts = detectConflicts(
      [{ memberId: 'm1', attdName: 'Alex Chen', status: 'present', isLate: false, contactId: 'c1', contactName: 'Alex Chen', matchType: 'new', confidence: 0 }],
      unmarked,
    );
    expect(conflicts).toHaveLength(0);
  });
});

describe('buildAttendancePreview', () => {
  it('assembles matched rows, conflicts, and summary figures', () => {
    const study = rhythm('r1', 'Wednesday Bible Study', [3]);
    const week = {
      ...gathering('g1', 'r1', '2026-09-16', 'Wednesday Bible Study'),
      attendance: { present: [], absent: ['c1'] },
    };
    const aliases: AttendeeAlias[] = [
      { attdMemberId: 'm1', attdName: 'Alex C', contactId: 'c1', updatedAt: '2026-09-01T00:00:00.000Z' },
    ];
    const preview = buildAttendancePreview({
      payload: basePayload({
        records: [
          { memberId: 'm1', attendee: 'Alex C', status: 'present' },
          { attendee: 'Someone New', status: 'late', isLate: true },
        ],
      }),
      contacts: [contact('c1', 'Alex Chen')],
      rhythms: [study],
      mappings: [],
      gatherings: [week],
      aliases,
    });

    expect(preview.rhythmId).toBe('r1');
    expect(preview.gatheringId).toBe('g1');
    expect(preview.stats.total).toBe(2);
    expect(preview.stats.matched).toBe(1);
    expect(preview.stats.walkIns).toBe(1);
    expect(preview.stats.late).toBe(1);
    expect(preview.stats.conflicts).toBe(1);
  });
});
