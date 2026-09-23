import { describe, it, expect, vi, beforeEach } from 'vitest';

const firestoreMock = vi.hoisted(() => ({
  doc: vi.fn((_db: unknown, ...path: string[]) => path.join('/')),
  setDoc: vi.fn(async () => {}),
  deleteDoc: vi.fn(async () => {}),
  updateDoc: vi.fn(async () => {}),
  serverTimestamp: vi.fn(() => 'SERVER_TS'),
}));

vi.mock('firebase/firestore', () => firestoreMock);

import { expoPushDeviceId, registerPushDevice, unregisterPushDevice } from '../src/data/users';

beforeEach(() => vi.clearAllMocks());

describe('push device registration', () => {
  it('derives a rules-safe, stable doc id from an Expo token', () => {
    const id = expoPushDeviceId('ExponentPushToken[xXy-9_z]');
    expect(id).toMatch(/^[a-zA-Z0-9_-]+$/);
    expect(id.length).toBeLessThanOrEqual(128);
    expect(expoPushDeviceId('ExponentPushToken[xXy-9_z]')).toBe(id);
    expect(expoPushDeviceId('ExponentPushToken[other]')).not.toBe(id);
  });

  it('records this phone under the user, one doc per device, so a second phone does not take over', async () => {
    await registerPushDevice({} as never, 'u1', 'ExponentPushToken[a]', 'android');
    const id = expoPushDeviceId('ExponentPushToken[a]');
    expect(firestoreMock.setDoc).toHaveBeenCalledWith(`users/u1/pushDevices/${id}`, {
      kind: 'expo',
      token: 'ExponentPushToken[a]',
      platform: 'android',
      updatedAt: 'SERVER_TS',
    });
  });

  it('forgets this phone on sign-out', async () => {
    await unregisterPushDevice({} as never, 'u1', 'ExponentPushToken[a]');
    expect(firestoreMock.deleteDoc).toHaveBeenCalledWith(`users/u1/pushDevices/${expoPushDeviceId('ExponentPushToken[a]')}`);
  });
});
