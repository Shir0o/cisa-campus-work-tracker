import { describe, expect, it, beforeEach } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act } from '@testing-library/react-native';
import {
  initReleaseStore,
  seenReleaseId,
  markReleaseSeen,
  subscribeReleases,
  latestAnnouncement,
  SEEN_RELEASE_KEY,
} from './releases';

// The store keeps `seen` in module scope. It is idempotent, so each test resets
// it by clearing storage and re-running initReleaseStore (which re-reads).
const reset = async () => {
  await AsyncStorage.clear();
  await initReleaseStore();
};

beforeEach(reset);

describe('mobile release store', () => {
  it('hydrates from the shared seen key', async () => {
    await markReleaseSeen('9.9.9');
    await initReleaseStore();
    expect(seenReleaseId()).toBe('9.9.9');
  });

  it('seeds once from the retired cisa.release.v1 key', async () => {
    await AsyncStorage.setItem('cisa.release.v1', JSON.stringify({ version: '0.1.0', at: 'x' }));
    await initReleaseStore();
    expect(seenReleaseId()).toBe('0.1.0');
    expect(await AsyncStorage.getItem(SEEN_RELEASE_KEY)).toBe('0.1.0');
  });

  it('leaves a clean device unseen so the newest release reads once', () => {
    expect(seenReleaseId()).toBeNull();
    expect(latestAnnouncement('mobile')).not.toBeNull();
  });

  it('markReleaseSeen persists the id, notifies, and closes the gate', async () => {
    let calls = 0;
    const unsub = subscribeReleases(() => calls++);
    await act(async () => {
      await markReleaseSeen('9.9.9');
    });
    expect(calls).toBe(1);
    expect(seenReleaseId()).toBe('9.9.9');
    expect(await AsyncStorage.getItem(SEEN_RELEASE_KEY)).toBe('9.9.9');
    unsub();
  });
});
