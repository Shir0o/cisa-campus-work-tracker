import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';

vi.mock('react-router-dom', () => ({
  Navigate: ({ to }: { to: string }) =>
    React.createElement('div', { 'data-testid': 'navigate', 'data-to': to }),
  Link: ({ to, children }: { to: string; children: React.ReactNode }) =>
    React.createElement('a', { href: to }, children),
}));

const hoisted = vi.hoisted(() => ({
  batch: {
    set: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    commit: vi.fn().mockResolvedValue(undefined),
  },
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
  getDocs: vi.fn(async () => ({ docs: [] })),
  serverTimestamp: vi.fn(() => ({ __ts: true })),
  deleteField: vi.fn(() => ({ __delete: true })),
  writeBatch: vi.fn(() => hoisted.batch),
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

describe('SuggestionsQueue matching and grouping', () => {
  const suggestion = (over: Record<string, unknown>) => ({
    id: 'sug',
    syncId: 's1',
    bnpbContactId: 'p-1',
    bnpbName: 'Alex Chen',
    occurredAt: '2026-09-10T15:00:00.000Z',
    durationMinutes: 45,
    summary: 'Coffee downtown',
    medium: 'coffee',
    text: 'Coffee downtown',
    status: 'pending',
    ...over,
  });

  beforeEach(() => {
    mockedUseAuth.mockReturnValue(asUser('yilongwang05@gmail.com') as never);
    hoisted.batch.update.mockClear();
    hoisted.batch.commit.mockClear();
    vi.mocked(onSnapshot).mockImplementation((ref: unknown, callback: unknown) => {
      const path = (ref as { path?: string })?.path ?? '';
      let docs: unknown[] = [];
      if (path === 'users/u1/interactionSuggestions') {
        docs = [
          { id: 'ready', data: () => suggestion({ id: 'ready' }) },
          {
            id: 'who-a',
            data: () => suggestion({ id: 'who-a', bnpbContactId: 'p-9', bnpbName: 'Zoe Quinn', summary: 'Older' }),
          },
          {
            id: 'who-b',
            data: () =>
              suggestion({
                id: 'who-b',
                bnpbContactId: 'p-9',
                bnpbName: 'Zoe Quinn',
                summary: 'Newer',
                occurredAt: '2026-09-20T15:00:00.000Z',
              }),
          },
        ];
      } else if (path === 'contacts') {
        docs = [{ id: 'c1', data: () => ({ name: 'Alex Chen' }) }];
      }
      if (typeof callback === 'function') (callback as (snap: unknown) => void)({ docs });
      return vi.fn();
    });
  });

  it('splits matched and unmatched into the two sections with badges and a month divider', async () => {
    render(<SuggestionsQueue />);

    expect(await screen.findByText('bnpb.queue_ready_title')).toBeInTheDocument();
    expect(screen.getByText('bnpb.badge_exact')).toBeInTheDocument();
    expect(screen.getByText('bnpb.queue_who_title')).toBeInTheDocument();
    expect(screen.getByText('Zoe Quinn')).toBeInTheDocument();
    expect(screen.getByText('bnpb.queue_who_count')).toBeInTheDocument();
    expect(screen.getByText('September 2026')).toBeInTheDocument();
  });

  it('assigns a chosen Contact to every suggestion on a Who-is-this card', async () => {
    render(<SuggestionsQueue />);

    fireEvent.click(await screen.findByRole('button', { name: 'Alex Chen' }));

    await waitFor(() => expect(hoisted.batch.update).toHaveBeenCalledTimes(2));
    const paths = hoisted.batch.update.mock.calls.map(([ref]) => (ref as { path: string }).path);
    expect(paths).toEqual([
      'users/u1/interactionSuggestions/who-b',
      'users/u1/interactionSuggestions/who-a',
    ]);
    for (const [, data] of hoisted.batch.update.mock.calls) {
      expect(data).toEqual({ contactId: 'c1' });
    }
    expect(hoisted.batch.commit).toHaveBeenCalledTimes(1);
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

    expect(await screen.findByText('bnpb.queue_maybe_logged')).toBeInTheDocument();
    expect(screen.getByText('bnpb.queue_log_anyway')).toBeInTheDocument();
  });

  it('re-evaluates the flag when the Contact changes', async () => {
    render(<SuggestionsQueue />);
    expect(await screen.findByText('bnpb.queue_maybe_logged')).toBeInTheDocument();

    fireEvent.click(screen.getByText('bnpb.queue_change'));
    fireEvent.change(screen.getByPlaceholderText('bnpb.queue_search_contacts'), {
      target: { value: 'Bea' },
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Bea Diaz' }));

    await waitFor(() => expect(screen.queryByText('bnpb.queue_maybe_logged')).not.toBeInTheDocument());
    expect(screen.getByText('bnpb.queue_confirm')).toBeInTheDocument();
  });
});

describe('SuggestionsQueue feedback', () => {
  const suggestionDoc = (id: string, over: Record<string, unknown> = {}) => ({
    id,
    data: () => ({
      syncId: `s-${id}`,
      bnpbContactId: 'p-1',
      bnpbName: 'Alex Chen',
      occurredAt: '2026-09-10T15:00:00.000Z',
      durationMinutes: 45,
      summary: 'Coffee downtown',
      medium: 'coffee',
      text: 'Coffee downtown',
      status: 'pending',
      ...over,
    }),
  });

  const serve = (suggestions: unknown[], contacts: unknown[] = []) => {
    vi.mocked(onSnapshot).mockImplementation((ref: unknown, callback: unknown) => {
      const path = (ref as { path?: string })?.path ?? '';
      let docs: unknown[] = [];
      if (path === 'users/u1/interactionSuggestions') docs = suggestions;
      else if (path === 'contacts') docs = contacts;
      if (typeof callback === 'function') (callback as (snap: unknown) => void)({ docs });
      return vi.fn();
    });
  };

  beforeEach(() => {
    mockedUseAuth.mockReturnValue(asUser('yilongwang05@gmail.com') as never);
    hoisted.batch.commit.mockReset();
    hoisted.batch.commit.mockResolvedValue(undefined);
    vi.mocked(onSnapshot).mockClear();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.mocked(console.error).mockRestore();
  });

  it('tells the owner when a dismiss fails, and offers no Undo', async () => {
    serve([suggestionDoc('sug-1')]);
    hoisted.batch.commit.mockRejectedValueOnce(new Error('offline'));
    render(<SuggestionsQueue />);
    fireEvent.click(await screen.findByText('bnpb.queue_dismiss'));

    expect(await screen.findByText('bnpb.queue_error_dismiss')).toBeInTheDocument();
    expect(screen.queryByText('actions.undo')).not.toBeInTheDocument();
  });

  it('tells the owner when Not a CISA person fails', async () => {
    serve([suggestionDoc('sug-1')]);
    hoisted.batch.commit.mockRejectedValueOnce(new Error('offline'));
    render(<SuggestionsQueue />);
    fireEvent.click(await screen.findByText('bnpb.queue_not_cisa'));

    expect(await screen.findByText('bnpb.queue_error_not_cisa')).toBeInTheDocument();
  });

  it('tells the owner when assigning a Contact fails', async () => {
    serve([suggestionDoc('sug-1', { bnpbName: 'Zoe Quinn', bnpbContactId: 'p-9' })], [
      { id: 'c1', data: () => ({ name: 'Alex Chen' }) },
    ]);
    hoisted.batch.commit.mockRejectedValueOnce(new Error('offline'));
    render(<SuggestionsQueue />);
    fireEvent.click(await screen.findByRole('button', { name: 'Alex Chen' }));

    expect(await screen.findByText('bnpb.queue_error_assign')).toBeInTheDocument();
  });

  it('tells the owner when an Undo fails', async () => {
    serve([suggestionDoc('sug-1')]);
    render(<SuggestionsQueue />);
    fireEvent.click(await screen.findByText('bnpb.queue_dismiss'));
    const undo = await screen.findByText('actions.undo');
    hoisted.batch.commit.mockRejectedValueOnce(new Error('offline'));
    fireEvent.click(undo);

    expect(await screen.findByText('bnpb.queue_error_undo')).toBeInTheDocument();
  });

  it('shows a confirmation without an Undo once a suggestion is confirmed', async () => {
    serve([suggestionDoc('sug-1')], [{ id: 'c1', data: () => ({ name: 'Alex Chen' }) }]);
    render(<SuggestionsQueue />);
    fireEvent.click(await screen.findByText('bnpb.queue_confirm'));

    expect(await screen.findByText('bnpb.queue_logged_to')).toBeInTheDocument();
    expect(screen.queryByText('actions.undo')).not.toBeInTheDocument();
  });

  it('shows the type in the owner language, not the raw value', async () => {
    serve([suggestionDoc('sug-1')], [{ id: 'c1', data: () => ({ name: 'Alex Chen' }) }]);
    render(<SuggestionsQueue />);

    expect(await screen.findByText('modals.contactDetails.composer_type_meeting')).toBeInTheDocument();
    expect(screen.queryByText('meeting')).not.toBeInTheDocument();
  });

  it('listens once per Contact however many ready suggestions name them', async () => {
    serve(
      [
        suggestionDoc('a'),
        suggestionDoc('b', { occurredAt: '2026-09-11T15:00:00.000Z' }),
        suggestionDoc('c', { occurredAt: '2026-09-12T15:00:00.000Z' }),
      ],
      [{ id: 'c1', data: () => ({ name: 'Alex Chen' }) }],
    );
    render(<SuggestionsQueue />);

    expect(await screen.findAllByText('bnpb.queue_confirm')).toHaveLength(3);
    const interactionListeners = vi
      .mocked(onSnapshot)
      .mock.calls.filter(([ref]) => (ref as { path?: string }).path === 'contacts/c1/interactions');
    expect(interactionListeners).toHaveLength(1);
  });

  it('keeps the small buttons at the 44 px touch target', async () => {
    serve([
      suggestionDoc('ready'),
      suggestionDoc('who', { bnpbName: 'Zoe Quinn', bnpbContactId: 'p-9' }),
    ], [{ id: 'c1', data: () => ({ name: 'Alex Chen' }) }]);
    render(<SuggestionsQueue />);

    expect((await screen.findByText('bnpb.queue_change')).closest('button')).toHaveClass('min-h-[44px]');
    const dismissButtons = screen.getAllByText('bnpb.queue_dismiss').map((el) => el.closest('button'));
    for (const button of dismissButtons) expect(button).toHaveClass('min-h-[44px]');
  });
});

describe('SuggestionsQueue long text', () => {
  const long = 'x'.repeat(5001);
  const pending = {
    id: 'sug-1',
    syncId: 's1',
    bnpbContactId: 'p-1',
    bnpbName: 'Alex Chen',
    occurredAt: '2026-09-10T15:00:00.000Z',
    durationMinutes: 45,
    summary: long,
    medium: 'coffee',
    text: long,
    status: 'pending',
  };

  beforeEach(() => {
    mockedUseAuth.mockReturnValue(asUser('yilongwang05@gmail.com') as never);
    hoisted.batch.commit.mockClear();
    vi.mocked(onSnapshot).mockImplementation((ref: unknown, callback: unknown) => {
      const path = (ref as { path?: string })?.path ?? '';
      let docs: unknown[] = [];
      if (path === 'users/u1/interactionSuggestions') {
        docs = [{ id: pending.id, data: () => ({ ...pending }) }];
      } else if (path === 'contacts') {
        docs = [{ id: 'c1', data: () => ({ name: 'Alex Chen' }) }];
      }
      if (typeof callback === 'function') (callback as (snap: unknown) => void)({ docs });
      return vi.fn();
    });
  });

  it('caps the text at the Interaction limit and refuses a longer one with a clear message', async () => {
    render(<SuggestionsQueue />);
    const textarea = await screen.findByLabelText('bnpb.queue_text_label');
    expect(textarea).toHaveAttribute('maxLength', '5000');

    fireEvent.click(screen.getByText('bnpb.queue_confirm'));

    expect(await screen.findByText('bnpb.queue_text_too_long')).toBeInTheDocument();
    expect(hoisted.batch.commit).not.toHaveBeenCalled();
  });
});
