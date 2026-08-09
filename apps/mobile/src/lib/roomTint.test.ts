// roomTint tests — locks down the v2 Room tint preference (Green room vs Navy
// room) through its public seam (RoomTintStore + useRoomTint). Device-local in
// AsyncStorage under `cisa.m2.tint.<uid>`, and only 'blue'/'green' are real
// answers. Like appearance.ts there is no public subscribe — pub/sub is only
// reachable through the hook, so emit-on-change is asserted there.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { RoomTintStore, useRoomTint } from './roomTint';

const tintKey = (uid: string) => `cisa.m2.tint.${uid}`;
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
});

describe('RoomTintStore.for', () => {
  it('signed out (null or undefined) defaults to the green room', () => {
    expect(RoomTintStore.for(null)).toBe('green');
    expect(RoomTintStore.for(undefined)).toBe('green');
  });

  it('returns green for a uid with nothing stored', () => {
    expect(RoomTintStore.for('u1')).toBe('green');
  });

  it('hydrates a stored valid tint', async () => {
    await AsyncStorage.setItem(tintKey('u2'), 'blue');

    expect(RoomTintStore.for('u2')).toBe('green'); // not until storage resolves
    await flush();

    expect(RoomTintStore.for('u2')).toBe('blue');
  });

  it('ignores an invalid stored tint (keeps green)', async () => {
    await AsyncStorage.setItem(tintKey('u3'), 'navy');

    const tint = RoomTintStore.for('u3');
    await flush();

    expect(tint).toBe('green');
  });
});

describe('RoomTintStore.set', () => {
  it('persists the tint and serves it back', async () => {
    RoomTintStore.set('u4', 'blue');

    expect(RoomTintStore.for('u4')).toBe('blue');
    expect(await AsyncStorage.getItem(tintKey('u4'))).toBe('blue');
  });

  it('is a no-op when signed out', () => {
    RoomTintStore.set(null, 'blue');
    RoomTintStore.set(undefined, 'blue');
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  });
});

describe('useRoomTint', () => {
  it('signed out: reports green and the setter is a no-op', () => {
    const { result } = renderHook(() => useRoomTint(null));

    expect(result.current[0]).toBe('green');
    act(() => result.current[1]('blue'));
    expect(result.current[0]).toBe('green');
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  });

  it('signed in: set() is reflected live through pub/sub', () => {
    const { result } = renderHook(() => useRoomTint('me'));

    expect(result.current[0]).toBe('green');
    act(() => result.current[1]('blue'));
    expect(result.current[0]).toBe('blue');
  });

  it('a stored tint hydrates into a mounted hook (emit reaches listeners)', async () => {
    await AsyncStorage.setItem(tintKey('u5'), 'blue');
    const { result } = renderHook(() => useRoomTint('u5'));

    expect(result.current[0]).toBe('green'); // hydrated yet?
    await waitFor(() => expect(result.current[0]).toBe('blue'));
  });
});
