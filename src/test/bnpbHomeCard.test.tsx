import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

vi.mock('../components/AuthProvider', () => ({ useAuth: vi.fn() }));
vi.mock('../components/LanguageProvider', () => ({
  useLanguage: () => ({
    language: 'en',
    setLanguage: vi.fn(),
    isSpanish: false,
    t: (key: string) => {
      const templates: Record<string, string> = {
        'bnpb.home_review_count': '{n} interaction to review',
        'bnpb.home_review_count_plural': '{n} interactions to review',
        'bnpb.home_review_need_name': 'From BNPB · {n} need a name',
        'bnpb.home_review_cta': 'Review',
      };
      return templates[key] ?? key;
    },
  }),
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db: unknown, ...parts: string[]) => ({ path: parts.join('/') })),
  query: vi.fn((ref: unknown) => ref),
  orderBy: vi.fn(),
  onSnapshot: vi.fn(),
}));

vi.mock('../lib/firebase', () => ({
  db: {},
  handleFirestoreError: vi.fn(),
  OperationType: { CREATE: 'CREATE' },
}));

import { onSnapshot } from 'firebase/firestore';
import { useAuth } from '../components/AuthProvider';
import BnpbReviewCard from '../components/landing/BnpbReviewCard';

const asUser = (email: string) => ({
  user: { uid: 'u1', email, displayName: 'Owner', photoURL: '' },
  role: 'admin',
  isApproved: true,
  loading: false,
  ownerViewRole: null,
});
const mockedUseAuth = vi.mocked(useAuth);

function givenSuggestions(docs: { id: string; contactId?: string | null }[]) {
  vi.mocked(onSnapshot).mockImplementation((ref: unknown, callback: unknown) => {
    const path = (ref as { path?: string })?.path ?? '';
    const data =
      path === 'users/u1/interactionSuggestions'
        ? docs.map((d) => ({
            id: d.id,
            data: () => ({
              syncId: d.id,
              bnpbContactId: d.id,
              bnpbName: 'Someone',
              occurredAt: '2026-09-10T15:00:00.000Z',
              summary: 'Coffee',
              medium: 'coffee',
              text: 'Coffee',
              status: 'pending',
              contactId: d.contactId ?? null,
            }),
          }))
        : [];
    if (typeof callback === 'function') (callback as (snap: unknown) => void)({ docs: data });
    return vi.fn();
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('BnpbReviewCard', () => {
  it('is hidden at zero pending suggestions', () => {
    mockedUseAuth.mockReturnValue(asUser('yilongwang05@gmail.com') as never);
    givenSuggestions([]);
    const { container } = render(<BnpbReviewCard />);
    expect(container).toBeEmptyDOMElement();
  });

  it('is absent for a non-owner even when suggestions are waiting', () => {
    mockedUseAuth.mockReturnValue(asUser('someone@example.com') as never);
    givenSuggestions([{ id: 's1' }, { id: 's2' }]);
    const { container } = render(<BnpbReviewCard />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the pending count and the need-a-name line', async () => {
    mockedUseAuth.mockReturnValue(asUser('yilongwang05@gmail.com') as never);
    givenSuggestions([{ id: 's1' }, { id: 's2', contactId: 'c1' }]);
    render(<BnpbReviewCard />);

    expect(await screen.findByText('2 interactions to review')).toBeInTheDocument();
    expect(screen.getByText('From BNPB · 1 need a name')).toBeInTheDocument();
  });

  it('omits the need-a-name line when every suggestion has a Contact', async () => {
    mockedUseAuth.mockReturnValue(asUser('yilongwang05@gmail.com') as never);
    givenSuggestions([{ id: 's1', contactId: 'c1' }]);
    render(<BnpbReviewCard />);

    expect(await screen.findByText('1 interaction to review')).toBeInTheDocument();
    expect(screen.queryByText(/need a name|needs a name/)).not.toBeInTheDocument();
  });

  it('opens the queue page from the Review button', async () => {
    mockedUseAuth.mockReturnValue(asUser('yilongwang05@gmail.com') as never);
    givenSuggestions([{ id: 's1' }]);
    render(<BnpbReviewCard />);

    fireEvent.click(await screen.findByRole('button', { name: 'Review' }));
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/suggestions'));
  });
});
