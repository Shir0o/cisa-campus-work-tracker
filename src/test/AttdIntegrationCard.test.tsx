import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHash } from 'node:crypto';
import { webcrypto } from 'node:crypto';
import { addDoc, setDoc } from 'firebase/firestore';
import Settings from '../views/Settings';
import { useAuth } from '../components/AuthProvider';

// jsdom implements getRandomValues but not Web Crypto's `subtle`, which the
// card uses to hash the token before it is written (ADR 0052).
if (!globalThis.crypto.subtle) {
  Object.defineProperty(globalThis.crypto, 'subtle', { value: webcrypto.subtle });
}

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  Link: ({ to, children, ...props }: any) => {
    const { createElement } = require('react');
    return createElement('a', { href: to, ...props }, children);
  },
}));

vi.mock('../components/AuthProvider', () => ({
  useAuth: vi.fn(),
}));

vi.mock('../components/ThemeProvider', () => ({
  useTheme: () => ({ theme: 'system', setTheme: vi.fn() }),
}));

vi.mock('../components/NavShellProvider', () => ({
  useNavShell: () => ({ preference: 'rail', effective: 'rail', setPreference: vi.fn() }),
}));

vi.mock('../components/LanguageProvider', () => ({
  useLanguage: () => ({
    language: 'en',
    setLanguage: vi.fn(),
    isSpanish: false,
    t: (_key: string, fallback?: string) => fallback ?? _key,
  }),
}));

vi.mock('motion/react', () => {
  const { forwardRef, createElement, Fragment } = require('react');
  return {
    motion: {
      div: forwardRef(({ children, ...props }: any, ref: any) =>
        createElement('div', { ...props, ref }, children),
      ),
      button: forwardRef(({ children, ...props }: any, ref: any) =>
        createElement('button', { ...props, ref }, children),
      ),
    },
    AnimatePresence: ({ children }: any) => createElement(Fragment, null, children),
  };
});

const DELETE_FIELD = { __deleteField: true };

let mockIntegrationsData: Record<string, any> = {};

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db: any, path: string) => ({ path })),
  onSnapshot: vi.fn((ref: any, callback: any) => {
    if (ref?.path === 'settings/integrations') {
      callback({
        exists: () => true,
        data: () => mockIntegrationsData,
      });
    } else {
      callback({ docs: [], size: 0, exists: () => false, data: () => ({}) });
    }
    return vi.fn();
  }),
  query: vi.fn((ref: any) => ref),
  orderBy: vi.fn(),
  doc: vi.fn((_db: any, coll: string, id: string) => ({ path: `${coll}/${id}`, id })),
  setDoc: vi.fn(() => Promise.resolve()),
  updateDoc: vi.fn(() => Promise.resolve()),
  deleteDoc: vi.fn(() => Promise.resolve()),
  deleteField: vi.fn(() => DELETE_FIELD),
  addDoc: vi.fn(() => Promise.resolve({ id: 'audit-1' })),
  getDocs: vi.fn(() => Promise.resolve({ docs: [] })),
  serverTimestamp: vi.fn(() => 'mock-timestamp'),
}));

vi.mock('../lib/firebase', () => ({
  db: {},
  handleFirestoreError: vi.fn(),
  OperationType: { LIST: 'LIST', CREATE: 'CREATE', UPDATE: 'UPDATE', DELETE: 'DELETE' },
}));

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

const writtenPayload = () => vi.mocked(setDoc).mock.calls[0]?.[1] as Record<string, any>;

