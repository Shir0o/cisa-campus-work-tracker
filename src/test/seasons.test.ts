import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';

const hoisted = vi.hoisted(() => ({ data: undefined as Record<string, unknown> | undefined }));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn(() => ({ path: 'settings/season' })),
  onSnapshot: vi.fn((_ref: unknown, cb: (snap: { data: () => unknown }) => void) => {
    cb({ data: () => hoisted.data });
    return () => {};
  }),
  setDoc: vi.fn(() => Promise.resolve()),
}));

vi.mock('../lib/firebase', () => ({
  db: {},
  handleFirestoreError: vi.fn(),
  OperationType: { WRITE: 'WRITE' },
}));

import {
  seasonForDate,
  seasonYear,
  seasonLabel,
  seasonTags,
  useSeason,
} from '../lib/seasons';
import { setDoc } from 'firebase/firestore';

describe('seasons — pure derivation', () => {
  it('maps each month to its season', () => {
    const monthSeason = (m: number) => seasonForDate(new Date(2026, m, 15));
    expect([0, 1, 11].map(monthSeason)).toEqual(['winter', 'winter', 'winter']);
    expect([2, 3, 4].map(monthSeason)).toEqual(['spring', 'spring', 'spring']);
    expect([5, 6, 7].map(monthSeason)).toEqual(['summer', 'summer', 'summer']);
    expect([8, 9, 10].map(monthSeason)).toEqual(['fall', 'fall', 'fall']);
  });

  it('derives a two-digit year and a human cohort label', () => {
    const d = new Date(2026, 9, 1);
    expect(seasonYear(d)).toBe('26');
    expect(seasonLabel('fall', d)).toBe("Fall '26");
  });

  it('builds cohort tags, adding Club Rush only when intake is on', () => {
    const d = new Date(2026, 9, 1);
    // seasonTags uses the current year via seasonLabel(now); pin the clock so it's stable.
    vi.useFakeTimers();
    vi.setSystemTime(d);
    expect(seasonTags('fall', false)).toEqual(["Fall '26"]);
    expect(seasonTags('fall', true)).toEqual(["Fall '26", 'Club Rush']);
    vi.useRealTimers();
  });
});

describe('useSeason — derived + override', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.data = undefined;
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 15)); // October → fall
  });
  afterEach(() => vi.useRealTimers());

  it('falls back to the auto season when no override is set', () => {
    const { result } = renderHook(() => useSeason());
    expect(result.current.autoId).toBe('fall');
    expect(result.current.activeId).toBe('fall');
    expect(result.current.isAuto).toBe(true);
    expect(result.current.clubRush).toBe(false);
    expect(result.current.label).toBe("Fall '26");
    expect(result.current.tags).toEqual(["Fall '26"]);
  });

  it('honors an override + club-rush flag from the settings doc', () => {
    hoisted.data = { override: 'spring', clubRush: true };
    const { result } = renderHook(() => useSeason());
    expect(result.current.activeId).toBe('spring');
    expect(result.current.isAuto).toBe(false);
    expect(result.current.clubRush).toBe(true);
    expect(result.current.tags).toEqual(["Spring '26", 'Club Rush']);
  });

  it('writes null override when set back to the auto season', () => {
    const { result } = renderHook(() => useSeason());
    result.current.setSeason('fall'); // == auto → stored as null
    expect(setDoc).toHaveBeenCalledWith(expect.anything(), { override: null }, { merge: true });
    result.current.setSeason('winter');
    expect(setDoc).toHaveBeenLastCalledWith(expect.anything(), { override: 'winter' }, { merge: true });
  });

  it('toggles club rush through the store', () => {
    const { result } = renderHook(() => useSeason());
    result.current.toggleClubRush();
    expect(setDoc).toHaveBeenCalledWith(expect.anything(), { clubRush: true }, { merge: true });
  });
});
