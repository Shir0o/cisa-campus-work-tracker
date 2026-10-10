import { describe, it, expect } from 'vitest';
import { planYearConfirmation, proposeYear, schoolYearOf, yearConfirmationStory, yearsToConfirm } from '../lib/movingUpAYear';
import { contactKind } from '../lib/contactKind';
import { legacyContact } from './fixtures/contacts';

// Local dates: the school year turns over at the start of 1 August where the
// team is, not in UTC.
const july31 = new Date(2026, 6, 31, 23, 59);
const august1 = new Date(2026, 7, 1, 0, 0);

describe('the school year', () => {
  it('turns over on 1 August', () => {
    expect(schoolYearOf(july31)).toBe('2025-26');
    expect(schoolYearOf(august1)).toBe('2026-27');
  });

  it('runs through the spring of the following calendar year', () => {
    expect(schoolYearOf(new Date(2027, 2, 15))).toBe('2026-27');
    expect(schoolYearOf(new Date(2099, 11, 31))).toBe('2099-00');
  });
});

describe('Years to confirm', () => {
  const confirmedFor = (schoolYear: string) => ({
    yearConfirmedFor: schoolYear, yearConfirmedBy: 'ft1', yearConfirmedAt: '2026-08-02T00:00:00.000Z',
  });

  it('counts every student whose year nobody has confirmed', () => {
    const people = [
      { id: 'a', isStudent: true, year: 'Freshman' },
      { id: 'b', isStudent: true },
      { id: 'c', isStudent: false, year: 'Senior' },
      { id: 'd' },
    ];
    expect(yearsToConfirm(people, august1).map((p) => p.id)).toEqual(['a', 'b']);
  });

  it("leaves out someone added since 1 August who gave a year: it is already this school year's", () => {
    const people = [
      { id: 'september-freshman', isStudent: true, year: 'Freshman', createdAt: '2026-09-10T17:00:00.000Z' },
      { id: 'september-no-year', isStudent: true, createdAt: '2026-09-10T17:00:00.000Z' },
      { id: 'last-spring', isStudent: true, year: 'Freshman', createdAt: '2026-03-10T17:00:00.000Z' },
    ];
    expect(yearsToConfirm(people, new Date(2026, 9, 4)).map((p) => p.id)).toEqual(['september-no-year', 'last-spring']);
    // …but by next August that year is as stale as anyone's.
    expect(yearsToConfirm(people, new Date(2027, 7, 1)).map((p) => p.id)).toEqual(['september-freshman', 'september-no-year', 'last-spring']);
  });

  it('reads when someone was added from a Firestore Timestamp too — sign-up stores one', () => {
    const signedUp = legacyContact({
      id: 's',
      isStudent: true,
      year: 'Freshman',
      createdAt: { seconds: Date.UTC(2026, 8, 10) / 1000, nanoseconds: 0 },
    });
    expect(yearsToConfirm([signedUp], new Date(2026, 9, 4))).toEqual([]);
  });

  it('leaves out someone already confirmed for this school year', () => {
    const people = [
      { id: 'done', isStudent: true, year: 'Sophomore', ...confirmedFor('2026-27') },
      { id: 'last-year', isStudent: true, year: 'Freshman', ...confirmedFor('2025-26') },
    ];
    expect(yearsToConfirm(people, august1).map((p) => p.id)).toEqual(['last-year']);
  });

  it('reopens on 1 August: confirmed on 31 July is last school year', () => {
    const person = { id: 'x', isStudent: true, year: 'Junior', ...confirmedFor('2025-26') };
    expect(yearsToConfirm([person], july31)).toEqual([]);
    expect(yearsToConfirm([person], august1)).toEqual([person]);
  });

  it('needs both who and which school year — a half-written marker confirms nothing', () => {
    const person = { id: 'x', isStudent: true, year: 'Junior', yearConfirmedFor: '2026-27' };
    expect(yearsToConfirm([person], august1)).toEqual([person]);
  });
});

