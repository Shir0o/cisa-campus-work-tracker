import React from 'react';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { onSnapshot, setDoc, deleteDoc, doc, collection, updateDoc } from 'firebase/firestore';
import { remove as dbRemove } from 'firebase/database';
import CoordinationNotes from '../views/CoordinationNotes';
import { useAuth } from '../components/AuthProvider';

// ── Auth mock ────────────────────────────────────────────────────────────────
vi.mock('../components/AuthProvider', () => ({
  useAuth: vi.fn(),
}));

// ── TipTap (thin seam) ──────────────────────────────────────────────────────
vi.mock('@tiptap/react', () => ({
  useEditor: () => null,
  EditorContent: () => <div data-testid="tiptap-editor">Editor</div>,
}));
vi.mock('@tiptap/starter-kit', () => ({
  StarterKit: { configure: () => ({}) },
}));
vi.mock('@tiptap/extension-collaboration', () => ({
  Collaboration: { configure: () => ({}) },
}));
vi.mock('@tiptap/extension-collaboration-caret', () => ({
  CollaborationCaret: { configure: () => ({}) },
}));
vi.mock('@tiptap/extension-task-list', () => ({
  TaskList: { configure: () => ({}) },
}));
vi.mock('@tiptap/extension-task-item', () => ({
  TaskItem: { configure: () => ({}) },
}));
vi.mock('@tiptap/extension-placeholder', () => ({
  Placeholder: { configure: () => ({}) },
}));
vi.mock('tiptap-markdown', () => ({
  Markdown: { configure: () => ({}) },
}));

// ── Yjs (thin seam) ─────────────────────────────────────────────────────────
vi.mock('yjs', () => {
  class MockDoc {
    getText() {
      return { toJSON: () => '', observe: vi.fn(), toString: () => '' };
    }
    destroy() {}
    on() {}
    off() {}
  }
  return { Doc: MockDoc };
});
vi.mock('y-protocols/awareness', () => {
  class MockAwareness {
    setLocalStateField() {}
    on() {}
    off() {}
    destroy() {}
    getStates() {
      return new Map();
    }
    get clientID() {
      return 1;
    }
  }
  return { Awareness: MockAwareness };
});
vi.mock('../lib/yjsRtdbProvider', () => ({
  RtdbYjsProvider: vi.fn().mockImplementation(() => ({
    destroy: vi.fn(),
    awareness: {
      setLocalStateField: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
      getStates: () => new Map(),
    },
  })),
}));

// ── Firestore ────────────────────────────────────────────────────────────────
vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db: unknown, path: string) => ({ path })),
  onSnapshot: vi.fn((_ref: unknown, _cb: unknown) => vi.fn()),
  query: vi.fn((ref: unknown) => ref),
  orderBy: vi.fn(),
  doc: vi.fn((_db: unknown, coll: string, id?: string) => ({
    path: id ? `${coll}/${id}` : coll,
    id: id || 'auto-id',
  })),
  setDoc: vi.fn(() => Promise.resolve()),
  updateDoc: vi.fn(() => Promise.resolve()),
  deleteDoc: vi.fn(() => Promise.resolve()),
  serverTimestamp: vi.fn(() => 'mock-timestamp'),
}));

vi.mock('firebase/database', () => ({
  ref: vi.fn(),
  remove: vi.fn(() => Promise.resolve()),
}));

vi.mock('../lib/firebase', () => ({
  db: {},
  rtdb: {},
  handleFirestoreError: vi.fn(),
  OperationType: {
    LIST: 'LIST',
    CREATE: 'CREATE',
    UPDATE: 'UPDATE',
    DELETE: 'DELETE',
  },
  logActivity: vi.fn(),
}));

// ── Fixture data ─────────────────────────────────────────────────────────────
const today = new Date().toISOString().slice(0, 10);

const mockDocs = [
  {
    id: `doc-${today}`,
    data: () => ({
      title: `${today} — Monday`,
      date: today,
      weekday: 'Monday',
      md: '# Team standup\n- [x] Review goals',
      createdBy: 'u-admin',
      updatedAt: 'mock-ts',
    }),
  },
  {
    id: 'doc-2026-06-10',
    data: () => ({
      title: '2026-06-10 — Wednesday',
      date: '2026-06-10',
      weekday: 'Wednesday',
      md: '# Earlier meeting\n- discuss plans',
      createdBy: 'u-admin',
      updatedAt: 'mock-ts',
    }),
  },
];

