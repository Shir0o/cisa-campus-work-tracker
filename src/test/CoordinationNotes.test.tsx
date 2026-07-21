import React from 'react';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { onSnapshot, setDoc, deleteDoc, doc, collection, updateDoc, addDoc, where } from 'firebase/firestore';
import { remove as dbRemove } from 'firebase/database';
import CoordinationNotes from '../views/CoordinationNotes';
import { useAuth } from '../components/AuthProvider';
import { logActivity } from '../lib/firebase';

// ── Auth mock ────────────────────────────────────────────────────────────────
vi.mock('../components/AuthProvider', () => ({
  useAuth: vi.fn(),
}));

// ── Router seam (the view reads location.state for the My Day deep-link) ──────
vi.mock('react-router-dom', () => ({
  useLocation: () => ({ state: null }),
  Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}));

// ── TipTap (thin seam) ──────────────────────────────────────────────────────
const mockEditor = {
  commands: {
    setContent: vi.fn(),
  },
  isEmpty: false,
  storage: {
    markdown: {
      getMarkdown: () => '# Team standup\n- [x] Review goals',
      parser: {
        parse: (md: string) => `<div>${md}</div>`,
      }
    }
  },
  isActive: vi.fn(() => false),
  on: vi.fn(),
  off: vi.fn(),
};

let mockActiveEditor: any = null;

