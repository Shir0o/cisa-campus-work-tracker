import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  dbUrl: 'https://rtdb.example' as string | undefined,
  app: { name: 'cisa-guest-collab' },
  database: { __db: true },
  auth: { currentUser: null as unknown },
}));

vi.mock('../lib/firebase', () => ({
  get databaseURL() {
    return h.dbUrl;
  },
  guestFirebaseApp: () => h.app,
}));

vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(() => h.auth),
  signInWithCustomToken: vi.fn(() => Promise.resolve()),
}));

vi.mock('firebase/database', () => ({
  getDatabase: vi.fn(() => h.database),
}));

import { getAuth, signInWithCustomToken } from 'firebase/auth';
import { getDatabase } from 'firebase/database';
import { connectGuestRtdb } from '../lib/guestCollab';

describe('connectGuestRtdb', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.dbUrl = 'https://rtdb.example';
    h.auth.currentUser = null;
  });

  it('returns null when no Realtime Database is configured', async () => {
    h.dbUrl = undefined;
    expect(await connectGuestRtdb('tok')).toBeNull();
    expect(signInWithCustomToken).not.toHaveBeenCalled();
  });

  it('exchanges the scoped token on the guest app and returns its database', async () => {
    const db = await connectGuestRtdb('tok');
    expect(getAuth).toHaveBeenCalledWith(h.app);
    expect(signInWithCustomToken).toHaveBeenCalledWith(h.auth, 'tok');
    expect(getDatabase).toHaveBeenCalledWith(h.app, 'https://rtdb.example');
    expect(db).toBe(h.database);
  });

  it('reuses an existing guest session instead of signing in twice', async () => {
    h.auth.currentUser = { uid: 'guest_1' };
    await connectGuestRtdb('tok');
    expect(signInWithCustomToken).not.toHaveBeenCalled();
  });

  it('propagates a failed token exchange', async () => {
    (signInWithCustomToken as any).mockRejectedValueOnce(new Error('bad token'));
    await expect(connectGuestRtdb('tok')).rejects.toThrow('bad token');
  });
});
