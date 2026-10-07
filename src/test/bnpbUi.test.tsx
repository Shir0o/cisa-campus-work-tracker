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
  deleteField: vi.fn(() => ({ __delete: true })),
  writeBatch: vi.fn(() => ({ set: vi.fn(), update: vi.fn(), delete: vi.fn(), commit: vi.fn() })),
}));

vi.mock('../lib/firebase', () => ({
  db: {},
  handleFirestoreError: vi.fn(),
  OperationType: { CREATE: 'CREATE' },
}));

import { onSnapshot } from 'firebase/firestore';
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

describe('SuggestionsQueue settling', () => {
  const pending = {
    id: 'sug-1',
    syncId: 's1',
    bnpbContactId: 'p-1',
    bnpbName: 'Alex Chen',
    occurredAt: '2026-09-10T15:00:00.000Z',
    durationMinutes: 45,
    summary: 'Coffee downtown',
    medium: 'coffee',
    text: 'Coffee downtown',
    status: 'pending',
  };

  beforeEach(() => {
    mockedUseAuth.mockReturnValue(asUser('yilongwang05@gmail.com') as never);
    vi.mocked(onSnapshot).mockImplementation((ref: unknown, callback: unknown) => {
      const path = (ref as { path?: string })?.path ?? '';
      if (typeof callback === 'function') {
        (callback as (snap: unknown) => void)(
          path === 'users/u1/interactionSuggestions'
            ? { docs: [{ id: pending.id, data: () => ({ ...pending }) }] }
            : { docs: [] },
        );
      }
      return vi.fn();
    });
  });

  it('dismisses a suggestion with an Undo on the toast', async () => {
    render(<SuggestionsQueue />);
    fireEvent.click(await screen.findByText('bnpb.queue_dismiss'));

    expect(await screen.findByText('bnpb.queue_dismissed')).toBeInTheDocument();
    expect(screen.getByText('actions.undo')).toBeInTheDocument();
  });

  it('marks a suggestion as Not a CISA person with an Undo on the toast', async () => {
    render(<SuggestionsQueue />);
    fireEvent.click(await screen.findByText('bnpb.queue_not_cisa'));

    expect(await screen.findByText('bnpb.queue_not_cisa_done')).toBeInTheDocument();
    expect(screen.getByText('actions.undo')).toBeInTheDocument();
  });
});

describe('SuggestionsQueue duplicate flag', () => {
  const pending = {
    id: 'sug-1',
    syncId: 's1',
    bnpbContactId: 'p-1',
    bnpbName: 'Alex Chen',
    occurredAt: '2026-09-10T15:00:00.000Z',
    durationMinutes: 45,
    summary: 'Coffee downtown',
    medium: 'coffee',
    text: 'Coffee downtown',
    status: 'pending',
  };

  beforeEach(() => {
    mockedUseAuth.mockReturnValue(asUser('yilongwang05@gmail.com') as never);
    vi.mocked(onSnapshot).mockImplementation((ref: unknown, callback: unknown) => {
      const path = (ref as { path?: string })?.path ?? '';
      let docs: unknown[] = [];
      if (path === 'users/u1/interactionSuggestions') {
        docs = [{ id: pending.id, data: () => ({ ...pending }) }];
      } else if (path === 'contacts') {
        docs = [
          { id: 'c1', data: () => ({ name: 'Alex Chen' }) },
          { id: 'c2', data: () => ({ name: 'Bea Diaz' }) },
        ];
      } else if (path === 'contacts/c1/interactions') {
        docs = [{ id: 'i1', data: () => ({ userId: 'u1', content: 'Called about the retreat', dateTime: '2026-09-10', type: 'call' }) }];
      } else if (path === 'contacts/c2/interactions') {
        docs = [{ id: 'i2', data: () => ({ userId: 'someone-else', content: 'Their note', dateTime: '2026-09-10', type: 'call' }) }];
      }
      if (typeof callback === 'function') (callback as (snap: unknown) => void)({ docs });
      return vi.fn();
    });
  });

  it('flags an owner Interaction logged the same day and offers Log anyway', async () => {
    render(<SuggestionsQueue />);
    fireEvent.change(await screen.findByPlaceholderText('bnpb.queue_search_contacts'), {
      target: { value: 'Alex' },
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Alex Chen' }));

    expect(await screen.findByText('bnpb.queue_maybe_logged')).toBeInTheDocument();
    expect(screen.getByText('bnpb.queue_log_anyway')).toBeInTheDocument();
  });

  it('re-evaluates the flag when the Contact changes', async () => {
    render(<SuggestionsQueue />);
    fireEvent.change(await screen.findByPlaceholderText('bnpb.queue_search_contacts'), {
      target: { value: 'Alex' },
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Alex Chen' }));
    expect(await screen.findByText('bnpb.queue_maybe_logged')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('bnpb.queue_search_contacts'), {
      target: { value: 'Bea' },
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Bea Diaz' }));

    await waitFor(() => expect(screen.queryByText('bnpb.queue_maybe_logged')).not.toBeInTheDocument());
    expect(screen.getByText('bnpb.queue_confirm')).toBeInTheDocument();
  });
});
