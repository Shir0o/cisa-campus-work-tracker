// queuePrefs tests — locks down the v2 queue-settings store through its public
// seam (QueuePrefsStore + useQueuePrefs). The interesting behavior lives in the
// normalizers (@cisa/core's normalizeQueuePrefs / normalizeOnCampusWindow):
// anything read back off the device or handed in from a picker gets clamped
// field-by-field, and a window that can't be made sense of falls back whole.
// These tests pin the store's part: defaults, persistence keys, hydration,
// emit-on-change, and the signed-out no-op contract of the hook.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, renderHook } from '@testing-library/react-native';
import { QueuePrefsStore, useQueuePrefs } from './queuePrefs';

const prefsKey = (uid: string) => `cisa.m2.prefs.${uid}`;
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

const DEFAULTS = {
  quietDays: 2,
  quietMax: 2,
  prayers: 3,
  dayCap: 8,
  onCampus: { days: [2, 3], from: 12, to: 15 },
};

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
});

describe('QueuePrefsStore.for', () => {
  it('returns the out-of-the-box settings for a uid with nothing stored', () => {
    expect(QueuePrefsStore.for('u1')).toEqual(DEFAULTS);
  });

  it('hydrates stored settings (normalized) and emits to subscribers', async () => {
    const sub = jest.fn();
    await AsyncStorage.setItem(
      prefsKey('u2'),
      JSON.stringify({ quietDays: 5, dayCap: 99, onCampus: { days: [5, 3, 3], from: 9, to: 17 } }),
    );

    const unsubscribe = QueuePrefsStore.subscribe(sub);
    QueuePrefsStore.for('u2');
    await flush();

    // dayCap 99 clamps to 30; duplicate days collapse and sort.
    expect(QueuePrefsStore.for('u2')).toEqual({
      quietDays: 5,
      quietMax: 2,
      prayers: 3,
      dayCap: 30,
      onCampus: { days: [3, 5], from: 9, to: 17 },
    });
    expect(sub).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it('falls back to the defaults when stored JSON is malformed', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const sub = jest.fn();
    await AsyncStorage.setItem(prefsKey('u3'), '{not json');

    const unsubscribe = QueuePrefsStore.subscribe(sub);
    const prefs = QueuePrefsStore.for('u3');
    await flush();

    expect(prefs).toEqual(DEFAULTS);
    expect(warn).toHaveBeenCalled();
    expect(sub).not.toHaveBeenCalled();
    warn.mockRestore();
    unsubscribe();
  });
});

describe('QueuePrefsStore.set / reset', () => {
  it('patches one setting, persists the merged result, and emits', async () => {
    const sub = jest.fn();
    const unsubscribe = QueuePrefsStore.subscribe(sub);

    QueuePrefsStore.set('u4', { quietDays: 6 });

    expect(QueuePrefsStore.for('u4')).toEqual({ ...DEFAULTS, quietDays: 6 });
    const raw = JSON.parse((await AsyncStorage.getItem(prefsKey('u4')))!);
    expect(raw.quietDays).toBe(6);
    expect(raw.dayCap).toBe(8);
    expect(sub).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it('clamps out-of-range values per field instead of throwing the set away', () => {
    QueuePrefsStore.set('u5', { quietDays: 99, quietMax: -2, prayers: 0, dayCap: 0 });
    expect(QueuePrefsStore.for('u5')).toEqual({
      quietDays: 14, // clamped to [1, 14]
      quietMax: 1, // clamped to [1, 5]
      prayers: 0, // 0 is a real answer for prayers
      dayCap: 0, // 0 is a real answer for dayCap ("All")
      onCampus: DEFAULTS.onCampus,
    });
  });

  it('a window that cannot make sense (from >= to) falls back whole', () => {
    QueuePrefsStore.set('u6', { onCampus: { days: [1], from: 15, to: 12 } });
    expect(QueuePrefsStore.for('u6').onCampus).toEqual(DEFAULTS.onCampus);
  });

  it('a window with no days falls back whole', () => {
    QueuePrefsStore.set('u7', { onCampus: { days: [], from: 9, to: 17 } });
    expect(QueuePrefsStore.for('u7').onCampus).toEqual(DEFAULTS.onCampus);
  });

  it('reset returns the settings to the defaults and rewrites storage', async () => {
    QueuePrefsStore.set('u8', { quietDays: 14 });
    QueuePrefsStore.reset('u8');

    expect(QueuePrefsStore.for('u8')).toEqual(DEFAULTS);
    const raw = JSON.parse((await AsyncStorage.getItem(prefsKey('u8')))!);
    expect(raw).toEqual(DEFAULTS);
  });
});

describe('useQueuePrefs', () => {
  it('signed out: reads the defaults and set/reset are no-ops', () => {
    const { result } = renderHook(() => useQueuePrefs(null));

    expect(result.current.prefs).toEqual(DEFAULTS);

    act(() => {
      result.current.set({ quietDays: 14 });
      result.current.reset();
    });

    expect(result.current.prefs).toEqual(DEFAULTS);
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  });

  it('signed in: set() is reflected live', () => {
    const { result } = renderHook(() => useQueuePrefs('me'));

    act(() => result.current.set({ prayers: 0 }));
    expect(result.current.prefs.prayers).toBe(0);
    expect(result.current.prefs.dayCap).toBe(8);

    act(() => result.current.reset());
    expect(result.current.prefs).toEqual(DEFAULTS);
  });
});
