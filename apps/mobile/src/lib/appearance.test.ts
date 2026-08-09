// appearance tests — locks down the v2 Appearance preference (Daylight / Dark /
// Match my phone) through its public seam (AppearanceStore + useAppearance).
// The preference is device-local in AsyncStorage under `cisa.m2.scheme.<uid>`,
// validated through @cisa/core's parseSchemePref (only light/dark/system are
// real answers), and signed out everyone follows the phone. Unlike the queue
// stores there is no public subscribe — pub/sub is only reachable through the
// hook, so emit-on-change is asserted there.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { AppearanceStore, useAppearance } from './appearance';

const schemeKey = (uid: string) => `cisa.m2.scheme.${uid}`;
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
});

describe('AppearanceStore.for', () => {
  it('signed out (null or undefined) everyone follows the phone', () => {
    expect(AppearanceStore.for(null)).toBe('system');
    expect(AppearanceStore.for(undefined)).toBe('system');
  });

  it('returns system for a uid with nothing stored', () => {
    expect(AppearanceStore.for('u1')).toBe('system');
  });

  it('hydrates a stored valid scheme', async () => {
    await AsyncStorage.setItem(schemeKey('u2'), 'dark');

    expect(AppearanceStore.for('u2')).toBe('system'); // not until storage resolves
    await flush();

    expect(AppearanceStore.for('u2')).toBe('dark');
  });

  it('ignores an invalid stored scheme (keeps system)', async () => {
    await AsyncStorage.setItem(schemeKey('u3'), 'neon');

    const scheme = AppearanceStore.for('u3');
    await flush();

    expect(scheme).toBe('system');
  });
});

describe('AppearanceStore.set', () => {
  it('persists the scheme and serves it back', async () => {
    AppearanceStore.set('u4', 'light');

    expect(AppearanceStore.for('u4')).toBe('light');
    expect(await AsyncStorage.getItem(schemeKey('u4'))).toBe('light');
  });

  it('is a no-op when signed out', () => {
    AppearanceStore.set(null, 'dark');
    AppearanceStore.set(undefined, 'dark');
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  });
});

describe('useAppearance', () => {
  it('signed out: reports system and the setter is a no-op', () => {
    const { result } = renderHook(() => useAppearance(null));

    expect(result.current[0]).toBe('system');
    act(() => result.current[1]('dark'));
    expect(result.current[0]).toBe('system');
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  });

  it('signed in: set() is reflected live through pub/sub', () => {
    const { result } = renderHook(() => useAppearance('me'));

    expect(result.current[0]).toBe('system');
    act(() => result.current[1]('dark'));
    expect(result.current[0]).toBe('dark');
  });

  it('a stored scheme hydrates into a mounted hook (emit reaches listeners)', async () => {
    await AsyncStorage.setItem(schemeKey('u5'), 'light');
    const { result } = renderHook(() => useAppearance('u5'));

    expect(result.current[0]).toBe('system'); // hydrated yet?
    await waitFor(() => expect(result.current[0]).toBe('light'));
  });
});