const mockNotes = [
  {
    id: 'note-1',
    data: () => ({
      type: 'record',
      series: 'Weekly sync',
      title: 'Sprint planning',
      body: 'Discussed roadmap items',
      tags: ['planning', 'q3'],
      date: today,
      contributorIds: ['u-admin'],
      createdBy: 'u-admin',
    }),
  },
  {
    id: 'note-2',
    data: () => ({
      type: 'learning',
      series: 'Devotionals',
      title: 'Morning reflection',
      body: 'Grateful for the team',
      tags: [],
      date: '2026-06-10',
      contributorIds: [],
      createdBy: 'u-admin',
    }),
  },
];

const mockTeam = [
  {
    id: 'u-admin',
    data: () => ({
      uid: 'u-admin',
      displayName: 'Tony Wang',
      email: 'yilongwang05@gmail.com',
      approved: true,
      role: 'admin',
    }),
  },
];

// ── Helpers ──────────────────────────────────────────────────────────────────
const adminAuth = {
  user: {
    uid: 'u-admin',
    email: 'yilongwang05@gmail.com',
    displayName: 'Tony Wang',
  },
  isAdmin: true,
  role: 'admin',
  isApproved: true,
  loading: false,
};

const nonAdminAuth = {
  user: {
    uid: 'u-other',
    email: 'someone@test.com',
    displayName: 'Someone Else',
  },
  isAdmin: false,
  role: 'volunteer',
  isApproved: true,
  loading: false,
};

/**
 * Configure path-routing onSnapshot so each collection gets its own data.
 * The callback can be skipped entirely (for loading tests) by passing `neverFire`.
 */
function setupSnapshots(
  opts: {
    docs?: typeof mockDocs;
    notes?: typeof mockNotes;
    team?: typeof mockTeam;
    neverFire?: boolean;
  } = {},
) {
  const { docs = [], notes = [], team = [], neverFire = false } = opts;
  (onSnapshot as ReturnType<typeof vi.fn>).mockImplementation(
    (ref: { path?: string }, callback: (snap: unknown) => void) => {
      if (neverFire) return vi.fn();
      const path = ref?.path || '';
      if (path === 'board_docs') {
        callback({ docs: docs, size: docs.length });
      } else if (path === 'board_notes') {
        callback({ docs: notes, size: notes.length });
      } else if (path === 'users') {
        callback({ docs: team, size: team.length });
      } else {
        callback({ docs: [], size: 0 });
      }
      return vi.fn();
    },
  );
}