describe('the proposal', () => {
  it('moves everyone up one step, and a Senior on to graduating', () => {
    expect(proposeYear({ year: 'Freshman' })).toEqual({ type: 'year', year: 'Sophomore' });
    expect(proposeYear({ year: 'Sophomore' })).toEqual({ type: 'year', year: 'Junior' });
    expect(proposeYear({ year: 'Junior' })).toEqual({ type: 'year', year: 'Senior' });
    expect(proposeYear({ year: 'Senior' })).toEqual({ type: 'graduated' });
  });

  it('proposes nothing where there is no next step: Graduate, Other, off-list text, or no year', () => {
    expect(proposeYear({ year: 'Graduate' })).toBeNull();
    expect(proposeYear({ year: 'Other' })).toBeNull();
    expect(proposeYear({ year: '5th year' })).toBeNull();
    expect(proposeYear({ year: '' })).toBeNull();
    expect(proposeYear({})).toBeNull();
  });

});

describe('confirming a year', () => {
  const by = { by: 'ft1', at: '2026-08-03T10:00:00.000Z', now: august1 };
  const ourOwn = { id: 'o', inChurchLife: true, isStudent: true, year: 'Senior', kindSetBy: 'ft0', kindSetAt: '2025-01-01T00:00:00.000Z' };
  const contact = { id: 'c', inChurchLife: false, isStudent: true, year: 'Senior' };

  it('writes the new year with the marker of who confirmed it, for this school year', () => {
    const update = planYearConfirmation({ ...contact, year: 'Freshman' }, { type: 'year', year: 'Sophomore' }, by);
    expect(update).toEqual({
      year: 'Sophomore',
      yearConfirmedFor: '2026-27', yearConfirmedBy: 'ft1', yearConfirmedAt: '2026-08-03T10:00:00.000Z',
    });
  });

  it('confirms the same year without rewriting it', () => {
    const update = planYearConfirmation({ ...contact, year: '5th year' }, { type: 'year', year: '5th year' }, by);
    expect(update).not.toHaveProperty('year');
    expect(update.yearConfirmedFor).toBe('2026-27');
  });

  it('takes a confirmed person off Years to confirm for the rest of the school year', () => {
    const person = { ...contact, year: 'Junior' };
    const after = { ...person, ...planYearConfirmation(person, { type: 'year', year: 'Senior' }, by) };
    expect(yearsToConfirm([after], new Date(2027, 6, 31))).toEqual([]);
    expect(yearsToConfirm([after], new Date(2027, 7, 1))).toEqual([after]);
  });

  it('graduating an Our own makes them a Local saint, stamped by whoever confirmed it, with no year', () => {
    const update = planYearConfirmation(ourOwn, { type: 'graduated' }, by);
    expect(update).toEqual({ isStudent: false, year: '', kindSetBy: 'ft1', kindSetAt: '2026-08-03T10:00:00.000Z' });
    expect(contactKind(ourOwn)).toBe('our-own');
    expect(contactKind({ ...ourOwn, ...update })).toBe('local-saint');
  });

  it('graduating a Contact leaves them a Contact, no longer a student', () => {
    const after = { ...contact, ...planYearConfirmation(contact, { type: 'graduated' }, by) };
    expect(contactKind(after)).toBe('contact');
    expect(after.isStudent).toBe(false);
    expect(yearsToConfirm([after], august1)).toEqual([]);
  });
});

describe('what the story records', () => {
  const kindLabel = (k: string) => ({ 'our-own': 'Our own', 'local-saint': 'Local saint', contact: 'Contact' })[k] ?? k;

  it('records a year change', () => {
    expect(yearConfirmationStory({ year: 'Freshman' }, { type: 'year', year: 'Sophomore' }, kindLabel))
      .toBe('year: "Freshman" → "Sophomore"');
  });

  it('records nothing when the year stays the same', () => {
    expect(yearConfirmationStory({ year: 'Junior' }, { type: 'year', year: 'Junior' }, kindLabel)).toBe('');
  });

  it('records a graduation, and the kind change when there is one', () => {
    expect(yearConfirmationStory({ inChurchLife: true, isStudent: true, year: 'Senior' }, { type: 'graduated' }, kindLabel))
      .toBe('graduated or left school\nkind: "Our own" → "Local saint"');
    expect(yearConfirmationStory({ inChurchLife: false, isStudent: true, year: 'Senior' }, { type: 'graduated' }, kindLabel))
      .toBe('graduated or left school');
  });
});