vi.mock('@tiptap/react', () => ({
  useEditor: () => mockActiveEditor,
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
vi.mock('../lib/yjsRtdbProvider', () => {
  return {
    RtdbYjsProvider: class MockRtdbYjsProvider {
      destroy = vi.fn();
      awareness = {
        setLocalStateField: vi.fn(),
        on: vi.fn(),
        off: vi.fn(),
        getStates: () => new Map(),
      };
      claimSeed = vi.fn().mockResolvedValue(true);
    }
  };
});

// ── Firestore ────────────────────────────────────────────────────────────────
vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db: unknown, path: string) => ({ path })),
  onSnapshot: vi.fn((_ref: unknown, _cb: unknown) => vi.fn()),
  query: vi.fn((ref: unknown) => ref),
  orderBy: vi.fn(),
  where: vi.fn((field: string, op: string, value: unknown) => ({ field, op, value })),
  doc: vi.fn((_db: unknown, coll: string, id?: string) => ({
    path: id ? `${coll}/${id}` : coll,
    id: id || 'auto-id',
  })),
  setDoc: vi.fn(() => Promise.resolve()),
  addDoc: vi.fn(() => Promise.resolve({ id: 'mock-doc-id' })),
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

// Trainee (manager) and Student (operator) read a role-scoped, read-only Board.
const traineeAuth = {
  user: { uid: 'u-trainee', email: 'zion@test.com', displayName: 'Zion Park' },
  isAdmin: false,
  role: 'manager',
  isApproved: true,
  loading: false,
};

const studentAuth = {
  user: { uid: 'u-student', email: 'tim@test.com', displayName: 'Timothy Lee' },
  isAdmin: false,
  role: 'operator',
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
    contacts?: any[];
    tasks?: any[];
    neverFire?: boolean;
  } = {},
) {
  const { docs = [], notes = [], team = [], contacts = [], tasks = [], neverFire = false } = opts;
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
      } else if (path === 'tasks') {
        const mappedTasks = tasks.map((t: any) => ({
          id: t.id,
          data: () => t,
        }));
        callback({ docs: mappedTasks, size: mappedTasks.length });
      } else if (path === 'contacts') {
        const mappedContacts = contacts.map((c) => ({
          id: c.id,
          data: () => c,
        }));
        callback({ docs: mappedContacts, size: mappedContacts.length });
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
    mockActiveEditor = null;
    (useAuth as ReturnType<typeof vi.fn>).mockReturnValue(adminAuth);
    setupSnapshots();
  });

  // ── 1. Access gate ────────────────────────────────────────────────────────
  describe('access gate', () => {
    it('shows access-denied message for non-admin, non-owner users', () => {
      (useAuth as ReturnType<typeof vi.fn>).mockReturnValue(nonAdminAuth);
      render(<CoordinationNotes />);

      expect(
        screen.getByRole('heading', { name: /a space for the team/i }),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/this is where the team coordinates/i),
      ).toBeInTheDocument();
      // Main content should NOT be present
      expect(screen.queryByRole('heading', { name: /coordination notes/i, level: 1 })).not.toBeInTheDocument();
    });
  });

  // ── 1b. Role-based access (Session 3) ──────────────────────────────────────
  describe('role-based access', () => {
    const audDocs = [
      {
        id: `doc-${today}`,
        data: () => ({
          title: 'Friday run of show',
          date: today,
          weekday: 'Friday',
          md: '# Friday\n\n- [ ] Greeters',
          audience: 'everyone',
          createdBy: 'u-admin',
          updatedAt: 'mock-ts',
        }),
      },
      {
        id: 'doc-trainees',
        data: () => ({
          title: 'Trainee huddle',
          date: '2026-06-10',
          weekday: 'Wednesday',
          md: '# Huddle',
          audience: 'trainees',
          createdBy: 'u-admin',
          updatedAt: 'mock-ts',
        }),
      },
    ];

    it('trainee (manager) gets a read-only, audience-scoped Board with the notes archive', () => {
      (useAuth as ReturnType<typeof vi.fn>).mockReturnValue(traineeAuth);
      setupSnapshots({ docs: audDocs, notes: mockNotes, team: mockTeam });
      render(<CoordinationNotes />);

      // Coordination heading present, but no editing affordances.
      expect(screen.getByRole('heading', { name: /coordination notes/i, level: 1 })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /new page/i })).not.toBeInTheDocument();
      // Read-only render — the TipTap editor seam is never mounted; markdown
      // (incl. the GFM task list) is rendered by react-markdown as a disabled box.
      expect(screen.queryByTestId('tiptap-editor')).not.toBeInTheDocument();
      const checkbox = screen.getByRole('checkbox');
      expect(checkbox).toBeDisabled();
      // Notes archive is visible to trainees but read-only (no create buttons).
      expect(screen.getByRole('heading', { name: /notes & learnings/i })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /new record/i })).not.toBeInTheDocument();
      // The board_docs query is scoped to the trainee's audiences.
      expect(where).toHaveBeenCalledWith('audience', 'in', ['trainees', 'everyone']);
    });

    it('student (operator) sees a "What\'s happening" read-only view without the notes archive', () => {
      (useAuth as ReturnType<typeof vi.fn>).mockReturnValue(studentAuth);
      setupSnapshots({ docs: audDocs, notes: mockNotes, team: mockTeam });
      render(<CoordinationNotes />);

      expect(screen.getByRole('heading', { name: /what's happening/i, level: 1 })).toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: /notes & learnings/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /new page/i })).not.toBeInTheDocument();
      expect(where).toHaveBeenCalledWith('audience', 'in', ['everyone']);
    });

    it('full-timer (admin) reads every page unconstrained (no audience filter)', () => {
      setupSnapshots({ docs: audDocs, notes: mockNotes, team: mockTeam });
      render(<CoordinationNotes />);
      expect(where).not.toHaveBeenCalled();
      // Header "New page" + the Pages-list "+" are both present for full-timers.
      expect(screen.getAllByRole('button', { name: /new page/i }).length).toBeGreaterThan(0);
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

    it('renders the main header "Coordination Notes"', () => {
      setupSnapshots({ docs: mockDocs, notes: [], team: mockTeam });
      render(<CoordinationNotes />);

      expect(
        screen.getByRole('heading', { name: /coordination notes/i, level: 1 }),
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
    it('soft-deletes (sets deletedAt) immediately when clicking delete, with no confirm, and shows an Undo snackbar', async () => {
      const confirmSpy = vi.spyOn(window, 'confirm');
      setupSnapshots({ docs: mockDocs, notes: [], team: mockTeam });
      render(<CoordinationNotes />);

      // The delete button is inside the DocEditor area (title="Delete this page")
      await waitFor(() => {
        const deleteBtn = screen.getByTitle('Delete this page');
        expect(deleteBtn).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTitle('Delete this page'));

      await waitFor(() => {
        expect(updateDoc).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ deletedAt: 'mock-timestamp' }));
      });
      expect(deleteDoc).not.toHaveBeenCalled();
      expect(confirmSpy).not.toHaveBeenCalled();
      expect(await screen.findByText('Page moved to Trash')).toBeInTheDocument();
    });

    it('restores the page (sets deletedAt: null) when clicking Undo on the snackbar', async () => {
      setupSnapshots({ docs: mockDocs, notes: [], team: mockTeam });
      render(<CoordinationNotes />);

      await waitFor(() => {
        expect(screen.getByTitle('Delete this page')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTitle('Delete this page'));

      const undoBtn = await screen.findByRole('button', { name: 'Undo' });
      fireEvent.click(undoBtn);

      await waitFor(() => {
        expect(updateDoc).toHaveBeenCalledWith(expect.anything(), { deletedAt: null });
      });
    });
  });

  // ── 6b. Pin to top ────────────────────────────────────────────────────────
  describe('pin doc', () => {
    it('pins an unpinned page when clicking its pin toggle', async () => {
      setupSnapshots({ docs: mockDocs, notes: [], team: mockTeam });
      render(<CoordinationNotes />);

      const pinButtons = await screen.findAllByTitle('Pin to top');
      fireEvent.click(pinButtons[0]);

      await waitFor(() => {
        expect(updateDoc).toHaveBeenCalledWith(expect.anything(), { pinned: true });
      });
    });

    it('renders a pinned page first among others in the same week group', async () => {
      const pinnedTodayDoc = {
        id: 'doc-pinned',
        data: () => ({
          title: 'Pinned today doc',
          date: today,
          weekday: 'Monday',
          md: '',
          pinned: true,
          createdBy: 'u-admin',
          updatedAt: 'mock-ts',
        }),
      };
      // Both docs land in the "This week" group (mockDocs[0] is dated `today`,
      // mockDocs[1] is old enough to fall under "Earlier") — pinning should
      // move the pinned doc ahead of the other "This week" doc.
      setupSnapshots({ docs: [mockDocs[0], pinnedTodayDoc], notes: [], team: mockTeam });
      render(<CoordinationNotes />);

      await screen.findByText('Pinned today doc');
      const titles = screen.getAllByText(/Pinned today doc|— Monday/).map((el) => el.textContent);
      expect(titles[0]).toBe('Pinned today doc');
    });

    it('does not show a pin toggle for non-admins', async () => {
      (useAuth as ReturnType<typeof vi.fn>).mockReturnValue(traineeAuth);
      setupSnapshots({ docs: mockDocs, notes: [], team: mockTeam });
      render(<CoordinationNotes />);

      await screen.findByText('Pages');
      expect(screen.queryByTitle('Pin to top')).not.toBeInTheDocument();
    });
  });

  // ── 6c. Trash entry point ────────────────────────────────────────────────
  describe('Trash link', () => {
    it('shows a Trash link for admins, pointing at /coordination/trash', async () => {
      setupSnapshots({ docs: mockDocs, notes: [], team: mockTeam });
      render(<CoordinationNotes />);

      const trashLink = await screen.findByTitle('Trash');
      expect(trashLink).toHaveAttribute('href', '/coordination/trash');
    });

    it('hides the Trash link for non-admins', async () => {
      (useAuth as ReturnType<typeof vi.fn>).mockReturnValue(traineeAuth);
      setupSnapshots({ docs: mockDocs, notes: [], team: mockTeam });
      render(<CoordinationNotes />);

      await screen.findByText('Pages');
      expect(screen.queryByTitle('Trash')).not.toBeInTheDocument();
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

      // Open the note form via "New record"
      const addBtn = screen.getByRole('button', { name: /new record/i });
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

      // Submit
      const saveBtn = screen.getByRole('button', { name: /save record/i });
      fireEvent.click(saveBtn);

      await waitFor(() => {
        expect(setDoc).toHaveBeenCalled();
      });
    });

    it('save button is disabled when title is empty', () => {
      setupSnapshots({ docs: mockDocs, notes: [], team: mockTeam });
      render(<CoordinationNotes />);

      fireEvent.click(screen.getByRole('button', { name: /new record/i }));

      const saveBtn = screen.getByRole('button', { name: /save record/i });
      expect(saveBtn).toBeDisabled();
    });
  });

  // ── 8b. Save to archive — promote a page (Session 4) ───────────────────────
  describe('promote page to archive', () => {
    it('prefills the note form from the open page when "Save to archive" is clicked', async () => {
      mockActiveEditor = mockEditor;
      setupSnapshots({ docs: mockDocs, notes: [], team: mockTeam });
      render(<CoordinationNotes />);

      const promoteBtn = await screen.findByRole('button', { name: /save to archive/i });
      fireEvent.click(promoteBtn);

      const titleInput = (await screen.findByPlaceholderText(/a short title/i)) as HTMLInputElement;
      expect(titleInput.value).toContain('Monday'); // the open page's title
      // Promote defaults to a record save.
      expect(screen.getByRole('button', { name: /save record/i })).toBeInTheDocument();
    });

    it('lets a full-timer change a page audience (writes via updateDoc)', async () => {
      mockActiveEditor = mockEditor;
      setupSnapshots({ docs: mockDocs, notes: [], team: mockTeam });
      render(<CoordinationNotes />);

      const picker = (await screen.findByLabelText('Page audience')) as HTMLSelectElement;
      fireEvent.change(picker, { target: { value: 'everyone' } });

      await waitFor(() => {
        expect(updateDoc).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({ audience: 'everyone' }),
        );
      });
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

    it('renders NoteCard with old recall badge (>300 days) and contributor avatars', async () => {
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
      // Contributor initials or title should be rendered inside Avatar
      // (also appears in the "What we're carrying" person filter, hence getAllByTitle)
      expect(screen.getAllByTitle('Tony Wang').length).toBeGreaterThan(0);
    });

    it('toggles NoteForm type and saves note', async () => {
      setupSnapshots({ docs: mockDocs, notes: [], team: mockTeam });
      render(<CoordinationNotes />);

      // Open Form via "New record", then toggle to learning
      const addBtn = screen.getByRole('button', { name: /new record/i });
      fireEvent.click(addBtn);

      await screen.findByPlaceholderText(/a short title/i);

      // Toggle type
      const learningBtn = screen.getByRole('button', { name: 'learning' });
      fireEvent.click(learningBtn);

      // Fill in details
      fireEvent.change(screen.getByPlaceholderText(/a short title/i), {
        target: { value: 'Deduplication Note' },
      });

      const saveBtn = screen.getByRole('button', { name: /save learning/i });
      fireEvent.click(saveBtn);

      await waitFor(() => {
        expect(setDoc).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({
            type: 'learning',
            tags: [],
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

      // The same person also appears in the "What we're carrying" person filter,
      // so both avatars share this alt text — every one should use the photoURL.
      const imgs = screen.getAllByAltText('Tony Wang');
      expect(imgs.length).toBeGreaterThan(0);
      imgs.forEach((img) => expect(img).toHaveAttribute('src', 'http://example.com/photo.jpg'));
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
      const textarea = screen.getByTitle('Markdown source view');
      expect(textarea).toBeInTheDocument();
      expect(textarea).not.toHaveAttribute('readonly');
    });
  });

  // ── 15a. Collapsible Pages panel (#70) ────────────────────────────────────
  describe('collapsible pages panel', () => {
    beforeEach(() => {
      localStorage.clear();
    });

    it('collapses the Pages panel and reveals a "Show pages" control, then restores it', async () => {
      setupSnapshots({ docs: mockDocs, notes: [], team: mockTeam });
      render(<CoordinationNotes />);

      const workspace = screen.getByTestId('coordination-notes-workspace');
      const aside = workspace.querySelector('aside') as HTMLElement;

      // Expanded by default: two-column grid, sidebar visible, no "Show pages".
      expect(workspace.className).toContain('lg:grid-cols-[300px_1fr]');
      expect(aside.className).not.toContain('lg:hidden');
      expect(screen.queryByRole('button', { name: /show pages/i })).not.toBeInTheDocument();

      // Collapse.
      fireEvent.click(screen.getByRole('button', { name: /collapse pages/i }));

      await waitFor(() => {
        expect(workspace.className).toContain('lg:grid-cols-1');
        expect(aside.className).toContain('lg:hidden');
      });
      expect(localStorage.getItem('board_pages_collapsed')).toBe('true');
      const showPages = screen.getByRole('button', { name: /show pages/i });
      expect(showPages).toBeInTheDocument();

      // Restore from the editor-head control.
      fireEvent.click(showPages);

      await waitFor(() => {
        expect(workspace.className).toContain('lg:grid-cols-[300px_1fr]');
        expect(aside.className).not.toContain('lg:hidden');
      });
      expect(localStorage.getItem('board_pages_collapsed')).toBe('false');
    });

    it('starts collapsed when the persisted preference is set', () => {
      localStorage.setItem('board_pages_collapsed', 'true');
      setupSnapshots({ docs: mockDocs, notes: [], team: mockTeam });
      render(<CoordinationNotes />);

      const workspace = screen.getByTestId('coordination-notes-workspace');
      expect(workspace.className).toContain('lg:grid-cols-1');
      expect(screen.getByRole('button', { name: /show pages/i })).toBeInTheDocument();
    });
  });

  // ── 15. Workspace layout (regression for #65) ─────────────────────────────
  describe('documents workspace layout', () => {
    it('bounds the editor workspace height so the canvas scrolls internally and the toolbar stays pinned (#65)', () => {
      setupSnapshots({ docs: mockDocs, notes: [], team: mockTeam });
      render(<CoordinationNotes />);

      const workspace = screen.getByTestId('coordination-notes-workspace');
      // Without a bounded height the whole page scrolls and the `sticky` toolbar
      // scrolls away; these classes make the inner `overflow-y-auto` canvas the
      // scroller instead, keeping the formatting toolbar in view. `lg:min-h-0`
      // lets the calc strictly bound the height on short desktop windows.
      expect(workspace.className).toContain('lg:h-[calc(100vh-6rem)]');
      expect(workspace.className).toContain('lg:grid-rows-1');
      expect(workspace.className).toContain('lg:min-h-0');
    });
  });

  // ── AI Insights & Task Suggestions ─────────────────────────────────────────
  describe('AI Insights & Task Suggestions', () => {
    let mockFetch: any;

    beforeEach(() => {
      mockActiveEditor = mockEditor;
      mockFetch = vi.fn().mockImplementation(() =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              success: true,
              updatedMarkdown: '# Team standup\n- [x] Review goals\n[Priya Raman](/contacts/c-priya)',
              suggestedTasks: [
                {
                  title: 'Confirm Friday setlist with Beatriz',
                  dueDate: '2026-06-26',
                  priority: 'high',
                  contactId: 'c-beatriz',
                  contactName: 'Beatriz Lima',
                  assigneeId: 'u-admin',
                  assigneeName: 'Tony Wang',
                },
                {
                  title: 'Another suggestion to dismiss',
                  dueDate: '2026-06-27',
                  priority: 'low',
                  contactId: 'c-priya',
                  contactName: 'Priya Raman',
                  assigneeId: 'u-admin',
                  assigneeName: 'Tony Wang',
                },
              ],
            }),
        })
      );
      global.fetch = mockFetch;
    });

    it('renders the AI Insights button and opens the sidebar on click', async () => {
      const mockContacts = [
        { id: 'c-priya', name: 'Priya Raman' },
        { id: 'c-beatriz', name: 'Beatriz Lima' },
      ];
      setupSnapshots({ docs: mockDocs, notes: [], team: mockTeam, contacts: mockContacts });
      render(<CoordinationNotes />);

      // Find and click AI Insights button
      const aiBtn = await screen.findByRole('button', { name: /AI Insights/i });
      expect(aiBtn).toBeInTheDocument();

      fireEvent.click(aiBtn);

      // Verify sidebar title appears
      expect(await screen.findByText('AI Insights')).toBeInTheDocument();

      // Wait for mock fetch to be called
      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(1);
      });

      // Verify link suggestions module is rendered
      expect(screen.getByText('Contact Links')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Apply Links to Notes/i })).toBeInTheDocument();

      // Verify suggested task title is visible
      expect(screen.getByText('Suggested Tasks')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Confirm Friday setlist with Beatriz')).toBeInTheDocument();
    });

    it('applies contact links to the editor when clicking Apply Links', async () => {
      const mockContacts = [{ id: 'c-priya', name: 'Priya Raman' }];
      setupSnapshots({ docs: mockDocs, notes: [], team: mockTeam, contacts: mockContacts });
      render(<CoordinationNotes />);

      const aiBtn = await screen.findByRole('button', { name: /AI Insights/i });
      fireEvent.click(aiBtn);

      const applyBtn = await screen.findByRole('button', { name: /Apply Links to Notes/i });
      fireEvent.click(applyBtn);

      // Check if setContent was called with updated markdown
      expect(mockEditor.commands.setContent).toHaveBeenCalledWith(
        '# Team standup\n- [x] Review goals\n[Priya Raman](/contacts/c-priya)'
      );
      expect(screen.getByText('Links applied to notes!')).toBeInTheDocument();
    });

    it('adds task to Firestore when clicking Add Task and allows dismissing it', async () => {
      const mockContacts = [
        { id: 'c-beatriz', name: 'Beatriz Lima' },
        { id: 'c-priya', name: 'Priya Raman' },
      ];
      setupSnapshots({ docs: mockDocs, notes: [], team: mockTeam, contacts: mockContacts });
      render(<CoordinationNotes />);

      const aiBtn = await screen.findByRole('button', { name: /AI Insights/i });
      fireEvent.click(aiBtn);

      // Verify both suggested tasks are visible
      expect(await screen.findByDisplayValue('Confirm Friday setlist with Beatriz')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Another suggestion to dismiss')).toBeInTheDocument();

      // Interact with When date input
      const dateInput = document.querySelector('input[type="date"]') as HTMLInputElement;
      if (dateInput) {
        fireEvent.change(dateInput, { target: { value: '2026-07-20' } });
      }

      // Interact with Contact select
      const contactSelects = screen.getAllByRole('combobox');
      if (contactSelects.length > 0) {
        fireEvent.change(contactSelects[0], { target: { value: 'c-beatriz' } });
      }

      // Interact with Priority button
      const highBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent === 'high');
      if (highBtn) {
        fireEvent.click(highBtn);
      }

      // Find the first Add Task button and click it
      const addBtns = await screen.findAllByRole('button', { name: /Add Task/i });
      fireEvent.click(addBtns[0]);

      // Verify setDoc is called to add a task to Firestore
      await waitFor(() => {
        expect(setDoc).toHaveBeenCalled();
      });

      // Verify task shows as added
      expect(await screen.findByText('Added')).toBeInTheDocument();

      // Find the dismiss button for the second task and click it
      const dismissBtns = await screen.findAllByRole('button', { name: /Dismiss/i });
      // Since the first task is "Added" and doesn't render Dismiss, there should only be one Dismiss button visible, which is for the second task.
      fireEvent.click(dismissBtns[0]);

      // Verify the second task is hidden
      await waitFor(() => {
        expect(screen.queryByDisplayValue('Another suggestion to dismiss')).not.toBeInTheDocument();
      });
    });

    it('displays high demand friendly error message on 503/UNAVAILABLE', async () => {
      const payload = {
        error: JSON.stringify({
          error: {
            code: 503,
            message: "This model is currently experiencing high demand. Please try again later.",
            status: "UNAVAILABLE"
          }
        })
      };
      
      const mockErrorFetch = vi.fn().mockImplementation(() =>
        Promise.resolve({
          ok: false,
          status: 500,
          json: () => Promise.resolve(payload),
          text: () => Promise.resolve(JSON.stringify(payload)),
        })
      );
      global.fetch = mockErrorFetch;

      setupSnapshots({ docs: mockDocs, notes: [], team: mockTeam, contacts: [] });
      render(<CoordinationNotes />);

      const aiBtn = await screen.findByRole('button', { name: /AI Insights/i });
      fireEvent.click(aiBtn);

      expect(await screen.findByText(/The AI service is temporarily unavailable due to high demand/i)).toBeInTheDocument();
    });

    it('displays invalid key friendly error message on API_KEY_INVALID', async () => {
      const payload = {
        error: "API key not valid. API_KEY_INVALID"
      };
      
      const mockErrorFetch = vi.fn().mockImplementation(() =>
        Promise.resolve({
          ok: false,
          status: 400,
          json: () => Promise.resolve(payload),
          text: () => Promise.resolve(JSON.stringify(payload)),
        })
      );
      global.fetch = mockErrorFetch;

      setupSnapshots({ docs: mockDocs, notes: [], team: mockTeam, contacts: [] });
      render(<CoordinationNotes />);

      const aiBtn = await screen.findByRole('button', { name: /AI Insights/i });
      fireEvent.click(aiBtn);

      expect(await screen.findByText(/The configured AI service key is invalid/i)).toBeInTheDocument();
    });

    it('displays fallback raw error message for unhandled errors', async () => {
      const mockErrorFetch = vi.fn().mockImplementation(() =>
        Promise.resolve({
          ok: false,
          status: 500,
          json: () => Promise.reject(new Error("Not JSON")),
          text: () => Promise.resolve("Some completely random server crash"),
        })
      );
      global.fetch = mockErrorFetch;

      setupSnapshots({ docs: mockDocs, notes: [], team: mockTeam, contacts: [] });
      render(<CoordinationNotes />);

      const aiBtn = await screen.findByRole('button', { name: /AI Insights/i });
      fireEvent.click(aiBtn);

      expect(await screen.findByText("Some completely random server crash")).toBeInTheDocument();
    });

    it('caches AI insights data and does not re-fetch when closing and reopening sidebar', async () => {
      setupSnapshots({ docs: mockDocs, notes: [], team: mockTeam, contacts: [] });
      render(<CoordinationNotes />);

      // First open: should call fetch
      const aiBtn = await screen.findByRole('button', { name: /AI Insights/i });
      fireEvent.click(aiBtn);
      
      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(1);
      });

      // Close sidebar
      const closeBtn = screen.getByRole('button', { name: /Close sidebar/i });
      fireEvent.click(closeBtn);
      expect(screen.queryByText('Contact Links')).not.toBeInTheDocument();

      // Second open: should NOT call fetch again (mockFetch times stays 1)
      fireEvent.click(aiBtn);
      expect(screen.getByText('Contact Links')).toBeInTheDocument();
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Manual refresh: should call fetch again
      const refreshBtn = screen.getByRole('button', { name: /Refresh AI Insights/i });
      fireEvent.click(refreshBtn);
      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(2);
      });
    });

    it('allows editing markdown source and automatically renumbers ordered lists', async () => {
      setupSnapshots({ docs: mockDocs, notes: [], team: mockTeam, contacts: [] });
      render(<CoordinationNotes />);

      // Toggle markdown view
      const markdownBtn = screen.getByRole('button', { name: /Markdown/i });
      fireEvent.click(markdownBtn);

      const textarea = screen.getByTitle('Markdown source view') as HTMLTextAreaElement;
      expect(textarea).toBeInTheDocument();

      vi.useFakeTimers();
      // Type some out-of-order list markdown
      const outOfOrderMarkdown = `1. Apple\n1. Orange\n1. Banana`;
      fireEvent.change(textarea, { target: { value: outOfOrderMarkdown } });

      // Textarea should contain renumbered markdown
      expect(textarea.value).toBe(`1. Apple\n2. Orange\n3. Banana`);
      
      // Close the view while timer is active to cover immediate setContent and active timer cleanup on close
      fireEvent.click(markdownBtn);
      expect(textarea).not.toBeInTheDocument();
      
      // Editor setContent should have been called immediately on close
      expect(mockEditor.commands.setContent).toHaveBeenCalledWith(
        `1. Apple\n2. Orange\n3. Banana`
      );
      vi.useRealTimers();
    });

    it('clears markdownSyncTimer on unmount if active', async () => {
      setupSnapshots({ docs: mockDocs, notes: [], team: mockTeam, contacts: [] });
      const { unmount } = render(<CoordinationNotes />);

      // Toggle markdown view
      const markdownBtn = screen.getByRole('button', { name: /Markdown/i });
      fireEvent.click(markdownBtn);

      const textarea = screen.getByTitle('Markdown source view') as HTMLTextAreaElement;
      expect(textarea).toBeInTheDocument();

      vi.useFakeTimers();
      fireEvent.change(textarea, { target: { value: 'Something' } });

      // Unmount while timer is active to cover active timer cleanup on unmount
      unmount();
      vi.useRealTimers();
    });

    it('handles Tab key press to indent text', async () => {
      setupSnapshots({ docs: mockDocs, notes: [], team: mockTeam, contacts: [] });
      render(<CoordinationNotes />);

      // Toggle markdown view
      const markdownBtn = screen.getByRole('button', { name: /Markdown/i });
      fireEvent.click(markdownBtn);

      const textarea = screen.getByTitle('Markdown source view') as HTMLTextAreaElement;
      
      textarea.focus();
      textarea.value = 'Hello';
      textarea.selectionStart = 5;
      textarea.selectionEnd = 5;

      fireEvent.keyDown(textarea, { key: 'Tab' });
      expect(textarea.value).toBe('Hello  ');
    });

    it('handles Shift-Tab key press to outdent text', async () => {
      setupSnapshots({ docs: mockDocs, notes: [], team: mockTeam, contacts: [] });
      render(<CoordinationNotes />);

      // Toggle markdown view
      const markdownBtn = screen.getByRole('button', { name: /Markdown/i });
      fireEvent.click(markdownBtn);

      const textarea = screen.getByTitle('Markdown source view') as HTMLTextAreaElement;
      
      // Test Shift+Tab with indentation
      textarea.focus();
      textarea.value = '  Hello';
      textarea.selectionStart = 7;
      textarea.selectionEnd = 7;
      fireEvent.keyDown(textarea, { key: 'Tab', shiftKey: true });
      expect(textarea.value).toBe('Hello');

      // Test Shift+Tab without indentation
      textarea.value = 'Hello';
      textarea.selectionStart = 5;
      textarea.selectionEnd = 5;
      fireEvent.keyDown(textarea, { key: 'Tab', shiftKey: true });
      expect(textarea.value).toBe('Hello');
    });

    it('handles Enter key press to auto-indent new line', async () => {
      setupSnapshots({ docs: mockDocs, notes: [], team: mockTeam, contacts: [] });
      render(<CoordinationNotes />);

      // Toggle markdown view
      const markdownBtn = screen.getByRole('button', { name: /Markdown/i });
      fireEvent.click(markdownBtn);

      const textarea = screen.getByTitle('Markdown source view') as HTMLTextAreaElement;
      
      textarea.focus();
      textarea.value = '  Hello';
      textarea.selectionStart = 7;
      textarea.selectionEnd = 7;

      fireEvent.keyDown(textarea, { key: 'Enter' });
      expect(textarea.value).toBe('  Hello\n  ');
    });

    it('does not intercept key down for other keys', async () => {
      setupSnapshots({ docs: mockDocs, notes: [], team: mockTeam, contacts: [] });
      render(<CoordinationNotes />);

      // Toggle markdown view
      const markdownBtn = screen.getByRole('button', { name: /Markdown/i });
      fireEvent.click(markdownBtn);

      const textarea = screen.getByTitle('Markdown source view') as HTMLTextAreaElement;
      
      textarea.focus();
      textarea.value = 'Hello';
      textarea.selectionStart = 5;
      textarea.selectionEnd = 5;

      fireEvent.keyDown(textarea, { key: 'a' });
      expect(textarea.value).toBe('Hello');
    });
  });
  // ── Team to-dos ("What we're carrying") ─────────────────────────────────────
  describe('What we\'re carrying — team to-dos', () => {
    const mockTasks = [
      {
        id: 'td-1',
        title: 'Call the venue',
        status: 'pending',
        priority: 'medium',
        dueDate: today,
        assigneeId: 'u-admin',
        createdById: 'u-admin',
        createdByName: 'Tony Wang',
        sourceDocId: null,
        sourceDocTitle: null,
      },
      {
        id: 'td-2',
        title: 'Order supplies',
        status: 'completed',
        priority: 'medium',
        dueDate: null,
        assigneeId: 'u-admin',
        createdById: 'u-admin',
        createdByName: 'Tony Wang',
        sourceDocId: null,
        sourceDocTitle: null,
      },
    ];

    it('renders the section header with open count', () => {
      setupSnapshots({ docs: mockDocs, notes: [], team: mockTeam, tasks: mockTasks });
      render(<CoordinationNotes />);

      expect(screen.getByText(/what we're holding/i)).toBeInTheDocument();
      expect(screen.getByText(/1 still open/i)).toBeInTheDocument();
    });

    it('renders pending to-do titles in the list', () => {
      setupSnapshots({ docs: mockDocs, notes: [], team: mockTeam, tasks: mockTasks });
      render(<CoordinationNotes />);

      // Pending to-do visible, completed hidden by default
      expect(screen.getByText('Call the venue')).toBeInTheDocument();
      expect(screen.queryByText('Order supplies')).not.toBeInTheDocument();
    });

    it('shows completed todos when "Show done" is toggled', () => {
      setupSnapshots({ docs: mockDocs, notes: [], team: mockTeam, tasks: mockTasks });
      render(<CoordinationNotes />);

      fireEvent.click(screen.getByText('Show done'));
      expect(screen.getByText('Order supplies')).toBeInTheDocument();
    });

    it('shows empty state when there are no to-dos', () => {
      setupSnapshots({ docs: mockDocs, notes: [], team: mockTeam, tasks: [] });
      render(<CoordinationNotes />);

      expect(screen.getByText(/nothing here yet/i)).toBeInTheDocument();
    });

    it('shows the "Add to-do" button', () => {
      setupSnapshots({ docs: mockDocs, notes: [], team: mockTeam, tasks: [] });
      render(<CoordinationNotes />);

      expect(screen.getByText(/add to-do/i)).toBeInTheDocument();
    });

    it('renders the "Everyone" filter pill and per-person filter pills', () => {
      setupSnapshots({ docs: mockDocs, notes: [], team: mockTeam, tasks: mockTasks });
      render(<CoordinationNotes />);

      expect(screen.getByText('Everyone')).toBeInTheDocument();
      // Team member first name should appear as a filter pill
      expect(screen.getAllByText(/Tony/).length).toBeGreaterThan(0);
    });

    it('shows "all clear" when all todos are completed', () => {
      const allDone = [{ ...mockTasks[1] }]; // only the completed one
      setupSnapshots({ docs: mockDocs, notes: [], team: mockTeam, tasks: allDone });
      render(<CoordinationNotes />);

      expect(screen.getByText(/all clear/i)).toBeInTheDocument();
    });

    it('handles toggling a to-do status and logs activity', async () => {
      setupSnapshots({ docs: mockDocs, notes: [], team: mockTeam, tasks: mockTasks });
      render(<CoordinationNotes />);

      // Find the checkbox button for "Call the venue" todo
      const checkbox = screen.getAllByTitle('Mark done')[0];
      fireEvent.click(checkbox);

      // Verify updateDoc is called
      expect(updateDoc).toHaveBeenCalled();
      // Verify logActivity is called
      await waitFor(() => {
        expect(logActivity).toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'completed task',
            targetName: 'Call the venue',
          })
        );
      });
    });

    it('handles deleting a to-do and logs activity', async () => {
      // Stub window.confirm to return true
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

      setupSnapshots({ docs: mockDocs, notes: [], team: mockTeam, tasks: mockTasks });
      render(<CoordinationNotes />);

      // Find the delete button for "Call the venue"
      const deleteBtn = screen.getAllByTitle('Delete to-do')[0];
      fireEvent.click(deleteBtn);

      expect(deleteDoc).toHaveBeenCalled();
      await waitFor(() => {
        expect(logActivity).toHaveBeenCalledWith(
          expect.objectContaining({
            action: 'deleted task',
            targetName: 'Call the venue',
          })
        );
      });

      confirmSpy.mockRestore();
    });

    it('filters out cisa-* test accounts from the team list', () => {
      const teamWithTestUser = [
        ...mockTeam,
        {
          id: 'u-test-cisa',
          data: () => ({
            uid: 'u-test-cisa',
            displayName: 'cisa-test-account',
            email: 'cisa-test@example.com',
            approved: true,
            role: 'viewer',
          }),
        },
      ];
      setupSnapshots({ docs: mockDocs, notes: [], team: teamWithTestUser, tasks: mockTasks });
      render(<CoordinationNotes />);

      // Verify the normal team members are present
      expect(screen.getByText('Tony')).toBeInTheDocument();
      // Verify cisa-* test user is NOT in the document
      expect(screen.queryByText('cisa-test-account')).not.toBeInTheDocument();
    });
  });

  // ── 7. Selection popover menu & NoteComposer ──────────────────────────────
  describe('text selection popover menu', () => {
    it('shows floating bubble menu when selecting text and allows note actions', async () => {
      const mockRange = {
        commonAncestorContainer: null as any,
        getBoundingClientRect: () => ({ top: 100, left: 100, width: 80, height: 20 }),
      };
      
      const mockSelection = {
        isCollapsed: false,
        rangeCount: 1,
        getRangeAt: () => mockRange,
        toString: () => 'Assigned task text',
        removeAllRanges: vi.fn(),
      };
      
      const getSelectionSpy = vi.spyOn(window, 'getSelection').mockReturnValue(mockSelection as any);

      setupSnapshots({ docs: mockDocs, notes: [], team: mockTeam, tasks: [] });
      render(<CoordinationNotes />);

      // Wait for editor to load
      const editor = screen.getByTestId('tiptap-editor');
      
      mockRange.commonAncestorContainer = editor;

      // Trigger mouseUp to refresh selection FAB
      fireEvent.mouseUp(editor);

      // Verify bubble menu buttons are displayed
      expect(await screen.findByText('Todo')).toBeInTheDocument();
      expect(screen.getByText('Note/Learning')).toBeInTheDocument();
      expect(screen.getByText('Assign')).toBeInTheDocument();

      // Click "Note/Learning" to open NoteComposer
      fireEvent.click(screen.getByText('Note/Learning'));

      // Verify NoteComposer floating popover opens
      expect(screen.getByText('Make note/learning')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Note title')).toBeInTheDocument();
      
      // Fill out note title
      fireEvent.change(screen.getByPlaceholderText('Note title'), { target: { value: 'Selection Note Title' } });
      
      // Save note
      fireEvent.click(screen.getByRole('button', { name: 'Save Note' }));

      // Verify note save calls setDoc
      await waitFor(() => {
        expect(setDoc).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({
            title: 'Selection Note Title',
            body: 'Assigned task text',
            tags: [],
          })
        );
      });
      
      getSelectionSpy.mockRestore();
    });

    it('allows direct task assignment to team member from menu', async () => {
      const mockRange = {
        commonAncestorContainer: null as any,
        getBoundingClientRect: () => ({ top: 100, left: 100, width: 80, height: 20 }),
      };
      
      const mockSelection = {
        isCollapsed: false,
        rangeCount: 1,
        getRangeAt: () => mockRange,
        toString: () => 'Task from highlight',
        removeAllRanges: vi.fn(),
      };
      
      const getSelectionSpy = vi.spyOn(window, 'getSelection').mockReturnValue(mockSelection as any);

      setupSnapshots({ docs: mockDocs, notes: [], team: mockTeam, tasks: [] });
      render(<CoordinationNotes />);

      const editor = screen.getByTestId('tiptap-editor');
      mockRange.commonAncestorContainer = editor;

      fireEvent.mouseUp(editor);

      // Click "Assign" button to open member dropdown
      fireEvent.click(await screen.findByText('Assign'));

      // Click on team member "Tony Wang"
      const memberBtn = screen.getByText('Tony Wang');
      fireEvent.click(memberBtn);

      // Verify direct assignment calls addDoc to create task (addTodo is a firebase addDoc call)
      await waitFor(() => {
        expect(addDoc).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({
            title: 'Task from highlight',
            assigneeId: 'u-admin',
            status: 'pending',
          })
        );
      });

      getSelectionSpy.mockRestore();
    });

    it('parses selection task list hierarchy correctly', async () => {
      const mockRange = {
        commonAncestorContainer: null as any,
        getBoundingClientRect: () => ({ top: 100, left: 100, width: 80, height: 20 }),
      };
      
      const mockSelection = {
        isCollapsed: false,
        rangeCount: 1,
        getRangeAt: () => mockRange,
        toString: () => 'Parent Task\n  - Sub Task A\n  - Sub Task B\nParent Task 2\n  Sub Task C',
        removeAllRanges: vi.fn(),
      };
      
      const getSelectionSpy = vi.spyOn(window, 'getSelection').mockReturnValue(mockSelection as any);

      setupSnapshots({ docs: mockDocs, notes: [], team: mockTeam, tasks: [] });
      render(<CoordinationNotes />);

      const editor = screen.getByTestId('tiptap-editor');
      mockRange.commonAncestorContainer = editor;

      fireEvent.mouseUp(editor);

      // Verify bubble menu shows Todo
      const todoBtn = await screen.findByText('Todo');
      expect(todoBtn).toBeInTheDocument();
      fireEvent.click(todoBtn);

      // Verify that TodoComposer popover opens and parses the 3 tasks
      expect(await screen.findByText('New to-dos (3)')).toBeInTheDocument();

      getSelectionSpy.mockRestore();
    });
  });
});

