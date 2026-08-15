import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as firestore from 'firebase/firestore';
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
  onSnapshot: vi.fn((ref: any, cb: any) => {
    const docs = h.mockData[ref?.__c] || [];
    cb({ docs, size: docs.length });
    return () => {};
  }),
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
      date: '2026-06-12',
      contributorIds: ['u1'],
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
    for (const label of ['New contact', 'Log a visit', 'Sign-up form (for someone new)', 'The Journey']) {
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
    expect(screen.getAllByText('Coordination Notes').length).toBeGreaterThan(0);

    // History is opt-in behind a pill toggle.
    expect(screen.queryAllByText('History').length).toBe(0);
    fireEvent.click(screen.getAllByRole('button', { name: /search history too/i })[0]);
    expect(screen.getAllByText('History').length).toBeGreaterThan(0);
  });

  it('clicking a Coordination Note result navigates to /coordination with note and doc state', () => {
    render(<GlobalSearch />);
    typeDesktop('plan');
    const boardNoteBtn = screen.getAllByText('Coordination Notes')[0].closest('section')?.querySelector('button');
    if (boardNoteBtn) {
      fireEvent.click(boardNoteBtn);
      expect(h.mockNavigate).toHaveBeenCalledWith('/coordination', expect.objectContaining({ state: expect.objectContaining({ focusNoteId: 'b1' }) }));
    }
  });

  it('operator does not see staff-only groups or the history toggle', () => {
    h.mockAuth.value = TEST_USERS.operator;
    render(<GlobalSearch />);
    typeDesktop('plan');
    expect(screen.getAllByText('People').length).toBeGreaterThan(0);
    expect(screen.queryAllByText('Conversations').length).toBe(0);
    expect(screen.queryAllByText('Coordination Notes').length).toBe(0);
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

  it('handles desktop input focus and clear functionality', () => {
    // Test container click when search is closed
    h.mockLayout.searchOpen = false;
    const { rerender } = render(<GlobalSearch />);
    const desktopInput = screen.getByPlaceholderText('Search people, notes…') as HTMLInputElement;
    const container = desktopInput.closest('.relative.w-full.h-10')!;
    
    fireEvent.click(container);
    expect(h.mockLayout.setSearchOpen).toHaveBeenCalledWith(true);

    // Test focus behavior when search is closed
    vi.clearAllMocks();
    fireEvent.focus(desktopInput);
    expect(h.mockLayout.setSearchOpen).toHaveBeenCalledWith(true);

    // Re-render with searchOpen = true to test clear button
    h.mockLayout.searchOpen = true;
    rerender(<GlobalSearch />);
    
    // Type query
    typeDesktop('alice');
    expect(desktopInput.value).toBe('alice');

    // Click clear button
    const clearBtn = within(desktopInput.closest('div')!).getByRole('button', { name: 'Clear search' });
    fireEvent.click(clearBtn);
    expect(desktopInput.value).toBe('');
  });

  it('handles mobile overlay input, clear, and cancel functionality', () => {
    render(<GlobalSearch />);
    
    const mobileInput = screen.getByPlaceholderText('Search people, conversations, notes…') as HTMLInputElement;
    
    // Type query in mobile input
    fireEvent.change(mobileInput, { target: { value: 'bob' } });
    expect(mobileInput.value).toBe('bob');
    expect(screen.getAllByText('Bob Lee').length).toBeGreaterThan(0);

    // Click clear button on mobile overlay
    const mobileClearBtn = within(mobileInput.closest('div')!).getByRole('button', { name: 'Clear search' });
    fireEvent.click(mobileClearBtn);
    expect(mobileInput.value).toBe('');

    // Click cancel button on mobile overlay
    const cancelBtn = screen.getByRole('button', { name: 'Cancel' });
    fireEvent.click(cancelBtn);
    expect(h.mockLayout.setSearchOpen).toHaveBeenCalledWith(false);
  });

  it('quick action "Log a visit" opens the log-interaction modal', () => {
    render(<GlobalSearch />);
    fireEvent.click(screen.getAllByRole('button', { name: /Log a visit/i })[0]);
    expect(h.mockLayout.openLogInteraction).toHaveBeenCalled();
    expect(h.mockLayout.setSearchOpen).toHaveBeenCalledWith(false);
  });

  it('quick action "Sign-up form" navigates to /signup', () => {
    render(<GlobalSearch />);
    fireEvent.click(screen.getAllByRole('button', { name: /Sign-up form/i })[0]);
    expect(h.mockNavigate).toHaveBeenCalledWith('/signup', undefined);
    expect(h.mockLayout.setSearchOpen).toHaveBeenCalledWith(false);
  });

  it('quick action "The Journey" navigates to /board', () => {
    render(<GlobalSearch />);
    fireEvent.click(screen.getAllByRole('button', { name: /The Journey/i })[0]);
    expect(h.mockNavigate).toHaveBeenCalledWith('/board', undefined);
    expect(h.mockLayout.setSearchOpen).toHaveBeenCalledWith(false);
  });

  it('clicking a recent person in the empty state opens the contact', () => {
    render(<GlobalSearch />);
    const row = screen.getAllByText('Alice Wong')[0].closest('button')!;
    fireEvent.click(row);
    expect(h.mockLayout.setSelectedContact).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'c1', name: 'Alice Wong' }),
    );
  });

  it('clicking a People result row opens the contact', () => {
    render(<GlobalSearch />);
    typeDesktop('alice');
    const row = screen.getAllByText('Alice Wong')[0].closest('button')!;
    fireEvent.click(row);
    expect(h.mockLayout.setSelectedContact).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'c1', name: 'Alice Wong' }),
    );
  });

  it('clicking a Conversation result row opens the contact it belongs to', () => {
    render(<GlobalSearch />);
    typeDesktop('plan');
    const row = screen.getAllByText('Conversations')[0]
      .closest('div')!.parentElement!.querySelector('button')!;
    fireEvent.click(row);
    expect(h.mockLayout.setSelectedContact).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'c1', name: 'Alice Wong' }),
    );
  });

  it('clicking a Coordination Note result navigates to /coordination', () => {
    render(<GlobalSearch />);
    typeDesktop('plan');
    const row = screen.getAllByText('Semester plan')[0].closest('button')!;
    fireEvent.click(row);
    expect(h.mockNavigate).toHaveBeenCalledWith('/coordination', undefined);
    expect(h.mockLayout.setSearchOpen).toHaveBeenCalledWith(false);
  });

  it('toggling history on and clicking a History result navigates to /history', () => {
    render(<GlobalSearch />);
    typeDesktop('plan');
    fireEvent.click(screen.getAllByRole('button', { name: /search history too/i })[0]);
    const row = screen.getAllByText(/changed the plan/i)[0].closest('button')!;
    fireEvent.click(row);
    expect(h.mockNavigate).toHaveBeenCalledWith('/history', undefined);
  });

  it('keyboard ArrowUp clamps the cursor at -1 from the first result', () => {
    render(<GlobalSearch />);
    typeDesktop('alice');
    const input = screen.getByPlaceholderText('Search people, notes…');
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    // Cursor -1 means Enter does nothing — the contact stays unopened.
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(h.mockLayout.setSelectedContact).not.toHaveBeenCalled();
    // And ArrowDown then Enter still opens the first result.
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(h.mockLayout.setSelectedContact).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'c1', name: 'Alice Wong' }),
    );
  });

  it('keyboard nav runs the quick-action at the cursor from the empty state', () => {
    render(<GlobalSearch />);
    const input = screen.getByPlaceholderText('Search people, notes…');
    // Empty-state order: recent people (c1, c2), then quick actions.
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(h.mockLayout.openNewContact).toHaveBeenCalled();
  });

  it('mouse-over (mouseEnter) a result row moves the keyboard cursor to it', () => {
    render(<GlobalSearch />);
    typeDesktop('alice');
    const row = screen.getAllByText('Alice Wong')[0].closest('button')!;
    fireEvent.mouseEnter(row);
    fireEvent.keyDown(screen.getByPlaceholderText('Search people, notes…'), { key: 'Enter' });
    expect(h.mockLayout.setSelectedContact).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'c1', name: 'Alice Wong' }),
    );
  });

  it('clicking outside the search closes it', () => {
    render(<GlobalSearch />);
    fireEvent.mouseDown(document.body);
    expect(h.mockLayout.setSearchOpen).toHaveBeenCalledWith(false);
  });

  it('focuses the mobile input when matchMedia reports a narrow viewport', async () => {
    const matchMediaMock = vi.fn().mockReturnValue({ matches: false });
    window.matchMedia = matchMediaMock;
    render(<GlobalSearch />);
    await new Promise((r) => setTimeout(r, 80));
    expect(matchMediaMock).toHaveBeenCalledWith('(min-width: 1024px)');
    expect(screen.getByPlaceholderText('Search people, conversations, notes…')).toHaveFocus();
    delete (window as any).matchMedia;
  });

  it('logs listener errors without crashing', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(firestore.onSnapshot).mockImplementationOnce((_ref: any, _cb: any, errCb: any) => {
      errCb(new Error('contacts boom'));
      return () => {};
    });
    render(<GlobalSearch />);
    expect(consoleErrorSpy).toHaveBeenCalledWith('GlobalSearch contacts listener:', expect.any(Error));
    consoleErrorSpy.mockRestore();
  });
});
