import { describe, it, expect } from 'vitest';
import {
  seasonForDate,
  seasonLabel,
  seasonTags,
  seasonYear,
} from '../src/seasons';

describe('seasons', () => {
  it('derives the season from the month', () => {
    expect(seasonForDate(new Date(2026, 0, 15))).toBe('winter'); // Jan
    expect(seasonForDate(new Date(2026, 3, 15))).toBe('spring'); // Apr
    expect(seasonForDate(new Date(2026, 6, 15))).toBe('summer'); // Jul
    expect(seasonForDate(new Date(2026, 7, 15))).toBe('fall'); // Aug
    expect(seasonForDate(new Date(2026, 9, 15))).toBe('fall'); // Oct
    expect(seasonForDate(new Date(2026, 11, 15))).toBe('fall'); // Dec
  });

  it('formats a two-digit cohort year', () => {
    expect(seasonYear(new Date(2026, 8, 1))).toBe('26');
    expect(seasonLabel('fall', new Date(2026, 8, 1))).toBe("Fall '26");
  });

  it('builds cohort tags, adding Club Rush when active', () => {
    const d = new Date(2026, 8, 1);
    expect(seasonTags('fall', false, d)).toEqual(['Fall 2026']);
    expect(seasonTags('fall', true, d)).toEqual(['Fall 2026', 'Club Rush']);
  });
});
