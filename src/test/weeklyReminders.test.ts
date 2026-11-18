import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db: any, coll: string, id: string) => ({ path: `${coll}/${id}` })),
  onSnapshot: vi.fn(),
  setDoc: vi.fn(() => Promise.resolve()),
  updateDoc: vi.fn(() => Promise.resolve()),
}));

vi.mock('../lib/firebase', () => ({
  db: {},
  handleFirestoreError: vi.fn(),
  OperationType: { WRITE: 'WRITE' },
}));

import { doc, onSnapshot, setDoc, updateDoc } from 'firebase/firestore';
import { handleFirestoreError } from '../lib/firebase';
import {
  DEFAULT_REMINDER_SCHEDULE,
  normalizeReminderSchedule,
  reminderTimeSummary,
  subscribeReminderSchedule,
  saveReminderSchedule,
  saveWeeklyReminderOff,
} from '../lib/weeklyReminders';

describe('normalizeReminderSchedule', () => {
  it('falls back to the defaults for anything missing or malformed', () => {
    expect(normalizeReminderSchedule(undefined)).toEqual(DEFAULT_REMINDER_SCHEDULE);
    expect(normalizeReminderSchedule('nonsense')).toEqual(DEFAULT_REMINDER_SCHEDULE);
    expect(
      normalizeReminderSchedule({ fullTimers: { days: 'tue', hour: '5' } }),
    ).toEqual(DEFAULT_REMINDER_SCHEDULE);
  });

  it('keeps a valid stored schedule, filtering bad days and clamping the hour', () => {
    const schedule = normalizeReminderSchedule({
      fullTimers: { days: [1, 9, -1, 3], hour: 42 },
      teams: { yp: { days: [2], hour: 18 }, east: { days: [], hour: 9 } },
    });
    expect(schedule.fullTimers).toEqual({ days: [1, 3], hour: 23 });
    expect(schedule.teams.yp).toEqual({ days: [2], hour: 18 });
    expect(schedule.teams.east).toEqual({ days: [], hour: 9 });
    expect(schedule.teams.campus).toEqual(DEFAULT_REMINDER_SCHEDULE.teams.campus);
  });

  it('uses a safe empty time for a team with no stored time', () => {
    const schedule = normalizeReminderSchedule({ fullTimers: { days: [2], hour: 17 }, teams: { east: null } });
    expect(schedule.teams.east).toEqual({ days: [], hour: 18 });
  });
});

describe('reminderTimeSummary', () => {
  it('reads days and a 12-hour time', () => {
    expect(reminderTimeSummary({ days: [2, 3], hour: 17 })).toBe('Tue, Wed · 5 pm');
    expect(reminderTimeSummary({ days: [], hour: 0 })).toBe('No days · 12 am');
    expect(reminderTimeSummary({ days: [0], hour: 12 })).toBe('Sun · 12 pm');
  });
});

describe('Firestore reads and writes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('normalizes what the schedule subscription returns', () => {
    const cb = vi.fn();
    vi.mocked(onSnapshot).mockImplementation((_ref: any, callback: any) => {
      callback({ data: () => ({ fullTimers: { days: [1], hour: 9 } }) });
      return vi.fn();
    });
    subscribeReminderSchedule(cb);
    expect(cb).toHaveBeenCalledWith(
      expect.objectContaining({ fullTimers: { days: [1], hour: 9 } }),
    );
  });

  it('tolerates a snapshot with no data()', () => {
    const cb = vi.fn();
    vi.mocked(onSnapshot).mockImplementation((_ref: any, callback: any) => {
      callback({ docs: [], size: 0 });
      return vi.fn();
    });
    subscribeReminderSchedule(cb);
    expect(cb).toHaveBeenCalledWith(DEFAULT_REMINDER_SCHEDULE);
  });

  it('reports subscription errors', () => {
    const cb = vi.fn();
    const onError = vi.fn();
    vi.mocked(onSnapshot).mockImplementation((_ref: any, _callback: any, error: any) => {
      error(new Error('boom'));
      return vi.fn();
    });
    subscribeReminderSchedule(cb, onError);
    expect(onError).toHaveBeenCalled();
    expect(cb).not.toHaveBeenCalled();
  });

  it('logs subscription errors when no handler is given', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(onSnapshot).mockImplementation((_ref: any, _callback: any, error: any) => {
      error(new Error('boom'));
      return vi.fn();
    });
    subscribeReminderSchedule(vi.fn());
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('writes the schedule and the personal switch', async () => {
    await saveReminderSchedule(DEFAULT_REMINDER_SCHEDULE);
    expect(setDoc).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'settings/reminder_schedule' }),
      DEFAULT_REMINDER_SCHEDULE,
    );

    await saveWeeklyReminderOff('u1', true);
    expect(updateDoc).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'users/u1' }),
      { weeklyRemindersOff: true },
    );
  });

  it('surfaces write failures to handleFirestoreError', async () => {
    vi.mocked(setDoc).mockRejectedValueOnce(new Error('denied'));
    await saveReminderSchedule(DEFAULT_REMINDER_SCHEDULE);
    expect(handleFirestoreError).toHaveBeenCalledWith(
      expect.any(Error),
      'WRITE',
      'settings/reminder_schedule',
    );

    vi.mocked(updateDoc).mockRejectedValueOnce(new Error('denied'));
    await saveWeeklyReminderOff('u1', false);
    expect(handleFirestoreError).toHaveBeenCalledWith(
      expect.any(Error),
      'WRITE',
      'users/u1 weeklyRemindersOff',
    );
  });

  it('resolves the schedule document path', () => {
    saveReminderSchedule(DEFAULT_REMINDER_SCHEDULE);
    expect(doc).toHaveBeenCalledWith({}, 'settings', 'reminder_schedule');
  });
});
