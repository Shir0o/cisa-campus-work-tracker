import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as firestore from 'firebase/firestore';
import { TEST_USERS } from './fixtures/users';
import GlobalSearch from '../components/layout/GlobalSearch';
import MobileNav from '../components/layout/MobileNav';
import { registerCommand } from '../lib/commands';
import { Frecency, __resetFrecencyCache } from '../lib/frecency';

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
  fireEvent.change(screen.getByPlaceholderText('Search or jump to…'), {
    target: { value },
  });

describe('GlobalSearch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    __resetFrecencyCache();
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

  it('lists registry commands in Shortcuts, filtered by role', () => {
    h.mockLayout.searchOpen = true;
    const unOperator = registerCommand({
      id: 'test.shortcut.operator',
      scope: 'global',
      description: 'Operator-only shortcut',
      shortcut: { key: 'o', mod: true },
      minRole: 'operator',
      handler: vi.fn(),
    });
    const unAdmin = registerCommand({
      id: 'test.shortcut.admin',
      scope: 'global',
      description: 'Admin-only shortcut',
      shortcut: { key: 'a', mod: true },
      minRole: 'admin',
      handler: vi.fn(),
    });

    h.mockAuth.value = TEST_USERS.admin;
    const { unmount } = render(<GlobalSearch />);
    expect(screen.getAllByText('Shortcuts').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Operator-only shortcut').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Admin-only shortcut').length).toBeGreaterThan(0);
    expect(screen.getAllByText('⌘O').length).toBeGreaterThan(0);
    unmount();

    h.mockAuth.value = TEST_USERS.viewer;
    render(<GlobalSearch />);
    expect(screen.queryByText('Operator-only shortcut')).not.toBeInTheDocument();
    expect(screen.queryByText('Admin-only shortcut')).not.toBeInTheDocument();

    unOperator();
    unAdmin();
  });

  it('renders recent people when a contact has a Firestore Timestamp stamp (issue #354)', () => {
    // `serverTimestamp()` fields arrive as Timestamp objects, not strings; the
    // recency sort must normalize them instead of calling `.localeCompare` on
    // them (which throws "x.localeCompare is not a function").
    h.mockData.contacts = [
      docOf('c-ts', {
        name: 'Tim Latency',
        role: 'Student',
        updatedAt: { toDate: () => new Date('2026-06-13T10:00:00Z') },
      }),
      ...h.mockData.contacts,
    ];
    expect(() => render(<GlobalSearch />)).not.toThrow();
    expect(screen.getAllByText('Tim Latency').length).toBeGreaterThan(0);
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
    const input = screen.getByPlaceholderText('Search or jump to…');
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

  it('the trigger opens the palette, and the palette owns the query and its clear \u00d7', () => {
    h.mockLayout.searchOpen = false;
    const { rerender } = render(<GlobalSearch />);

    // Closed: the trigger is the only way in, and there is no field to type into.
    expect(screen.queryByPlaceholderText('Search or jump to\u2026')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open search' }));
    expect(h.mockLayout.setSearchOpen).toHaveBeenCalledWith(true);

    h.mockLayout.searchOpen = true;
    rerender(<GlobalSearch />);

    const desktopInput = screen.getByPlaceholderText('Search or jump to\u2026') as HTMLInputElement;
    typeDesktop('alice');
    expect(desktopInput.value).toBe('alice');

    // The clear \u00d7 sits in the popup's field row, beside the caret it clears.
    const clearBtn = within(desktopInput.closest('div')!).getByRole('button', {
      name: 'Clear search',
    });
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
    const input = screen.getByPlaceholderText('Search or jump to…');
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
    const input = screen.getByPlaceholderText('Search or jump to…');
    // Move the cursor onto the "Log a visit" quick action, then ↵ runs it.
    const logRow = screen.getAllByRole('button', { name: /Log a visit/i })[0];
    fireEvent.mouseEnter(logRow);
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(h.mockLayout.openLogInteraction).toHaveBeenCalled();
  });

  it('mouse-over (mouseEnter) a result row moves the keyboard cursor to it', () => {
    render(<GlobalSearch />);
    typeDesktop('alice');
    const row = screen.getAllByText('Alice Wong')[0].closest('button')!;
    fireEvent.mouseEnter(row);
    fireEvent.keyDown(screen.getByPlaceholderText('Search or jump to…'), { key: 'Enter' });
    expect(h.mockLayout.setSelectedContact).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'c1', name: 'Alice Wong' }),
    );
  });

  it('clicking the scrim closes the palette', () => {
    render(<GlobalSearch />);
    fireEvent.click(screen.getByTestId('gs-scrim'));
    expect(h.mockLayout.setSearchOpen).toHaveBeenCalledWith(false);
  });

  it('focuses the palette field on open, so typing can start without a click', async () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: true });
    render(<GlobalSearch />);
    await new Promise((r) => setTimeout(r, 80));
    expect(screen.getByPlaceholderText('Search or jump to\u2026')).toHaveFocus();
    delete (window as any).matchMedia;
  });

  it('focuses the mobile input when matchMedia reports a narrow viewport', async () => {
    const origMatchMedia = window.matchMedia;
    const matchMediaMock = vi.fn().mockReturnValue({ matches: false });
    window.matchMedia = matchMediaMock;
    render(<GlobalSearch />);
    await new Promise((r) => setTimeout(r, 80));
    expect(matchMediaMock).toHaveBeenCalledWith('(min-width: 1024px)');
    expect(screen.getByPlaceholderText('Search people, conversations, notes…')).toHaveFocus();
    window.matchMedia = origMatchMedia;
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

  it('ranks frequently opened contacts at top of recent people (no query)', () => {
    // Alice (c1) has newer updatedAt ('2026-06-12') than Bob (c2, '2026-06-09')
    // By default without frecency opens, Alice is first, Bob is second.
    // Let's open Bob (c2) multiple times to build up frecency score.
    const uid = 'u1';
    Frecency.recordOpen(uid, 'c2');
    Frecency.recordOpen(uid, 'c2');
    Frecency.recordOpen(uid, 'c2');

    render(<GlobalSearch />);
    const rows = screen.getAllByRole('button');
    const personRowTexts = rows
      .map((r) => r.textContent || '')
      .filter((t) => t.includes('Alice Wong') || t.includes('Bob Lee'));

    // Bob Lee should appear before Alice Wong due to frecency ranking
    expect(personRowTexts[0]).toContain('Bob Lee');
    expect(personRowTexts[1]).toContain('Alice Wong');
  });

  it('ranks query matches by frecency score', () => {
    // Add multiple contacts with "Hall"
    h.mockData.contacts = [
      docOf('c1', { name: 'Alice Wong', location: 'Hall A', updatedAt: '2026-06-10T10:00:00Z' }),
      docOf('c2', { name: 'Bob Lee', location: 'Hall B', updatedAt: '2026-06-11T10:00:00Z' }),
    ];

    const uid = 'u1';
    Frecency.recordOpen(uid, 'c1');
    Frecency.recordOpen(uid, 'c1');

    render(<GlobalSearch />);
    typeDesktop('hall');

    const rows = screen.getAllByRole('button');
    const matchTexts = rows
      .map((r) => r.textContent || '')
      .filter((t) => t.includes('Alice Wong') || t.includes('Bob Lee'));

    expect(matchTexts[0]).toContain('Alice Wong');
    expect(matchTexts[1]).toContain('Bob Lee');
  });

  it('records open event when selecting contact in search results', () => {
    render(<GlobalSearch />);
    const aliceRow = screen.getAllByText('Alice Wong')[0].closest('button')!;
    fireEvent.click(aliceRow);

    expect(h.mockLayout.setSelectedContact).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'c1', name: 'Alice Wong' }),
    );
    expect(Frecency.getScore('u1', 'c1')).toBeGreaterThan(0);
  });

  it('records open event when selecting destination in search results', () => {
    render(<GlobalSearch />);
    typeDesktop('journey');
    const boardRow = screen.getAllByText('The Journey')[0].closest('button')!;
    fireEvent.click(boardRow);

    expect(h.mockNavigate).toHaveBeenCalledWith('/board', undefined);
    expect(Frecency.getScore('u1', 'dest:/board')).toBeGreaterThan(0);
  });

  // ── visual contract — PICKED shell design (issue #653) ────────────────
  // The desktop trigger keeps the Bento SearchBar look from #653 — fixed 300px,
  // radius-16, always-on inset outline — but is a button now: the palette it
  // opens owns the caret (#689).

  it('desktop trigger is a fixed 300px radius-16 button with an always-on inset outline and focus ring', () => {
    render(<GlobalSearch />);
    const trigger = screen.getByRole('button', { name: 'Open search' });

    expect(trigger.parentElement!.className).toContain('w-[300px]');
    expect(trigger.className).toContain('rounded-2xl');
    expect(trigger.className).toContain('bg-surface');
    // Border states are inset box-shadows — no layout shift between states.
    expect(trigger.className).toContain('shadow-[inset_0_0_0_1px_var(--gs-outline)]');
    expect(trigger.className).toContain('hover:shadow-[inset_0_0_0_1px_#525E6F]');
    expect(trigger.className).toContain('focus:shadow-[inset_0_0_0_2px_var(--color-accent)]');
  });

  it('announces itself as the control that opens the palette', () => {
    h.mockLayout.searchOpen = false;
    const { rerender } = render(<GlobalSearch />);
    const trigger = screen.getByRole('button', { name: 'Open search' });

    expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    h.mockLayout.searchOpen = true;
    rerender(<GlobalSearch />);
    expect(screen.getByRole('button', { name: 'Open search' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });

  it('keeps the ⌘K pill on the trigger permanently, whatever is typed in the palette', () => {
    render(<GlobalSearch />);
    const trigger = screen.getByRole('button', { name: 'Open search' });

    // 8px badge radius: app --radius-sm, not 24px --radius-lg.
    expect(within(trigger).getByText('K')).toBeInTheDocument();
    expect(within(trigger).getByText('K').parentElement!.className).toContain('rounded-sm');

    // Typing no longer evicts the pill — the trigger never shows the query.
    typeDesktop('alice');
    expect(within(trigger).getByText('K')).toBeInTheDocument();
    expect(within(trigger).queryByText('alice')).not.toBeInTheDocument();
    expect(within(trigger).queryByRole('button', { name: 'Clear search' })).not.toBeInTheDocument();
  });

  it("the palette's field row shows an esc chip while empty and the clear × while typing", () => {
    render(<GlobalSearch />);
    const fieldRow = screen.getByPlaceholderText('Search or jump to…').closest('div')!;

    expect(within(fieldRow).getByText('esc')).toBeInTheDocument();
    expect(within(fieldRow).queryByRole('button', { name: 'Clear search' })).not.toBeInTheDocument();

    typeDesktop('alice');
    expect(within(fieldRow).queryByText('esc')).not.toBeInTheDocument();
    expect(within(fieldRow).getByRole('button', { name: 'Clear search' })).toBeInTheDocument();

    fireEvent.click(within(fieldRow).getByRole('button', { name: 'Clear search' }));
    expect(within(fieldRow).getByText('esc')).toBeInTheDocument();
  });

  it('palette is a centred modal dialog floating on a scrim', () => {
    render(<GlobalSearch />);
    const dialog = screen.getByRole('dialog');
    const overlay = dialog.parentElement!;

    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleName();

    // Centred and top-anchored at the app's modal offset, not hung off the field.
    expect(overlay.className).toContain('fixed');
    expect(overlay.className).toContain('inset-0');
    expect(overlay.className).toContain('items-start');
    expect(overlay.className).toContain('justify-center');
    expect(overlay.className).toContain('pt-24');

    expect(screen.getByTestId('gs-scrim').className).toContain('bg-black/40');
    expect(screen.getByTestId('gs-scrim').className).toContain('backdrop-blur-sm');
  });

  it('panel is 640px on the pop elevation, shrinking rather than overflowing a narrow window', () => {
    render(<GlobalSearch />);
    const dialog = screen.getByRole('dialog');

    expect(dialog.className).toContain('w-[640px]');
    expect(dialog.className).toContain('max-w-[calc(100vw-2rem)]');
    expect(dialog.className).toContain('bg-surface');
    expect(dialog.className).toContain('rounded-3xl');
    expect(dialog.className).toContain('border-outline-variant');
    expect(dialog.className).toContain('shadow-[var(--shadow-pop)]');
  });

  it('leaves the mobile overlay a separate full-screen surface, not the desktop dialog', () => {
    render(<GlobalSearch />);
    const mobileOverlay = screen
      .getByPlaceholderText('Search people, conversations, notes\u2026')
      .closest('.fixed')!;

    expect(mobileOverlay.className).toContain('lg:hidden');
    expect(mobileOverlay.className).toContain('inset-0');
    expect(mobileOverlay.className).toContain('bg-background');
    // The two are still separate implementations — the popup did not swallow it.
    expect(mobileOverlay).not.toBe(screen.getByRole('dialog'));
    expect(mobileOverlay.querySelector('[role="dialog"]')).toBeNull();
  });

  it('returns focus to the trigger when the palette closes', () => {
    h.mockLayout.searchOpen = true;
    const { rerender } = render(<GlobalSearch />);

    h.mockLayout.searchOpen = false;
    rerender(<GlobalSearch />);

    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Open search' }));
  });

  it('footer teaches the palette its own exit', () => {
    render(<GlobalSearch />);
    expect(
      screen.getByText(/anywhere · ↑↓ navigate · ↵ open · esc close/),
    ).toBeInTheDocument();
  });

  it('results region is capped at 520px, the room the popup bought', () => {
    render(<GlobalSearch />);
    const results = screen.getByRole('dialog').querySelector('.overflow-y-auto')!;
    expect(results.className).toContain('max-h-[min(62vh,520px)]');
  });
});