// ── Tests ────────────────────────────────────────────────────────────────────
describe('CoordinationNotes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useAuth as ReturnType<typeof vi.fn>).mockReturnValue(adminAuth);
    setupSnapshots();
  });

  // ── 1. Access gate ────────────────────────────────────────────────────────
  describe('access gate', () => {
    it('shows access-denied message for non-admin, non-owner users', () => {
      (useAuth as ReturnType<typeof vi.fn>).mockReturnValue(nonAdminAuth);
      render(<CoordinationNotes />);

      expect(
        screen.getByRole('heading', { name: /a space for the core team/i }),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/the board is where the full-time team thinks together/i),
      ).toBeInTheDocument();
      // Main content should NOT be present
      expect(screen.queryByRole('heading', { name: /the board/i, level: 1 })).not.toBeInTheDocument();
    });
  });

  // ── 2. Loading state ──────────────────────────────────────────────────────
  describe('loading state', () => {
    it('renders skeleton elements when onSnapshot has not yet fired', () => {
      setupSnapshots({ neverFire: true });
      render(<CoordinationNotes />);

      const skeletons = document.querySelectorAll('.animate-pulse');
      expect(skeletons.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ── 3. Empty state ────────────────────────────────────────────────────────
  describe('empty state', () => {
    it('shows empty-docs message when no documents exist', () => {
      setupSnapshots({ docs: [], notes: [], team: mockTeam });
      render(<CoordinationNotes />);

      expect(screen.getByText(/no pages yet/i)).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: /start a page/i }),
      ).toBeInTheDocument();
    });

    it('shows empty-notes message when no notes exist', () => {
      setupSnapshots({ docs: mockDocs, notes: [], team: mockTeam });
      render(<CoordinationNotes />);

      expect(
        screen.getByText(/no notes yet/i),
      ).toBeInTheDocument();
    });
  });

  // ── 4. Document list rendering ────────────────────────────────────────────
  describe('document list rendering', () => {
    it('renders doc titles in the sidebar', async () => {
      setupSnapshots({ docs: mockDocs, notes: [], team: mockTeam });
      render(<CoordinationNotes />);

      await waitFor(() => {
        expect(screen.getByText(`${today} — Monday`)).toBeInTheDocument();
        expect(screen.getByText('2026-06-10 — Wednesday')).toBeInTheDocument();
      });
    });

    it('renders the main header "The Board"', () => {
      setupSnapshots({ docs: mockDocs, notes: [], team: mockTeam });
      render(<CoordinationNotes />);

      expect(
        screen.getByRole('heading', { name: /the board/i, level: 1 }),
      ).toBeInTheDocument();
    });
  });

  // ── 5. Create new doc ─────────────────────────────────────────────────────
  describe('create new doc', () => {
    it('calls setDoc when clicking the header "New page" button', async () => {
      setupSnapshots({ docs: mockDocs, notes: [], team: mockTeam });
      render(<CoordinationNotes />);

      const newPageBtns = screen.getAllByRole('button', { name: /new page/i });
      fireEvent.click(newPageBtns[0]);

      await waitFor(() => {
        expect(setDoc).toHaveBeenCalled();
      });
    });

    it('calls setDoc when clicking "Start a page" in empty state', async () => {
      setupSnapshots({ docs: [], notes: [], team: mockTeam });
      render(<CoordinationNotes />);

      const btn = screen.getByRole('button', { name: /start a page/i });
      fireEvent.click(btn);

      await waitFor(() => {
        expect(setDoc).toHaveBeenCalled();
      });
    });
  });

  // ── 6. Delete doc ─────────────────────────────────────────────────────────
  describe('delete doc', () => {
    it('calls deleteDoc after confirm when clicking delete button', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      setupSnapshots({ docs: mockDocs, notes: [], team: mockTeam });
      render(<CoordinationNotes />);

      // The delete button is inside the DocEditor area (title="Delete this page")
      await waitFor(() => {
        const deleteBtn = screen.getByTitle('Delete this page');
        expect(deleteBtn).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTitle('Delete this page'));

      await waitFor(() => {
        expect(deleteDoc).toHaveBeenCalled();
      });
    });

    it('does not call deleteDoc when confirm is cancelled', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(false);
      setupSnapshots({ docs: mockDocs, notes: [], team: mockTeam });
      render(<CoordinationNotes />);

      await waitFor(() => {
        expect(screen.getByTitle('Delete this page')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTitle('Delete this page'));

      expect(deleteDoc).not.toHaveBeenCalled();
    });
  });

  // ── 7. Notes section renders ──────────────────────────────────────────────
  describe('notes section', () => {
    it('renders note card titles and type badges', async () => {
      setupSnapshots({ docs: mockDocs, notes: mockNotes, team: mockTeam });
      render(<CoordinationNotes />);

      await waitFor(() => {
        expect(screen.getByText('Sprint planning')).toBeInTheDocument();
        expect(screen.getByText('Morning reflection')).toBeInTheDocument();
      });

      // Type badges
      expect(screen.getByText('Record')).toBeInTheDocument();
      expect(screen.getByText('Learning')).toBeInTheDocument();
    });

    it('renders "Notes & learnings" section heading', () => {
      setupSnapshots({ docs: mockDocs, notes: mockNotes, team: mockTeam });
      render(<CoordinationNotes />);

      expect(
        screen.getByRole('heading', { name: /notes & learnings/i }),
      ).toBeInTheDocument();
    });

    it('renders series labels on note cards', async () => {
      setupSnapshots({ docs: mockDocs, notes: mockNotes, team: mockTeam });
      render(<CoordinationNotes />);

      await waitFor(() => {
        expect(screen.getAllByText('Weekly sync')[0]).toBeInTheDocument();
        expect(screen.getAllByText('Devotionals')[0]).toBeInTheDocument();
      });
    });
  });

  // ── 8. Add note form ──────────────────────────────────────────────────────
  describe('add note form', () => {
    it('shows form when "Add a note" is clicked and submits via setDoc', async () => {
      setupSnapshots({ docs: mockDocs, notes: mockNotes, team: mockTeam });
      render(<CoordinationNotes />);

      // Click "Add a note"
      const addBtn = screen.getByRole('button', { name: /add a note/i });
      fireEvent.click(addBtn);

      // Form inputs should appear
      await waitFor(() => {
        expect(
          screen.getByPlaceholderText(/a short title/i),
        ).toBeInTheDocument();
      });

      // Fill form fields
      fireEvent.change(screen.getByPlaceholderText(/a short title/i), {
        target: { value: 'My new note' },
      });
      fireEvent.change(
        screen.getByPlaceholderText(/what happened, or what you learned/i),
        { target: { value: 'Some reflection content' } },
      );
      fireEvent.change(screen.getByPlaceholderText(/tags/i), {
        target: { value: 'tag1, tag2' },
      });

      // Submit
      const saveBtn = screen.getByRole('button', { name: /save to archive/i });
      fireEvent.click(saveBtn);

      await waitFor(() => {
        expect(setDoc).toHaveBeenCalled();
      });
    });

    it('save button is disabled when title is empty', () => {
      setupSnapshots({ docs: mockDocs, notes: [], team: mockTeam });
      render(<CoordinationNotes />);

      fireEvent.click(screen.getByRole('button', { name: /add a note/i }));

      const saveBtn = screen.getByRole('button', { name: /save to archive/i });
      expect(saveBtn).toBeDisabled();
    });
  });

  // ── 9. Remove note ────────────────────────────────────────────────────────
  describe('remove note', () => {
    it('calls deleteDoc after confirm when removing a note', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      setupSnapshots({ docs: mockDocs, notes: mockNotes, team: mockTeam });
      render(<CoordinationNotes />);

      // The remove buttons are titled "Remove from archive"
      await waitFor(() => {
        expect(screen.getAllByTitle('Remove from archive').length).toBeGreaterThan(0);
      });

      fireEvent.click(screen.getAllByTitle('Remove from archive')[0]);

      await waitFor(() => {
        expect(deleteDoc).toHaveBeenCalled();
      });
    });

    it('does not call deleteDoc when confirm is cancelled', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(false);
      setupSnapshots({ docs: mockDocs, notes: mockNotes, team: mockTeam });
      render(<CoordinationNotes />);

      await waitFor(() => {
        expect(screen.getAllByTitle('Remove from archive').length).toBeGreaterThan(0);
      });

      fireEvent.click(screen.getAllByTitle('Remove from archive')[0]);

      expect(deleteDoc).not.toHaveBeenCalled();
    });
  });

  // ── 10. Notes search ──────────────────────────────────────────────────────
  describe('notes search', () => {
    it('filters notes by search query', async () => {
      setupSnapshots({ docs: mockDocs, notes: mockNotes, team: mockTeam });
      render(<CoordinationNotes />);

      await waitFor(() => {
        expect(screen.getByText('Sprint planning')).toBeInTheDocument();
        expect(screen.getByText('Morning reflection')).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText(/search notes/i);
      fireEvent.change(searchInput, { target: { value: 'sprint' } });

      await waitFor(() => {
        expect(screen.getByText('Sprint planning')).toBeInTheDocument();
        expect(screen.queryByText('Morning reflection')).not.toBeInTheDocument();
      });
    });

    it('shows no-match message when search yields no results', async () => {
      setupSnapshots({ docs: mockDocs, notes: mockNotes, team: mockTeam });
      render(<CoordinationNotes />);

      const searchInput = screen.getByPlaceholderText(/search notes/i);
      fireEvent.change(searchInput, { target: { value: 'xyznonexistent' } });

      await waitFor(() => {
        expect(screen.getByText(/no notes match that yet/i)).toBeInTheDocument();
      });
    });
  });

  // ── 11. Notes kind filter ─────────────────────────────────────────────────
  describe('notes kind filter', () => {
    it('filters to records when "Records" is clicked', async () => {
      setupSnapshots({ docs: mockDocs, notes: mockNotes, team: mockTeam });
      render(<CoordinationNotes />);

      await waitFor(() => {
        expect(screen.getByText('Sprint planning')).toBeInTheDocument();
        expect(screen.getByText('Morning reflection')).toBeInTheDocument();
      });

      // The kind filter buttons: "All", "Records", "Learnings"
      const recordsBtn = screen.getAllByRole('button', { name: 'Records' })[0];
      fireEvent.click(recordsBtn);

      await waitFor(() => {
        expect(screen.getByText('Sprint planning')).toBeInTheDocument();
        expect(screen.queryByText('Morning reflection')).not.toBeInTheDocument();
      });
    });

    it('filters to learnings when "Learnings" is clicked', async () => {
      setupSnapshots({ docs: mockDocs, notes: mockNotes, team: mockTeam });
      render(<CoordinationNotes />);

      await waitFor(() => {
        expect(screen.getByText('Sprint planning')).toBeInTheDocument();
        expect(screen.getByText('Morning reflection')).toBeInTheDocument();
      });

      const learningsBtn = screen.getAllByRole('button', { name: 'Learnings' })[0];
      fireEvent.click(learningsBtn);

      await waitFor(() => {
        expect(screen.getByText('Morning reflection')).toBeInTheDocument();
        expect(screen.queryByText('Sprint planning')).not.toBeInTheDocument();
      });
    });
  });

  // ── 12. Notes series filter ───────────────────────────────────────────────
  describe('notes series filter', () => {
    it('filters notes by series chip', async () => {
      setupSnapshots({ docs: mockDocs, notes: mockNotes, team: mockTeam });
      render(<CoordinationNotes />);

      await waitFor(() => {
        expect(screen.getByText('Sprint planning')).toBeInTheDocument();
        expect(screen.getByText('Morning reflection')).toBeInTheDocument();
      });

      // The notes have series 'Weekly sync' and 'Devotionals'.
      // Both should appear as series chip buttons.
      // Click the 'Weekly sync' chip to filter.
      const chip = screen.getByRole('button', { name: 'Weekly sync' });
      fireEvent.click(chip);

      await waitFor(() => {
        expect(screen.getByText('Sprint planning')).toBeInTheDocument();
        expect(screen.queryByText('Morning reflection')).not.toBeInTheDocument();
      });
    });

    it('shows all notes when "All" series chip is clicked', async () => {
      setupSnapshots({ docs: mockDocs, notes: mockNotes, team: mockTeam });
      render(<CoordinationNotes />);

      // First filter to a specific series
      const chip = screen.getByRole('button', { name: 'Weekly sync' });
      fireEvent.click(chip);

      await waitFor(() => {
        expect(screen.queryByText('Morning reflection')).not.toBeInTheDocument();
      });

      // Now click "All"
      const allChip = screen.getAllByRole('button', { name: 'All' })[1];
      fireEvent.click(allChip);

      await waitFor(() => {
        expect(screen.getByText('Sprint planning')).toBeInTheDocument();
        expect(screen.getByText('Morning reflection')).toBeInTheDocument();
      });
    });
  });

  describe('Firestore query listener error handling', () => {
    it('handles firestore errors when fetching board_docs', async () => {
      const { handleFirestoreError } = await import('../lib/firebase');
      const mockError = new Error('Permission denied');

      (useAuth as any).mockReturnValue(adminAuth);

      (onSnapshot as any).mockImplementation(
        (ref: { path?: string }, callback: any, errorCallback?: any) => {
          if (ref?.path === 'board_docs' && errorCallback) {
            errorCallback(mockError);
          }
          return vi.fn();
        }
      );

      render(<CoordinationNotes />);

      await waitFor(() => {
        expect(handleFirestoreError).toHaveBeenCalledWith(
          mockError,
          'LIST',
          'board_docs'
        );
      });
    });
  });

  // ── 14. Additional Coverage ──────────────────────────────────────────────
  describe('additional coverage for CoordinationNotes', () => {
    it('renders DocRow "Today" badge and unchecked tasks badge correctly', async () => {
      const now = new Date();
      const yyyy = now.getFullYear();
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const dd = String(now.getDate()).padStart(2, '0');
      const todayDate = `${yyyy}-${mm}-${dd}`;
      const customDocs = [
        {
          id: `doc-${todayDate}`,
          data: () => ({
            title: 'Today Doc',
            date: todayDate,
            weekday: 'Monday',
            md: '- [ ] Todo 1\n- [ ] Todo 2\n- [x] Done task',
            createdBy: 'u-admin',
            updatedAt: 'mock-ts',
          }),
        },
      ];
      setupSnapshots({ docs: customDocs, notes: [], team: mockTeam });
      render(<CoordinationNotes />);

      await screen.findByText('Today Doc');
      expect(screen.getAllByText('Today')[0]).toBeInTheDocument();
      expect(screen.getByText('2 to do')).toBeInTheDocument();
    });

    it('renders NoteCard with old recall badge (>300 days), contributor avatars, and tags', async () => {
      const oldDate = new Date(Date.now() - 310 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const customNotes = [
        {
          id: 'old-note',
          data: () => ({
            type: 'record',
            series: 'Weekly sync',
            title: 'Old Planning',
            body: 'Old roadmap details',
            tags: ['planning', 'q3'],
            date: oldDate,
            contributorIds: ['u-admin'],
            createdBy: 'u-admin',
          }),
        },
      ];
      setupSnapshots({ docs: mockDocs, notes: customNotes, team: mockTeam });
      render(<CoordinationNotes />);

      await screen.findByText('Old Planning');
      // "1 yr" recall badge should be visible
      expect(screen.getByText('1 yr')).toBeInTheDocument();
      // Tag string should be rendered as "#planning #q3"
      expect(screen.getByText('#planning #q3')).toBeInTheDocument();
      // Contributor initials or title should be rendered inside Avatar
      expect(screen.getByTitle('Tony Wang')).toBeInTheDocument();
    });

    it('toggles NoteForm type and parses tags with deduplication and hash removal', async () => {
      setupSnapshots({ docs: mockDocs, notes: [], team: mockTeam });
      render(<CoordinationNotes />);

      // Open Form
      const addBtn = screen.getByRole('button', { name: /add a note/i });
      fireEvent.click(addBtn);

      await screen.findByPlaceholderText(/a short title/i);

      // Toggle type
      const learningBtn = screen.getByRole('button', { name: 'learning' });
      fireEvent.click(learningBtn);

      // Fill in details
      fireEvent.change(screen.getByPlaceholderText(/a short title/i), {
        target: { value: 'Deduplication Note' },
      });
      fireEvent.change(screen.getByPlaceholderText(/tags/i), {
        target: { value: '#welcome, retreat, #retreat, welcome' },
      });

      const saveBtn = screen.getByRole('button', { name: /save to archive/i });
      fireEvent.click(saveBtn);

      await waitFor(() => {
        expect(setDoc).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({
            type: 'learning',
            tags: ['welcome', 'retreat'], // Deduplicated, hashes removed
          })
        );
      });
    });

    it('renders Avatar with photoURL when present, initials fallback otherwise', () => {
      const customNotes = [
        {
          id: 'note-avatar-photo',
          data: () => ({
            type: 'record',
            series: 'Weekly sync',
            title: 'Avatar Photo Title',
            body: 'body',
            tags: [],
            date: '2026-06-10',
            contributorIds: ['u-admin'],
            createdBy: 'u-admin',
          }),
        },
      ];
      const customTeam = [
        {
          id: 'u-admin',
          data: () => ({
            uid: 'u-admin',
            displayName: 'Tony Wang',
            photoURL: 'http://example.com/photo.jpg',
            role: 'admin',
            approved: true,
            email: 'yilongwang05@gmail.com',
          }),
        },
      ];
      setupSnapshots({ docs: mockDocs, notes: customNotes, team: customTeam });
      render(<CoordinationNotes />);

      const img = screen.getByAltText('Tony Wang');
      expect(img).toBeInTheDocument();
      expect(img).toHaveAttribute('src', 'http://example.com/photo.jpg');
    });

    it('auto-selects today first when present', () => {
      const now = new Date();
      const yyyy = now.getFullYear();
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const dd = String(now.getDate()).padStart(2, '0');
      const todayDate = `${yyyy}-${mm}-${dd}`;

      const docsList = [
        {
          id: 'doc-past',
          data: () => ({
            title: 'Past Doc',
            date: '2026-06-01',
            weekday: 'Monday',
            md: '',
            createdBy: 'u-admin',
            updatedAt: 'mock-ts',
          }),
        },
        {
          id: 'doc-today',
          data: () => ({
            title: 'Today Doc',
            date: todayDate,
            weekday: 'Tuesday',
            md: '',
            createdBy: 'u-admin',
            updatedAt: 'mock-ts',
          }),
        },
        {
          id: 'doc-upcoming',
          data: () => ({
            title: 'Upcoming Doc',
            date: '2026-12-31',
            weekday: 'Thursday',
            md: '',
            createdBy: 'u-admin',
            updatedAt: 'mock-ts',
          }),
        },
      ];
      setupSnapshots({ docs: docsList, notes: [], team: mockTeam });
      render(<CoordinationNotes />);
      expect(screen.getByPlaceholderText('Untitled page')).toHaveValue('Today Doc');
    });

    it('auto-selects soonest upcoming when no today is present', () => {
      const docsList = [
        {
          id: 'doc-past',
          data: () => ({
            title: 'Past Doc',
            date: '2026-06-01',
            weekday: 'Monday',
            md: '',
            createdBy: 'u-admin',
            updatedAt: 'mock-ts',
          }),
        },
        {
          id: 'doc-upcoming',
          data: () => ({
            title: 'Upcoming Doc',
            date: '2026-12-31',
            weekday: 'Thursday',
            md: '',
            createdBy: 'u-admin',
            updatedAt: 'mock-ts',
          }),
        },
      ];
      setupSnapshots({ docs: docsList, notes: [], team: mockTeam });
      render(<CoordinationNotes />);
      expect(screen.getByPlaceholderText('Untitled page')).toHaveValue('Upcoming Doc');
    });

    it('auto-selects most recent past when no today/upcoming is present', () => {
      const docsList = [
        {
          id: 'doc-past-old',
          data: () => ({
            title: 'Older Past Doc',
            date: '2026-05-01',
            weekday: 'Monday',
            md: '',
            createdBy: 'u-admin',
            updatedAt: 'mock-ts',
          }),
        },
        {
          id: 'doc-past-new',
          data: () => ({
            title: 'Newer Past Doc',
            date: '2026-06-01',
            weekday: 'Tuesday',
            md: '',
            createdBy: 'u-admin',
            updatedAt: 'mock-ts',
          }),
        },
      ];
      setupSnapshots({ docs: docsList, notes: [], team: mockTeam });
      render(<CoordinationNotes />);
      expect(screen.getByPlaceholderText('Untitled page')).toHaveValue('Newer Past Doc');
    });

    it('supports markdown toggle and title edits with save status indicator', async () => {
      setupSnapshots({ docs: mockDocs, notes: [], team: mockTeam });
      render(<CoordinationNotes />);

      await screen.findByText(`${today} — Monday`);

      vi.useFakeTimers();
      // Type new title in input
      const titleInput = screen.getByPlaceholderText('Untitled page');
      fireEvent.change(titleInput, { target: { value: 'New Doc Title' } });

      act(() => {
        vi.advanceTimersByTime(800);
      });

      expect(updateDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ title: 'New Doc Title' })
      );
      vi.useRealTimers();

      // Toggle Markdown view
      const markdownBtn = screen.getByRole('button', { name: /Markdown/i });
      fireEvent.click(markdownBtn);
      // Textarea source view should appear
      expect(screen.getByTitle('Markdown source is read-only while live editing is on')).toBeInTheDocument();
    });
  });
});

