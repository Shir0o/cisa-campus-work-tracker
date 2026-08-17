import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';

const hoisted = vi.hoisted(() => ({
  data: undefined as Record<string, unknown> | undefined,
  onSnapshotError: null as unknown | null,
  setDocReject: false as boolean,
}));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn(() => ({ path: 'settings/season' })),
  onSnapshot: vi.fn((_ref: unknown, cb: (snap: { data: () => unknown }) => void, err?: (e: unknown) => void) => {
    if (hoisted.onSnapshotError) {
      err?.(hoisted.onSnapshotError);
    } else {
      cb({ data: () => hoisted.data });
    }
    return () => {};
  }),
  setDoc: vi.fn(() =>
    hoisted.setDocReject ? Promise.reject(new Error('write failed')) : Promise.resolve(),
  ),
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
  getAutoSemesterAndSchoolYearTags,
  useSeason,
  subscribeSeasonSettings,
  saveSeasonSettings,
} from '../lib/seasons';
import { setDoc } from 'firebase/firestore';

describe('seasons — pure derivation', () => {
  it('maps each month to its season', () => {
    const monthSeason = (m: number) => seasonForDate(new Date(2026, m, 15));
    expect([0, 1].map(monthSeason)).toEqual(['winter', 'winter']);
    expect([2, 3, 4].map(monthSeason)).toEqual(['spring', 'spring', 'spring']);
    expect([5, 6].map(monthSeason)).toEqual(['summer', 'summer']);
    expect([7, 8, 9, 10, 11].map(monthSeason)).toEqual(['fall', 'fall', 'fall', 'fall', 'fall']);
  });

  it('builds the semester + school-year cohort tags', () => {
    // August (month 7) starts the fall semester → 2026-27 school year
    expect(getAutoSemesterAndSchoolYearTags(new Date(2026, 7, 20))).toEqual(['Fall 2026', '2026-27']);
    // December (month 11) is still fall → 2026-27 school year
    expect(getAutoSemesterAndSchoolYearTags(new Date(2026, 11, 5))).toEqual(['Fall 2026', '2026-27']);
    // February (month 1) is in the school year that started the prior fall → 2025-26
    expect(getAutoSemesterAndSchoolYearTags(new Date(2026, 1, 10))).toEqual(['Winter 2026', '2025-26']);
  });

  it('derives a two-digit year and a human cohort label', () => {
    const d = new Date(2026, 9, 1);
    expect(seasonYear(d)).toBe('26');
    expect(seasonLabel('fall', d)).toBe("Fall '26");
  });

  it('builds cohort tags, adding Club Rush only when intake is on', () => {
    const d = new Date(2026, 9, 1);
    expect(seasonTags('fall', false, d)).toEqual(['Fall 2026']);
    expect(seasonTags('fall', true, d)).toEqual(['Fall 2026', 'Club Rush']);
  });
});

describe('useSeason — derived + override', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.data = undefined;
    hoisted.onSnapshotError = null;
    hoisted.setDocReject = false;
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
    expect(result.current.tags).toEqual(['Fall 2026']);
  });

  it('honors an override + club-rush flag from the settings doc', () => {
    hoisted.data = { override: 'spring', clubRush: true };
    const { result } = renderHook(() => useSeason());
    expect(result.current.activeId).toBe('spring');
    expect(result.current.isAuto).toBe(false);
    expect(result.current.clubRush).toBe(true);
    expect(result.current.tags).toEqual(['Spring 2026', 'Club Rush']);
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

  it('resets an override back to the auto season', () => {
    const { result } = renderHook(() => useSeason());
    result.current.resetSeason();
    expect(setDoc).toHaveBeenCalledWith(expect.anything(), { override: null }, { merge: true });
  });
});

describe('seasons — subscription & save error handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.data = undefined;
    hoisted.onSnapshotError = null;
    hoisted.setDocReject = false;
  });

  it('passes subscription errors to the caller-provided handler', () => {
    const onError = vi.fn();
    hoisted.onSnapshotError = new Error('permission denied');
    const cb = vi.fn();
    subscribeSeasonSettings(cb, onError);
    expect(onError).toHaveBeenCalledWith(expect.any(Error));
    expect(cb).not.toHaveBeenCalled();
  });

  it('defaults to console.error for subscription errors when no handler is given', () => {
    const err = new Error('boom');
    hoisted.onSnapshotError = err;
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    subscribeSeasonSettings(vi.fn());
    expect(spy).toHaveBeenCalledWith('season settings subscription error', err);
    spy.mockRestore();
  });

  it('forwards save failures through handleFirestoreError', async () => {
    const { handleFirestoreError, OperationType } = await import('../lib/firebase');
    hoisted.setDocReject = true;
    await saveSeasonSettings({ clubRush: true });
    expect(handleFirestoreError).toHaveBeenCalledWith(
      expect.any(Error),
      OperationType.WRITE,
      'settings/season',
    );
  });
});
