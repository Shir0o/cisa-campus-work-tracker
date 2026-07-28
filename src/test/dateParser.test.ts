import { describe, it, expect } from 'vitest';
import { parseSmartDate } from '../lib/dateParser';

describe('parseSmartDate', () => {
  // Use a fixed reference date for deterministic testing: Tuesday, 2026-07-28
  const refDate = new Date(2026, 6, 28, 10, 0, 0); // Month is 0-indexed (6 = July)

  it('returns null isoDate for empty or plain text without dates', () => {
    const res1 = parseSmartDate('', refDate);
    expect(res1.isoDate).toBeNull();
    expect(res1.cleanTitle).toBe('');

    const res2 = parseSmartDate('Buy groceries and clean room', refDate);
    expect(res2.isoDate).toBeNull();
    expect(res2.cleanTitle).toBe('Buy groceries and clean room');
  });

  it('parses relative dates like "tomorrow"', () => {
    const res = parseSmartDate('Call client tomorrow', refDate);
    expect(res.isoDate).toBe('2026-07-29');
    expect(res.cleanTitle).toBe('Call client');
  });

  it('parses dates with prepositions like "by next Friday"', () => {
    const res = parseSmartDate('Submit report by next Friday', refDate);
    // 2026-07-28 is Tuesday. "this Friday" is 2026-07-31; "next Friday" is 2026-08-07.
    expect(res.isoDate).toBe('2026-08-07');
    expect(res.cleanTitle).toBe('Submit report');
  });

  it('parses dates with prepositions like "by Friday"', () => {
    const res = parseSmartDate('Submit report by Friday', refDate);
    expect(res.isoDate).toBe('2026-07-31');
    expect(res.cleanTitle).toBe('Submit report');
  });

  it('parses explicit calendar dates like "Aug 15" or "8/15"', () => {
    const res = parseSmartDate('Review design on Aug 15', refDate);
    expect(res.isoDate).toBe('2026-08-15');
    expect(res.cleanTitle).toBe('Review design');
  });

  it('parses dates with "due" keyword', () => {
    const res = parseSmartDate('Finalize budget due 2026-08-01', refDate);
    expect(res.isoDate).toBe('2026-08-01');
    expect(res.cleanTitle).toBe('Finalize budget');
  });

  it('preserves full text as cleanTitle if removing matched date leaves string empty', () => {
    const res = parseSmartDate('tomorrow', refDate);
    expect(res.isoDate).toBe('2026-07-29');
    expect(res.cleanTitle).toBe('tomorrow');
  });
});
