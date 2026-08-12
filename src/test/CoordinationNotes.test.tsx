import React from 'react';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { onSnapshot, setDoc, deleteDoc, doc, collection, updateDoc, addDoc, where } from 'firebase/firestore';
import { remove as dbRemove } from 'firebase/database';
import CoordinationNotes, { SuggestedTaskCard } from '../views/CoordinationNotes';
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
    setTextSelection: vi.fn(),
  },
  isEmpty: false,
  isFocused: false,
  // Enough ProseMirror surface for the caret-preserving Markdown push and the
  // task-sync walk; a doc with no task nodes means the walk finds nothing to patch.
  state: {
    selection: { from: 0, to: 0 },
    doc: { content: { size: 0 }, descendants: () => {} },
  },
  view: { dispatch: vi.fn() },
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

      await screen.findByText('Page moved to Trash');
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
        expect(updateDoc).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ pinned: true }));
      });
    });

    it('renders a pinned page in its own Pinned section at the top of the Pages rail', async () => {
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
      setupSnapshots({ docs: [mockDocs[0], pinnedTodayDoc], notes: [], team: mockTeam });
      render(<CoordinationNotes />);

      await screen.findByText('Pinned today doc');
      expect(screen.getByText('Pinned')).toBeInTheDocument();
      const titles = screen.getAllByText(/Pinned today doc|— Monday/).map((el) => el.textContent);
      expect(titles[0]).toBe('Pinned today doc');
    });

    it('unpins a pinned page when clicking its pin toggle', async () => {
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
      setupSnapshots({ docs: [pinnedTodayDoc], notes: [], team: mockTeam });
      render(<CoordinationNotes />);

      const unpinButton = await screen.findByTitle('Unpin');
      fireEvent.click(unpinButton);

      await waitFor(() => {
        expect(updateDoc).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ pinned: false, pinnedOrder: null }));
      });
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

  // ── 8b. Keep as a note — promote a page (Session 4) ───────────────────────
  describe('promote page to archive', () => {
    it('prefills the note form from the open page when "Keep as a note" is clicked', async () => {
      mockActiveEditor = mockEditor;
      setupSnapshots({ docs: mockDocs, notes: [], team: mockTeam });
      render(<CoordinationNotes />);

      const promoteBtn = await screen.findByRole('button', { name: /keep as a note/i });
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
    it('soft deletes note (sets deletedAt) when clicking Move to Trash', async () => {
      setupSnapshots({ docs: mockDocs, notes: mockNotes, team: mockTeam });
      render(<CoordinationNotes />);

      await waitFor(() => {
        expect(screen.getAllByTitle('Move to Trash').length).toBeGreaterThan(0);
      });

      fireEvent.click(screen.getAllByTitle('Move to Trash')[0]);

      await waitFor(() => {
        expect(updateDoc).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ deletedAt: expect.anything() }));
      });
    });

    it('calls deleteDoc after confirm when deleting a note forever in Trash tab', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      const trashNotes = [{ ...mockNotes[0], data: () => ({ ...mockNotes[0].data(), deletedAt: 'mock-ts' }) }];
      setupSnapshots({ docs: mockDocs, notes: trashNotes, team: mockTeam });
      render(<CoordinationNotes />);

      // Switch to Trash tab
      fireEvent.click(screen.getByRole('button', { name: 'Trash' }));

      await waitFor(() => {
        expect(screen.getAllByTitle('Delete forever').length).toBeGreaterThan(0);
      });

      fireEvent.click(screen.getAllByTitle('Delete forever')[0]);

      await waitFor(() => {
        expect(deleteDoc).toHaveBeenCalled();
      });
    });
  });

  // ── 9b. Note tabs (Active / Archive / Trash) ──────────────────────────────
  describe('note tabs', () => {
    it('switches to Archive tab and hides active notes', async () => {
      setupSnapshots({ docs: mockDocs, notes: mockNotes, team: mockTeam });
      render(<CoordinationNotes />);

      await waitFor(() => {
        expect(screen.getByText('Sprint planning')).toBeInTheDocument();
      });

      // Click Archive tab — active notes should disappear since none are archived
      fireEvent.click(screen.getByRole('button', { name: 'Archive' }));

      await waitFor(() => {
        expect(screen.queryByText('Sprint planning')).not.toBeInTheDocument();
        expect(screen.queryByText('Morning reflection')).not.toBeInTheDocument();
      });
    });

    it('switches to Trash tab and shows trashed notes', async () => {
      const trashedNotes = [
        { id: 'note-t1', data: () => ({ type: 'record', series: 'Team', title: 'Trashed note', body: 'gone', tags: [], date: today, contributorIds: ['u-admin'], createdBy: 'u-admin', deletedAt: 'mock-ts' }) },
        ...mockNotes,
      ];
      setupSnapshots({ docs: mockDocs, notes: trashedNotes, team: mockTeam });
      render(<CoordinationNotes />);

      // Active tab should not show trashed note
      await waitFor(() => {
        expect(screen.getByText('Sprint planning')).toBeInTheDocument();
        expect(screen.queryByText('Trashed note')).not.toBeInTheDocument();
      });

      // Switch to Trash tab
      fireEvent.click(screen.getByRole('button', { name: 'Trash' }));

      await waitFor(() => {
        expect(screen.getByText('Trashed note')).toBeInTheDocument();
        expect(screen.queryByText('Sprint planning')).not.toBeInTheDocument();
      });
    });

    it('switches back to Active tab and shows active notes again', async () => {
      setupSnapshots({ docs: mockDocs, notes: mockNotes, team: mockTeam });
      render(<CoordinationNotes />);

      await waitFor(() => expect(screen.getByText('Sprint planning')).toBeInTheDocument());

      fireEvent.click(screen.getByRole('button', { name: 'Archive' }));
      await waitFor(() => expect(screen.queryByText('Sprint planning')).not.toBeInTheDocument());

      fireEvent.click(screen.getByRole('button', { name: 'Active' }));
      await waitFor(() => expect(screen.getByText('Sprint planning')).toBeInTheDocument());
    });
  });

  // ── 9c. Edit note ─────────────────────────────────────────────────────────
  describe('edit note', () => {
    it('opens the note form pre-filled when clicking the Edit button', async () => {
      setupSnapshots({ docs: mockDocs, notes: mockNotes, team: mockTeam });
      render(<CoordinationNotes />);

      await waitFor(() => {
        expect(screen.getAllByTitle('Edit note').length).toBeGreaterThan(0);
      });

      fireEvent.click(screen.getAllByTitle('Edit note')[0]);

      // The form should appear with the note's title pre-filled
      await waitFor(() => {
        const titleInput = screen.getByPlaceholderText(/a short title/i) as HTMLInputElement;
        expect(titleInput.value).toBe('Sprint planning');
      });

      // Should show "Update note" instead of "Save record"
      expect(screen.getByRole('button', { name: /update note/i })).toBeInTheDocument();
    });

    it('submits an edit via updateDoc when clicking Update note', async () => {
      setupSnapshots({ docs: mockDocs, notes: mockNotes, team: mockTeam });
      render(<CoordinationNotes />);

      await waitFor(() => {
        expect(screen.getAllByTitle('Edit note').length).toBeGreaterThan(0);
      });

      fireEvent.click(screen.getAllByTitle('Edit note')[0]);

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/a short title/i)).toBeInTheDocument();
      });

      fireEvent.change(screen.getByPlaceholderText(/a short title/i), {
        target: { value: 'Updated title' },
      });

      fireEvent.click(screen.getByRole('button', { name: /update note/i }));

      await waitFor(() => {
        expect(updateDoc).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({ title: 'Updated title' }),
        );
      });
    });
  });

  // ── 9d. Archive note ──────────────────────────────────────────────────────
  describe('archive note', () => {
    it('archives a note when clicking the Archive button', async () => {
      setupSnapshots({ docs: mockDocs, notes: mockNotes, team: mockTeam });
      render(<CoordinationNotes />);

      await waitFor(() => {
        expect(screen.getAllByTitle('Archive note').length).toBeGreaterThan(0);
      });

      fireEvent.click(screen.getAllByTitle('Archive note')[0]);

      await waitFor(() => {
        expect(updateDoc).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({ archivedAt: expect.anything() }),
        );
      });
    });
  });

  // ── 9e. Restore note from Trash ───────────────────────────────────────────
  describe('restore note from trash', () => {
    it('restores a note when clicking the Restore button in the Trash tab', async () => {
      const trashedNotes = [
        { id: 'note-t1', data: () => ({ type: 'record', series: 'Team', title: 'Trashed note', body: 'oops', tags: [], date: today, contributorIds: ['u-admin'], createdBy: 'u-admin', deletedAt: 'mock-ts' }) },
      ];
      setupSnapshots({ docs: mockDocs, notes: trashedNotes, team: mockTeam });
      render(<CoordinationNotes />);

      // Switch to Trash tab
      fireEvent.click(screen.getByRole('button', { name: 'Trash' }));

      await waitFor(() => {
        expect(screen.getByText('Trashed note')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTitle('Restore note'));

      await waitFor(() => {
        expect(updateDoc).toHaveBeenCalledWith(
          expect.anything(),
          { deletedAt: null },
        );
      });
    });
  });

  // ── 9f. Display mode toggle ───────────────────────────────────────────────
  describe('note display mode', () => {
    it('toggles note display mode when clicking the mode button on a note card', async () => {
      setupSnapshots({ docs: mockDocs, notes: mockNotes, team: mockTeam });
      render(<CoordinationNotes />);

      await waitFor(() => {
        expect(screen.getAllByTitle('Switch to checklist mode').length).toBeGreaterThan(0);
      });

      fireEvent.click(screen.getAllByTitle('Switch to checklist mode')[0]);

      await waitFor(() => {
        expect(updateDoc).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({ displayMode: 'list' }),
        );
      });
    });

    it('toggles NoteForm text/list format button', async () => {
      setupSnapshots({ docs: mockDocs, notes: mockNotes, team: mockTeam });
      render(<CoordinationNotes />);

      fireEvent.click(screen.getByRole('button', { name: /new record/i }));

      await waitFor(() => {
        expect(screen.getByText('Text format')).toBeInTheDocument();
      });

      // Click the toggle to switch to list
      fireEvent.click(screen.getByText('Text format'));

      await waitFor(() => {
        expect(screen.getByText('List format')).toBeInTheDocument();
      });
    });
  });

  // ── 9g. Checklist item toggle ─────────────────────────────────────────────
  describe('note checklist items', () => {
    it('renders checklist items and toggles them', async () => {
      const checklistNotes = [
        {
          id: 'note-cl',
          data: () => ({
            type: 'record',
            series: 'Team',
            title: 'Checklist note',
            body: '- [ ] Item A\n- [x] Item B',
            tags: [],
            date: today,
            contributorIds: ['u-admin'],
            createdBy: 'u-admin',
            displayMode: 'list',
          }),
        },
      ];
      setupSnapshots({ docs: mockDocs, notes: checklistNotes, team: mockTeam });
      render(<CoordinationNotes />);

      await waitFor(() => {
        expect(screen.getByText('Checklist note')).toBeInTheDocument();
        expect(screen.getByText('Item A')).toBeInTheDocument();
        expect(screen.getByText('Item B')).toBeInTheDocument();
      });

      // Check the first unchecked item
      const checkboxes = screen.getAllByRole('checkbox');
      expect(checkboxes[0]).not.toBeChecked();
      expect(checkboxes[1]).toBeChecked();

      fireEvent.click(checkboxes[0]);

      await waitFor(() => {
        expect(updateDoc).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({ body: '- [x] Item A\n- [x] Item B' }),
        );
      });
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

  // ── Stored / Generated Short Summary in Sidebar ──────────────────────────────
  describe('Stored / Generated Short Summary in Sidebar', () => {
    it('renders stored summary or generated summary under document title in sidebar', async () => {
      const docsWithSummary = [
        {
          ...mockDocs[0],
          data: () => ({
            ...mockDocs[0].data(),
            summary: 'Stored summary for testing',
          }),
        },
        mockDocs[1],
      ];
      setupSnapshots({ docs: docsWithSummary, notes: [], team: mockTeam, contacts: [] });
      render(<CoordinationNotes />);

      expect(await screen.findByText('Stored summary for testing')).toBeInTheDocument();
    });
  });

    it('allows editing markdown source and automatically renumbers ordered lists', async () => {
      mockActiveEditor = mockEditor;
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

    it('parses natural language dates when directly assigning selected text from menu', async () => {
      const mockRange = {
        commonAncestorContainer: null as any,
        getBoundingClientRect: () => ({ top: 100, left: 100, width: 80, height: 20 }),
      };

      const mockSelection = {
        isCollapsed: false,
        rangeCount: 1,
        getRangeAt: () => mockRange,
        toString: () => 'Submit report by tomorrow',
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

      // Verify direct assignment extracts date and sets dueDate
      await waitFor(() => {
        expect(addDoc).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({
            title: 'Submit report by tomorrow',
            assigneeId: 'u-admin',
            dueDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
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

    it('opens NoteComposer on selection Note click and saves note', async () => {
      const mockRange = {
        commonAncestorContainer: null as any,
        getBoundingClientRect: () => ({ top: 100, left: 100, width: 80, height: 20 }),
      };
      
      const mockSelection = {
        isCollapsed: false,
        rangeCount: 1,
        getRangeAt: () => mockRange,
        toString: () => 'Important takeaway note text',
        removeAllRanges: vi.fn(),
      };
      
      const getSelectionSpy = vi.spyOn(window, 'getSelection').mockReturnValue(mockSelection as any);

      setupSnapshots({ docs: mockDocs, notes: [], team: mockTeam, tasks: [] });
      render(<CoordinationNotes />);

      const editor = screen.getByTestId('tiptap-editor');
      mockRange.commonAncestorContainer = editor;

      fireEvent.mouseUp(editor);

      // Verify bubble menu shows Note/Learning button
      const noteBtn = await screen.findByText(/Note\/Learning/i);
      expect(noteBtn).toBeInTheDocument();
      fireEvent.click(noteBtn);

      // NoteComposer popover should open
      const titleInput = await screen.findByPlaceholderText('Note title');
      expect(titleInput).toBeInTheDocument();
      fireEvent.change(titleInput, { target: { value: 'Learning Note Title' } });

      const saveBtn = screen.getByRole('button', { name: /Save note/i });
      fireEvent.click(saveBtn);

      await waitFor(() => expect(setDoc).toHaveBeenCalled());

      getSelectionSpy.mockRestore();
    });

    it('handles direct assignment via @ button in selection menu', async () => {
      const mockRange = {
        commonAncestorContainer: null as any,
        getBoundingClientRect: () => ({ top: 100, left: 100, width: 80, height: 20 }),
      };
      
      const mockSelection = {
        isCollapsed: false,
        rangeCount: 1,
        getRangeAt: () => mockRange,
        toString: () => 'Directly assigned task text',
        removeAllRanges: vi.fn(),
      };
      
      const getSelectionSpy = vi.spyOn(window, 'getSelection').mockReturnValue(mockSelection as any);

      setupSnapshots({ docs: mockDocs, notes: [], team: mockTeam, tasks: [] });
      render(<CoordinationNotes />);

      const editor = screen.getByTestId('tiptap-editor');
      mockRange.commonAncestorContainer = editor;

      fireEvent.mouseUp(editor);

      const assignMenuBtn = await screen.findByText('Assign');
      expect(assignMenuBtn).toBeInTheDocument();
      fireEvent.click(assignMenuBtn);

      const assignUserBtn = await screen.findByText('Tony Wang');
      expect(assignUserBtn).toBeInTheDocument();
      fireEvent.click(assignUserBtn);

      await waitFor(() => expect(addDoc).toHaveBeenCalled());

      getSelectionSpy.mockRestore();
    });
  });

  // ── Full screen mode ────────────────────────────────────────────────────────
  describe('full screen mode', () => {
    it('renders full screen toggle button and toggles workspace full screen mode', async () => {
      const mockDocs = [
        {
          id: 'doc-1',
          data: () => ({
            title: 'Weekly Meeting',
            date: today,
            weekday: 'Monday',
            time: '14:00',
            place: 'Room A',
            audience: 'team',
            md: 'Meeting content',
            pinned: false,
            createdBy: 'u-1',
            updatedAt: today,
          }),
        },
      ];

      setupSnapshots({ docs: mockDocs });
      render(<CoordinationNotes />);

      const fullScreenBtn = await screen.findByRole('button', { name: /full screen/i });
      expect(fullScreenBtn).toBeInTheDocument();

      const workspace = screen.getByTestId('coordination-notes-workspace');
      expect(workspace).not.toHaveClass('fixed');
      const hold = screen.getByTestId('coordination-doc-hold');
      expect(hold).not.toHaveClass('is-fs');

      // Click to enter full screen
      fireEvent.click(fullScreenBtn);

      const exitFullScreenBtn = await screen.findByRole('button', { name: /close full screen|back to board|exit full screen/i });
      expect(exitFullScreenBtn).toBeInTheDocument();
      // Full screen pins the OPEN PAGE hold (design `.bdoc-hold.is-fs`), not the whole workspace grid
      expect(hold).toHaveClass('is-fs');
      expect(workspace).not.toHaveClass('fixed');

      // Click to exit full screen
      fireEvent.click(exitFullScreenBtn);

      expect(screen.getByRole('button', { name: /full screen/i })).toBeInTheDocument();
      expect(hold).not.toHaveClass('is-fs');
      expect(workspace).not.toHaveClass('fixed');
    });

    it('exits full screen mode when pressing Escape key', async () => {
      const mockDocs = [
        {
          id: 'doc-1',
          data: () => ({
            title: 'Weekly Meeting',
            date: today,
            weekday: 'Monday',
            time: '14:00',
            place: 'Room A',
            audience: 'team',
            md: 'Meeting content',
            pinned: false,
            createdBy: 'u-1',
            updatedAt: today,
          }),
        },
      ];

      setupSnapshots({ docs: mockDocs });
      render(<CoordinationNotes />);

      const fullScreenBtn = await screen.findByRole('button', { name: /full screen/i });
      fireEvent.click(fullScreenBtn);

      const workspace = screen.getByTestId('coordination-notes-workspace');
      const hold = screen.getByTestId('coordination-doc-hold');
      expect(hold).toHaveClass('is-fs');
      expect(workspace).not.toHaveClass('fixed');

      // Press Escape key
      fireEvent.keyDown(window, { key: 'Escape' });

      expect(hold).not.toHaveClass('is-fs');
      expect(workspace).not.toHaveClass('fixed');
      expect(screen.getByRole('button', { name: /full screen/i })).toBeInTheDocument();
    });

    it('handles fullscreenchange event and ReadOnlyDoc full screen toggle', async () => {
      (useAuth as ReturnType<typeof vi.fn>).mockReturnValue(traineeAuth);
      const mockDocs = [
        {
          id: 'doc-1',
          data: () => ({
            title: 'Trainee Meeting',
            date: today,
            weekday: 'Monday',
            time: '14:00',
            place: 'Room B',
            audience: 'trainees',
            md: 'Trainee meeting content',
            pinned: false,
            createdBy: 'u-1',
            updatedAt: today,
          }),
        },
      ];

      setupSnapshots({ docs: mockDocs });
      render(<CoordinationNotes />);

      const fullScreenBtn = await screen.findByRole('button', { name: /full screen/i });
      expect(fullScreenBtn).toBeInTheDocument();

      fireEvent.click(fullScreenBtn);
      const workspace = screen.getByTestId('coordination-notes-workspace');
      const hold = screen.getByTestId('coordination-doc-hold');
      expect(hold).toHaveClass('is-fs');
      expect(workspace).not.toHaveClass('fixed');

      // Trigger fullscreenchange when no element is in fullscreen
      fireEvent(document, new Event('fullscreenchange'));
      expect(hold).toHaveClass('is-fs');
      expect(workspace).not.toHaveClass('fixed');
    });
  });

  describe('Pinned pages & reordering', () => {
    it('lands on the top pinned document when opening /coordination', async () => {
      (useAuth as ReturnType<typeof vi.fn>).mockReturnValue(adminAuth);
      const mockDocs = [
        {
          id: 'doc-today',
          data: () => ({
            title: 'Unpinned Today Meeting',
            date: today,
            weekday: 'Wednesday',
            audience: 'team',
            md: 'Content today',
            pinned: false,
            createdBy: 'u-1',
            updatedAt: today,
          }),
        },
        {
          id: 'doc-pinned-1',
          data: () => ({
            title: 'Top Pinned Page',
            date: '2026-06-01',
            weekday: 'Monday',
            audience: 'team',
            md: 'Content pinned 1',
            pinned: true,
            pinnedOrder: 0,
            createdBy: 'u-1',
            updatedAt: '2026-06-01',
          }),
        },
        {
          id: 'doc-pinned-2',
          data: () => ({
            title: 'Second Pinned Page',
            date: '2026-06-02',
            weekday: 'Tuesday',
            audience: 'team',
            md: 'Content pinned 2',
            pinned: true,
            pinnedOrder: 1,
            createdBy: 'u-1',
            updatedAt: '2026-06-02',
          }),
        },
      ];

      setupSnapshots({ docs: mockDocs });
      render(<CoordinationNotes />);

      // Top pinned doc should be active on load
      await waitFor(() => {
        expect(screen.getByDisplayValue('Top Pinned Page')).toBeInTheDocument();
      });
    });

    it('renders drag handles for pinned pages when editing enabled', async () => {
      (useAuth as ReturnType<typeof vi.fn>).mockReturnValue(adminAuth);
      const mockDocs = [
        {
          id: 'pinned-1',
          data: () => ({
            title: 'Pinned Doc A',
            date: '2026-06-01',
            weekday: 'Monday',
            audience: 'team',
            md: 'Content A',
            pinned: true,
            pinnedOrder: 0,
            createdBy: 'u-1',
            updatedAt: '2026-06-01',
          }),
        },
        {
          id: 'pinned-2',
          data: () => ({
            title: 'Pinned Doc B',
            date: '2026-06-02',
            weekday: 'Tuesday',
            audience: 'team',
            md: 'Content B',
            pinned: true,
            pinnedOrder: 1,
            createdBy: 'u-1',
            updatedAt: '2026-06-02',
          }),
        },
      ];

      setupSnapshots({ docs: mockDocs });
      render(<CoordinationNotes />);

      const dragBtnA = await screen.findByRole('button', { name: /drag to reorder pinned doc a/i });
      expect(dragBtnA).toBeInTheDocument();
    });
  });

  describe('SuggestedTaskCard', () => {
    const mockTask = {
      title: 'Follow up with student',
      dueDate: '2026-08-10',
      priority: 'high',
      assigneeId: 'u-1',
      contactId: 'c-1',
    };

    it('renders task card and calls onSaveTask when submitted', async () => {
      const onSaveTask = vi.fn().mockResolvedValue(undefined);
      const onAdd = vi.fn();
      const onDismiss = vi.fn();

      render(
        <SuggestedTaskCard
          task={mockTask}
          isAdded={false}
          contacts={[{ id: 'c-1', name: 'John' } as any]}
          team={[{ uid: 'u-1', name: 'Alice' } as any]}
          meUid="u-1"
          onAdd={onAdd}
          onDismiss={onDismiss}
          onSaveTask={onSaveTask}
        />,
      );

      expect(screen.getByDisplayValue('Follow up with student')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: /add task/i }));

      await waitFor(() => {
        expect(onSaveTask).toHaveBeenCalledWith({
          title: 'Follow up with student',
          dueDate: '2026-08-10',
          priority: 'high',
          contactId: 'c-1',
          assigneeId: 'u-1',
        });
        expect(onAdd).toHaveBeenCalled();
      });
    });

    it('renders isAdded state correctly', () => {
      render(
        <SuggestedTaskCard
          task={mockTask}
          isAdded={true}
          contacts={[]}
          team={[]}
          meUid="u-1"
          onAdd={vi.fn()}
          onDismiss={vi.fn()}
          onSaveTask={vi.fn()}
        />,
      );

      expect(screen.getByText('Added')).toBeInTheDocument();
    });

    it('handles changing fields, priority buttons, and calling onDismiss', async () => {
      const onSaveTask = vi.fn().mockResolvedValue(undefined);
      const onAdd = vi.fn();
      const onDismiss = vi.fn();
      const contacts = [{ id: 'c-1', name: 'John' }, { id: 'c-2', name: 'Mary' }];

      const { container } = render(
        <SuggestedTaskCard
          task={mockTask}
          isAdded={false}
          contacts={contacts as any}
          team={[{ uid: 'u-1', name: 'Alice' } as any]}
          meUid="u-1"
          onAdd={onAdd}
          onDismiss={onDismiss}
          onSaveTask={onSaveTask}
        />,
      );

      const dateInput = container.querySelector('input[type="date"]')!;
      fireEvent.change(dateInput, { target: { value: '2026-09-01' } });

      const selects = container.querySelectorAll('select');
      fireEvent.change(selects[1], { target: { value: 'c-2' } }); // contact select

      const medPriorityBtn = screen.getByRole('button', { name: 'med' });
      fireEvent.click(medPriorityBtn);

      const dismissBtn = screen.getByRole('button', { name: 'Dismiss' });
      fireEvent.click(dismissBtn);
      expect(onDismiss).toHaveBeenCalled();

      fireEvent.click(screen.getByRole('button', { name: /add task/i }));

      await waitFor(() => {
        expect(onSaveTask).toHaveBeenCalledWith({
          title: 'Follow up with student',
          dueDate: '2026-09-01',
          priority: 'medium',
          contactId: 'c-2',
          assigneeId: 'u-1',
        });
      });
    });
  });

