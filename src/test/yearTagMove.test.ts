import { describe, it, expect } from 'vitest';
import { planYearTagMove, YEAR_TAGS } from '../lib/yearTagMove';

// One-off move of year tags into `year` (#1348). Pure, idempotent: applying a
// row and planning again yields nothing.
describe('planYearTagMove', () => {
  it('lists the five year words, not Other', () => {
    expect(YEAR_TAGS).toEqual(['Freshman', 'Sophomore', 'Junior', 'Senior', 'Graduate']);
  });

  it('moves a year tag into an empty year and removes the tag', () => {
    const { rows } = planYearTagMove([{ id: 'a', tags: ['Freshman', 'Gospel'] }]);
    expect(rows).toEqual([{ id: 'a', year: 'Freshman', tags: ['Gospel'], removed: ['Freshman'] }]);
  });

  it('matches case-insensitively and writes the canonical case', () => {
    const { rows } = planYearTagMove([{ id: 'a', tags: ['sOPHomore '] }]);
    expect(rows).toEqual([{ id: 'a', year: 'Sophomore', tags: [], removed: ['sOPHomore '] }]);
  });

  it('treats a blank year as empty', () => {
    const { rows } = planYearTagMove([{ id: 'a', year: '  ', tags: ['Senior'] }]);
    expect(rows[0].year).toBe('Senior');
    const { rows: nullRows } = planYearTagMove([{ id: 'b', year: null, tags: ['Senior'] }]);
    expect(nullRows[0].year).toBe('Senior');
  });

  it('only removes the tag when year is already set, and never writes year', () => {
    const { rows } = planYearTagMove([{ id: 'a', year: 'Junior', tags: ['Junior', 'BFA'] }]);
    expect(rows).toEqual([{ id: 'a', tags: ['BFA'], removed: ['Junior'] }]);
    expect(rows[0]).not.toHaveProperty('year');
  });

  it('keeps an existing year even when the tag disagrees', () => {
    const { rows } = planYearTagMove([{ id: 'a', year: 'Senior', tags: ['Freshman'] }]);
    expect(rows).toEqual([{ id: 'a', tags: [], removed: ['Freshman'] }]);
  });

  it('leaves non-year tags and contacts without year tags alone', () => {
    const { rows } = planYearTagMove([
      { id: 'a', tags: ['Gospel', 'Club Rush', '1st year', 'Graduate student'] },
      { id: 'b', tags: [] },
      { id: 'c' },
      { id: 'd', year: 'Senior', tags: null },
    ]);
    expect(rows).toEqual([]);
  });

  it('skips and reports a contact whose tags name different years and who has no year', () => {
    const plan = planYearTagMove([{ id: 'a', tags: ['Freshman', 'Senior'] }]);
    expect(plan.rows).toEqual([]);
    expect(plan.ambiguous).toEqual([{ id: 'a', tags: ['Freshman', 'Senior'] }]);
  });

  it('treats repeats of one year as one year', () => {
    const { rows, ambiguous } = planYearTagMove([{ id: 'a', tags: ['Senior', 'senior', 'BFA'] }]);
    expect(ambiguous).toEqual([]);
    expect(rows).toEqual([{ id: 'a', year: 'Senior', tags: ['BFA'], removed: ['Senior', 'senior'] }]);
  });

  it('removes every year tag when year is set', () => {
    const { rows } = planYearTagMove([{ id: 'a', year: 'Senior', tags: ['Freshman', 'Senior'] }]);
    expect(rows).toEqual([{ id: 'a', tags: [], removed: ['Freshman', 'Senior'] }]);
  });

  it('is idempotent: planning the applied result changes nothing', () => {
    const contacts = [
      { id: 'a', tags: ['Freshman', 'Gospel'] as string[], year: undefined as string | undefined },
      { id: 'b', year: 'Junior', tags: ['Junior'] },
      { id: 'c', tags: ['BFA'] },
    ];
    const { rows } = planYearTagMove(contacts);
    const applied = contacts.map((c) => {
      const row = rows.find((r) => r.id === c.id);
      return row ? { ...c, year: row.year ?? c.year, tags: row.tags } : c;
    });
    expect(planYearTagMove(applied)).toEqual({ rows: [], ambiguous: [] });
  });
});
