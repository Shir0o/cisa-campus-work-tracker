/**
 * The paging contract for Looking back (#1828).
 *
 * Every number on the screen used to be computed from the loaded window, and
 * "Show older moments" was offered whenever the window was full — so a record
 * of exactly one page offered a second page that came back empty. The rule is
 * now: a short page is the end, and a full page is only the end when the
 * record's own count says so.
 */
import { describe, it, expect } from 'vitest';
import { HISTORY_PAGE_SIZE, historyHasMore } from '../../packages/core/src/history';

describe('historyHasMore (#1828)', () => {
  it('asks for one page of 100 moments', () => {
    expect(HISTORY_PAGE_SIZE).toBe(100);
  });

  it('a short page is the end of the record, whatever the count says', () => {
    // A lagging count must not keep offering a page Firestore has already said
    // is empty.
    expect(historyHasMore(40, 100, 250)).toBe(false);
    expect(historyHasMore(0, 100, 3412)).toBe(false);
  });

  it('a full page is not the end when the record is longer', () => {
    expect(historyHasMore(100, 100, 3412)).toBe(true);
  });

  it('a record of exactly one page offers nothing more', () => {
    expect(historyHasMore(100, 100, 100)).toBe(false);
  });

  it('a widened window that comes back short is the end', () => {
    expect(historyHasMore(150, 200, 3412)).toBe(false);
  });

  it('keeps the door open when the count could not be read', () => {
    expect(historyHasMore(100, 100, null)).toBe(true);
  });
});
