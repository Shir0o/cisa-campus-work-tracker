import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';

const hoisted = vi.hoisted(() => ({
  data: undefined as Record<string, unknown> | undefined,
  onSnapshotError: null as unknown | null,
  setDocReject: false as boolean,
  lastSetDocPayload: null as unknown | null,
}));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db: unknown, col: string, id: string) => ({ path: `${col}/${id}` })),
  onSnapshot: vi.fn((_ref: unknown, cb: (snap: { data: () => unknown }) => void, err?: (e: unknown) => void) => {
    if (hoisted.onSnapshotError) {
      err?.(hoisted.onSnapshotError);
    } else {
      cb({ data: () => hoisted.data });
    }
    return () => {};
  }),
  setDoc: vi.fn((_ref: unknown, payload: unknown) => {
    hoisted.lastSetDocPayload = payload;
    return hoisted.setDocReject ? Promise.reject(new Error('write failed')) : Promise.resolve();
  }),
  serverTimestamp: vi.fn(() => 'MOCK_TIMESTAMP'),
}));

vi.mock('./firebase', () => ({
  db: {},
  handleFirestoreError: vi.fn(),
  OperationType: { WRITE: 'WRITE' },
}));

import {
  subscribeWhatsNewSettings,
  saveWhatsNewSettings,
  useWhatsNewSettings,
} from './whatsNew';
import { setDoc } from 'firebase/firestore';

describe('whatsNew Firestore settings integration', () => {
  beforeEach(() => {
    hoisted.data = undefined;
    hoisted.onSnapshotError = null;
    hoisted.setDocReject = false;
    hoisted.lastSetDocPayload = null;
    vi.clearAllMocks();
  });

  it('subscribes to settings/whats_new and passes normalized data to callback', () => {
    hoisted.data = { videoUrl: 'https://drive.google.com/file/d/test12345/view' };
    const cb = vi.fn();
    const unsub = subscribeWhatsNewSettings(cb);

    expect(cb).toHaveBeenCalledWith({
      videoUrl: 'https://drive.google.com/file/d/test12345/view',
    });
    expect(typeof unsub).toBe('function');
  });

  it('handles empty/undefined snapshot data safely', () => {
    hoisted.data = undefined;
    const cb = vi.fn();
    subscribeWhatsNewSettings(cb);

    expect(cb).toHaveBeenCalledWith({});
  });

  it('handles onSnapshot errors gracefully', () => {
    hoisted.onSnapshotError = new Error('Permission denied');
    const onError = vi.fn();
    subscribeWhatsNewSettings(vi.fn(), onError);

    expect(onError).toHaveBeenCalledWith(expect.any(Error));
  });

  it('writes videoUrl and metadata via saveWhatsNewSettings', async () => {
    await saveWhatsNewSettings(
      { videoUrl: 'https://drive.google.com/file/d/xyz987/view' },
      'admin@cisa.org',
    );

    expect(setDoc).toHaveBeenCalledWith(
      { path: 'settings/whats_new' },
      {
        videoUrl: 'https://drive.google.com/file/d/xyz987/view',
        updatedAt: 'MOCK_TIMESTAMP',
        updatedBy: 'admin@cisa.org',
      },
      { merge: true },
    );
  });

  it('forwards save errors to handleFirestoreError', async () => {
    const { handleFirestoreError, OperationType } = await import('./firebase');
    hoisted.setDocReject = true;

    await saveWhatsNewSettings({ videoUrl: 'bad' });
    expect(handleFirestoreError).toHaveBeenCalledWith(
      expect.any(Error),
      OperationType.WRITE,
      'settings/whats_new',
    );
  });

  it('useWhatsNewSettings provides videoUrl and setVideoUrl updater', async () => {
    hoisted.data = { videoUrl: 'https://drive.google.com/file/d/liveUrl/view' };
    const { result } = renderHook(() => useWhatsNewSettings());

    expect(result.current.videoUrl).toBe('https://drive.google.com/file/d/liveUrl/view');
    expect(result.current.settings.videoUrl).toBe('https://drive.google.com/file/d/liveUrl/view');

    expect(result.current.videoRoles).toBeNull();

    await result.current.setVideoUrl('https://drive.google.com/file/d/newUrl/view', 'user1');
    expect(hoisted.lastSetDocPayload).toEqual({
      videoUrl: 'https://drive.google.com/file/d/newUrl/view',
      updatedAt: 'MOCK_TIMESTAMP',
      updatedBy: 'user1',
    });

    await result.current.setVideoSettings(
      { videoUrl: 'https://drive.google.com/file/d/newUrl/view', videoRoles: ['admin'] },
      'user1',
    );
    expect(hoisted.lastSetDocPayload).toEqual({
      videoUrl: 'https://drive.google.com/file/d/newUrl/view',
      videoRoles: ['admin'],
      updatedAt: 'MOCK_TIMESTAMP',
      updatedBy: 'user1',
    });
  });
});
