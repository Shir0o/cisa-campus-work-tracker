import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import Settings from '../views/Settings';
import { useAuth } from '../components/AuthProvider';

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
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

let mockIntegrationsData: Record<string, any> = { attdSyncToken: 'test-token-xyz' };

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
  getDocs: vi.fn(() => Promise.resolve({ docs: [] })),
  serverTimestamp: vi.fn(() => 'mock-timestamp'),
}));

vi.mock('../lib/firebase', () => ({
  db: {},
  handleFirestoreError: vi.fn(),
  OperationType: { LIST: 'LIST', CREATE: 'CREATE', UPDATE: 'UPDATE', DELETE: 'DELETE' },
}));

describe('AttdIntegrationCard in Settings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  it('generates a new token when the button is clicked', async () => {
    render(<Settings />);

    await waitFor(() => {
      expect(screen.getByText('Generate new token')).toBeInTheDocument();
    });

    const genButton = screen.getByText('Generate new token');
    fireEvent.click(genButton);

    await waitFor(() => {
      expect(setDoc).toHaveBeenCalledWith(
        expect.objectContaining({ path: 'settings/integrations' }),
        expect.objectContaining({
          attdSyncToken: expect.any(String),
          attdSyncUrl: expect.stringContaining('/api/attendance-sync'),
        }),
        { merge: true },
      );
    });
  });
});
