import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TEST_USERS } from './fixtures/users';
import GlobalSearch from '../components/layout/GlobalSearch';
import MobileNav from '../components/layout/MobileNav';

// Hoisted shared spies + mutable dataset so the firestore/auth/layout mocks and
// the tests reference the same instances.
const h = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockData: {
    contacts: [] as any[],
    interactions: [] as any[],
    board_notes: [] as any[],
    activities: [] as any[],
  } as Record<string, any[]>,
  mockAuth: { value: null as any },
  mockLayout: {
    isMobileMenuOpen: false,
    setIsMobileMenuOpen: vi.fn(),
    setSelectedContact: vi.fn(),
    openNewContact: vi.fn(),
    openLogInteraction: vi.fn(),
    searchOpen: true,
    setSearchOpen: vi.fn(),
  },
}));

vi.mock('react-router-dom', async (orig) => ({
  ...(await orig<typeof import('react-router-dom')>()),
  useNavigate: () => h.mockNavigate,
}));

vi.mock('../components/AuthProvider', () => ({
  useAuth: () => h.mockAuth.value,
}));

vi.mock('../App', () => ({
  useLayout: () => h.mockLayout,
}));

vi.mock('../lib/firebase', () => ({
  db: {},
  auth: { currentUser: { uid: 'u1' } },
}));

vi.mock('motion/react', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

vi.mock('firebase/firestore', () => ({
  collection: (_db: any, name: string) => ({ __c: name }),
  collectionGroup: (_db: any, name: string) => ({ __c: name }),
  query: (ref: any) => ref,
  orderBy: () => ({}),
  limit: () => ({}),
  onSnapshot: (ref: any, cb: any) => {
    const docs = h.mockData[ref?.__c] || [];
    cb({ docs, size: docs.length });
    return () => {};
  },
}));

const docOf = (id: string, data: Record<string, any>, extra: Record<string, any> = {}) => ({
  id,
  data: () => data,
  ...extra,
});

function seedData() {
  h.mockData.contacts = [
    docOf('c1', {
      name: 'Alice Wong',
      role: 'Student',
      location: 'North Hall',
      notes: 'planning to join',
      tags: ['freshman'],
      updatedAt: '2026-06-12T10:00:00Z',
    }),
    docOf('c2', {
      name: 'Bob Lee',
      role: 'Faculty',
      location: 'Science Bldg',
      notes: 'no match',
      tags: [],
      updatedAt: '2026-06-09T10:00:00Z',
    }),
  ];
  h.mockData.interactions = [
    docOf(
      'i1',
      { content: 'Discussed the plan for next term', createdAt: '2026-06-12T09:00:00Z' },
      { ref: { parent: { parent: { id: 'c1' } } } },
    ),
  ];
  h.mockData.board_notes = [
    docOf('b1', {
      type: 'record',
      title: 'Semester plan',
      body: 'kickoff notes',
      series: 'Team',
      tags: ['kickoff'],
      updatedByName: 'Sam',
    }),
  ];
  h.mockData.activities = [
    docOf('a1', {
      action: 'updated',
      description: 'changed the plan',
      userName: 'Sam',
      targetName: 'Alice Wong',
      createdAt: '2026-06-12T08:00:00Z',
    }),
  ];
}

const typeDesktop = (value: string) =>
  fireEvent.change(screen.getByPlaceholderText('Search people, notes…'), {
    target: { value },
  });

describe('GlobalSearch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    seedData();
    h.mockAuth.value = TEST_USERS.admin;
    h.mockLayout.searchOpen = true;
  });

  it('⌘K opens the search (calls setSearchOpen)', () => {
    h.mockLayout.searchOpen = false;
    render(<GlobalSearch />);
    fireEvent.keyDown(document, { key: 'k', metaKey: true });
    expect(h.mockLayout.setSearchOpen).toHaveBeenCalledWith(true);
  });

  it('empty state shows recent people + role-aware quick actions', () => {
    render(<GlobalSearch />);
    expect(screen.getAllByText('Recent people').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Quick actions').length).toBeGreaterThan(0);
    // recency proxy: most-recently-updated contact first
    expect(screen.getAllByText('Alice Wong').length).toBeGreaterThan(0);
    for (const label of ['New contact', 'Log a visit', 'Open sign-up form', 'The Journey']) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
  });

  it('typing filters the People group', () => {
    render(<GlobalSearch />);
    typeDesktop('alice');
    expect(screen.getAllByText('People').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Alice Wong').length).toBeGreaterThan(0);
    expect(screen.queryAllByText('Bob Lee').length).toBe(0);
  });

  it('admin sees Conversations, The Board, and an opt-in History group', () => {
    render(<GlobalSearch />);
    typeDesktop('plan');
    expect(screen.getAllByText('People').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Conversations').length).toBeGreaterThan(0);
    expect(screen.getAllByText('The Board').length).toBeGreaterThan(0);

    // History is opt-in behind a pill toggle.
    expect(screen.queryAllByText('History').length).toBe(0);
    fireEvent.click(screen.getAllByRole('button', { name: /search history too/i })[0]);
    expect(screen.getAllByText('History').length).toBeGreaterThan(0);
  });

  it('operator does not see staff-only groups or the history toggle', () => {
    h.mockAuth.value = TEST_USERS.operator;
    render(<GlobalSearch />);
    typeDesktop('plan');
    expect(screen.getAllByText('People').length).toBeGreaterThan(0);
    expect(screen.queryAllByText('Conversations').length).toBe(0);
    expect(screen.queryAllByText('The Board').length).toBe(0);
    expect(screen.queryAllByRole('button', { name: /search history too/i }).length).toBe(0);
  });

  it('↓ then ↵ opens the focused contact', () => {
    render(<GlobalSearch />);
    typeDesktop('alice');
    const input = screen.getByPlaceholderText('Search people, notes…');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(h.mockLayout.setSelectedContact).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'c1', name: 'Alice Wong' }),
    );
  });

  it('Escape closes the search', () => {
    render(<GlobalSearch />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(h.mockLayout.setSearchOpen).toHaveBeenCalledWith(false);
  });

  it('quick action "New contact" opens the new-contact modal', () => {
    render(<GlobalSearch />);
    fireEvent.click(screen.getAllByRole('button', { name: /New contact/i })[0]);
    expect(h.mockLayout.openNewContact).toHaveBeenCalled();
    expect(h.mockLayout.setSearchOpen).toHaveBeenCalledWith(false);
  });

  it('mobile bottom-nav search button opens the overlay', () => {
    h.mockAuth.value = TEST_USERS.operator;
    render(
      <MemoryRouter>
        <MobileNav />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: /search/i }));
    expect(h.mockLayout.setSearchOpen).toHaveBeenCalledWith(true);
  });
});
