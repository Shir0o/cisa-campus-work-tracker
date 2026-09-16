import { describe, it, expect } from 'vitest';
import {
  planYourSheepMigration,
  type CarerMigrationRow,
  type SheepPrefDoc,
} from '../lib/yourSheepMigration';

const pref = (uid: string, personalContactIds: string[]): SheepPrefDoc => ({ uid, personalContactIds });

const contact = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  createdBy: 'u1',
  addedBy: undefined,
  owner: 'u1',
  coCreators: [],
  founders: ['u1'],
  ...extra,
});

describe('planYourSheepMigration (#1051)', () => {
  it('records every reader holding a person onto that contact', () => {
    const rows = planYourSheepMigration(
      [pref('reader-a', ['c1', 'c2']), pref('reader-b', ['c1'])],
      [contact('c1'), contact('c2')],
    );
    expect(rows).toHaveLength(2);
    const byId = Object.fromEntries(rows.map((r) => [r.contactId, r]));
    expect(byId['c1']).toEqual({
      contactId: 'c1',
      addCarers: ['reader-a', 'reader-b'],
      visibleToTo: ['u1', 'reader-a', 'reader-b'],
    });
    expect(byId['c2']).toEqual({
      contactId: 'c2',
      addCarers: ['reader-a'],
      visibleToTo: ['u1', 'reader-a'],
    });
  });

  it('keeps a reader who is already a carer, and does not duplicate them', () => {
    const rows = planYourSheepMigration(
      [pref('reader-a', ['c1'])],
      [contact('c1', { carers: ['reader-a', 'reader-b'], visibleTo: ['u1', 'reader-a', 'reader-b'] })],
    );
    // Carers and access list already match: a re-run writes nothing.
    expect(rows).toEqual([]);
  });

  it('repairs a stale access list that dropped a carer even when carers are already complete', () => {
    const rows = planYourSheepMigration(
      [pref('reader-a', ['c1'])],
      [contact('c1', { carers: ['reader-a'], visibleTo: ['u1'] })],
    );
    expect(rows).toEqual([
      { contactId: 'c1', addCarers: [], visibleToTo: ['u1', 'reader-a'] },
    ]);
  });

  it('preserves the existing access list when adding carers', () => {
    const rows = planYourSheepMigration(
      [pref('reader-a', ['c1'])],
      [contact('c1', { coCreators: ['u9'], founders: ['u1', 'u2'], carers: ['u8'] })],
    );
    expect(rows[0].visibleToTo).toEqual(['u1', 'u9', 'u2', 'u8', 'reader-a']);
  });

  it('leaves a contact nobody holds untouched', () => {
    const rows = planYourSheepMigration([pref('reader-a', ['c-other'])], [contact('c1')]);
    expect(rows).toEqual([]);
  });

  it('skips a sheeped contact that no longer exists without losing the run', () => {
    const rows = planYourSheepMigration([pref('reader-a', ['c-ghost', 'c1'])], [contact('c1')]);
    expect(rows).toEqual([
      { contactId: 'c1', addCarers: ['reader-a'], visibleToTo: ['u1', 'reader-a'] },
    ]);
  });

  it('drops empty personalContactIds lists', () => {
    const rows = planYourSheepMigration(
      [pref('reader-a', []), pref('reader-b', ['c1'])],
      [contact('c1')],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].addCarers).toEqual(['reader-b']);
  });
});