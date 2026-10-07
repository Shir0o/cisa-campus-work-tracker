import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';

vi.mock('react-router-dom', () => ({
  Navigate: ({ to }: { to: string }) =>
    React.createElement('div', { 'data-testid': 'navigate', 'data-to': to }),
}));

vi.mock('../components/AuthProvider', () => ({ useAuth: vi.fn() }));
vi.mock('../components/LanguageProvider', () => ({
  useLanguage: () => ({ language: 'en', setLanguage: vi.fn(), isSpanish: false, t: (key: string) => key }),
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db: unknown, ...parts: string[]) => ({ path: parts.join('/') })),
  doc: vi.fn((_db: unknown, ...parts: string[]) => ({ path: parts.join('/') })),
  query: vi.fn((ref: unknown) => ref),
  orderBy: vi.fn(),
  where: vi.fn(),
  onSnapshot: vi.fn((_ref: unknown, callback: (snap: unknown) => void) => {
    callback({ docs: [] });
    return vi.fn();
  }),
  serverTimestamp: vi.fn(() => ({ __ts: true })),
  writeBatch: vi.fn(() => ({ set: vi.fn(), update: vi.fn(), commit: vi.fn() })),
}));

vi.mock('../lib/firebase', () => ({
  db: {},
  handleFirestoreError: vi.fn(),
  OperationType: { CREATE: 'CREATE' },
}));

import { useAuth } from '../components/AuthProvider';
import BnpbSyncCard from '../components/settings/BnpbSyncCard';
import SuggestionsQueue from '../views/SuggestionsQueue';

const asUser = (email: string, over: Record<string, unknown> = {}) => ({
  user: {
    uid: 'u1',
    email,
    displayName: 'Owner',
    photoURL: '',
    getIdToken: vi.fn().mockResolvedValue('id-token'),
    ...over,
  },
  role: 'admin',
  isApproved: true,
  loading: false,
  ownerViewRole: null,
});
const mockedUseAuth = vi.mocked(useAuth);

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, json: async () => ({ active: false, createdAt: null, lastPushAt: null }) }),
  );
});

describe('BnpbSyncCard', () => {
  it('is absent for anyone but the app owner', () => {
    mockedUseAuth.mockReturnValue(asUser('someone@example.com') as never);
    const { container } = render(<BnpbSyncCard />);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText('bnpb.settings_title')).not.toBeInTheDocument();
  });

  it('lets the owner generate a token and shows it once', async () => {
    mockedUseAuth.mockReturnValue(asUser('yilongwang05@gmail.com') as never);
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ active: false, createdAt: null, lastPushAt: null }),
    });
    render(<BnpbSyncCard />);
    expect(await screen.findByText('bnpb.settings_title')).toBeInTheDocument();

    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ token: 'plaintext-token', createdAt: '2026-09-01T00:00:00.000Z' }),
    });
    fireEvent.click(screen.getByText('bnpb.generate'));

    expect(await screen.findByText('plaintext-token')).toBeInTheDocument();
    expect(screen.getByText('bnpb.token_once')).toBeInTheDocument();
  });
});

describe('SuggestionsQueue', () => {
  it('sends a non-owner to Home', () => {
    mockedUseAuth.mockReturnValue(asUser('someone@example.com') as never);
    render(<SuggestionsQueue />);
    const nav = screen.getByTestId('navigate');
    expect(nav).toHaveAttribute('data-to', '/');
  });

  it('renders the queue for the owner', async () => {
    mockedUseAuth.mockReturnValue(asUser('yilongwang05@gmail.com') as never);
    render(<SuggestionsQueue />);
    await waitFor(() => expect(screen.getByText('bnpb.queue_title')).toBeInTheDocument());
    expect(screen.getByText('bnpb.queue_empty')).toBeInTheDocument();
  });
});
