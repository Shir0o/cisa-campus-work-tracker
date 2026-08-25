import { describe, expect, it, beforeEach } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { RELEASES } from '@cisa/core';
import { act } from '@testing-library/react-native';
import {
  initReleaseStore,
  seenVersion,
  markReleaseSeen,
  subscribeReleases,
} from './releases';

// The store keeps `seen` in module scope. It's idempotent, so each test resets
// it by clearing storage and re-running initReleaseStore (which re-reads).
const reset = async () => {
  await AsyncStorage.clear();
  await initReleaseStore();
};

beforeEach(reset);

describe('mobile release store', () => {
  it('hydrates from storage and exposes the seen version', async () => {
    await markReleaseSeen('9.9.9');
    await initReleaseStore();
    expect(seenVersion()).toBe('9.9.9');
  });

  it('stamps a fresh machine one release back so the newest reads once', async () => {
    // A clean slate is stamped one release back (the traceSeed trick), so the
    // newest release reads once instead of being invisible.
    expect(seenVersion()).toBe(RELEASES[1].version);
  });

  it('markReleaseSeen persists, notifies, and closes the gate', async () => {
    let calls = 0;
    const unsub = subscribeReleases(() => calls++);
    expect(seenVersion()).toBe(RELEASES[1].version);

    await act(async () => {
      await markReleaseSeen(RELEASES[0].version);
    });
    expect(calls).toBe(1);
    expect(seenVersion()).toBe(RELEASES[0].version);
    const stored = JSON.parse((await AsyncStorage.getItem('cisa.release.v1')) ?? '{}');
    expect(stored.version).toBe(RELEASES[0].version);
    unsub();
  });
});