describe('AttdIntegrationCard in Settings', () => {
  const writeText = vi.fn((_text: string) => Promise.resolve());

  beforeEach(() => {
    vi.clearAllMocks();
    // The Attendance Tracker card lives in the developer-unlocked Quick add
    // section (#1992).
    window.localStorage.clear();
    window.localStorage.setItem('cisa.settings.devUnlocked', '1');
    mockIntegrationsData = {};
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    (useAuth as any).mockReturnValue({
      user: { uid: 'admin-1', email: 'admin@cisa.org', displayName: 'Admin User' },
      isAdmin: true,
      isManager: true,
      role: 'admin',
      isApproved: true,
    });
  });

  it('renders the Attendance Tracker app card with intake url and sync token', async () => {
    render(<Settings />);

    await waitFor(() => {
      expect(screen.getByText('Attendance Tracker app (~/attd)')).toBeInTheDocument();
    });

    expect(screen.getByText(/api\/attendance-sync/)).toBeInTheDocument();
    expect(screen.getByText('Generate new token')).toBeInTheDocument();
  });

  it('rotates the token only after the confirm (#1817)', async () => {
    mockIntegrationsData = { attdSyncTokenHash: 'a'.repeat(64) };
    render(<Settings />);

    await waitFor(() => {
      expect(screen.getByText('Rotate token')).toBeInTheDocument();
    });

    // One tap arms the control; the token pasted into ~/attd is still valid.
    fireEvent.click(screen.getByRole('button', { name: 'Rotate token' }));
    expect(setDoc).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    await waitFor(() => {
      expect(setDoc).toHaveBeenCalledWith(
        expect.objectContaining({ path: 'settings/integrations' }),
        expect.objectContaining({
          attdSyncTokenHash: expect.stringMatching(/^[a-f0-9]{64}$/),
          attdSyncUrl: expect.stringContaining('/api/attendance-sync'),
        }),
        { merge: true },
      );
    });
  });

  it('writes only the hash of a freshly generated token and shows it once (#1968)', async () => {
    render(<Settings />);

    await waitFor(() => {
      expect(screen.getByText('Generate new token')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Generate new token' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    await waitFor(() => {
      expect(screen.getByText(/it will not be shown again/)).toBeInTheDocument();
    });

    const payload = writtenPayload();
    expect(payload.attdSyncTokenHash).toMatch(/^[a-f0-9]{64}$/);
    // The plaintext field is deleted, never written: the hash is the secret.
    expect(payload.attdSyncToken).toBe(DELETE_FIELD);

    fireEvent.click(screen.getByRole('button', { name: 'Copy token' }));
    const revealed = writeText.mock.calls[0][0] as string;
    expect(payload.attdSyncTokenHash).toBe(sha256(revealed));

    // Rotation is audited against the vault's log (ADR 0052).
    await waitFor(() => {
      expect(addDoc).toHaveBeenCalledWith(
        expect.objectContaining({ path: 'credentialAudit' }),
        expect.objectContaining({
          actorUid: 'admin-1',
          credentialId: 'attd-sync-token',
          action: 'rotate',
        }),
      );
    });
  });

  it('offers Rotate and no reveal control once a hash is stored (#1968)', async () => {
    mockIntegrationsData = { attdSyncTokenHash: 'a'.repeat(64) };
    render(<Settings />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Rotate token' })).toBeInTheDocument();
    });

    expect(screen.getByText(/It cannot be shown again/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Show token' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Copy token' })).not.toBeInTheDocument();
    expect(screen.queryByText('Activate hashed token')).not.toBeInTheDocument();
    expect(screen.queryByText(/will not be shown again/)).not.toBeInTheDocument();
  });

  it('offers Activate hashed token while a legacy plaintext token is present (#1968)', async () => {
    mockIntegrationsData = { attdSyncToken: 'legacy-plaintext' };
    render(<Settings />);

    const activate = await screen.findByRole('button', { name: 'Activate hashed token' });

    // Nothing is migrated on load: the plaintext is the last readable copy.
    expect(setDoc).not.toHaveBeenCalled();

    fireEvent.click(activate);

    await waitFor(() => {
      expect(setDoc).toHaveBeenCalledWith(
        expect.objectContaining({ path: 'settings/integrations' }),
        expect.objectContaining({
          attdSyncTokenHash: sha256('legacy-plaintext'),
          attdSyncToken: DELETE_FIELD,
        }),
        { merge: true },
      );
    });

    // The value is shown once, so it can be pasted into ~/attd if that copy drifted.
    await waitFor(() => {
      expect(screen.getByText('legacy-plaintext')).toBeInTheDocument();
    });
    expect(screen.getByText(/it will not be shown again/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: "I've copied it" }));
    expect(screen.queryByText('legacy-plaintext')).not.toBeInTheDocument();
  });
});
