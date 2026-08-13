import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import CoordinationNotes from '../views/CoordinationNotes';
import CoordinationNotesMobile from '../views/CoordinationNotesMobile';
import { useAuth } from '../components/AuthProvider';

vi.mock('../components/AuthProvider', () => ({
  useAuth: vi.fn(),
}));

let mockLocation = { state: null as any, search: '' };
vi.mock('react-router-dom', () => ({
  useLocation: () => mockLocation,
  Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}));

// Seam mocks for TipTap & Yjs
const mockEditor = {
  commands: { setContent: vi.fn(), setTextSelection: vi.fn() },
  isEmpty: false,
  isFocused: false,
  state: { selection: { from: 0, to: 0 }, doc: { content: { size: 0 }, descendants: () => {} } },
  view: { dispatch: vi.fn() },
  storage: { markdown: { getMarkdown: () => '# Meeting Agenda\n## Small Groups', parser: { parse: (md: string) => `<div>${md}</div>` } } },
  isActive: vi.fn(() => false),
  on: vi.fn(),
  off: vi.fn(),
};

vi.mock('@tiptap/react', () => ({
  useEditor: () => mockEditor,
  EditorContent: () => <div data-testid="tiptap-editor">Editor Content</div>,
}));
vi.mock('@tiptap/starter-kit', () => ({ StarterKit: { configure: () => ({}) } }));
vi.mock('@tiptap/extension-collaboration', () => ({ Collaboration: { configure: () => ({}) } }));
vi.mock('@tiptap/extension-collaboration-caret', () => ({ CollaborationCaret: { configure: () => ({}) } }));
vi.mock('@tiptap/extension-task-list', () => ({ TaskList: { configure: () => ({}) } }));
vi.mock('@tiptap/extension-task-item', () => ({ TaskItem: { configure: () => ({}) } }));
vi.mock('@tiptap/extension-placeholder', () => ({ Placeholder: { configure: () => ({}) } }));
vi.mock('tiptap-markdown', () => ({ Markdown: { configure: () => ({}) } }));
vi.mock('yjs', () => {
  class MockDoc {
    getText() { return { toJSON: () => '', observe: vi.fn(), toString: () => '' }; }
    destroy() {} on() {} off() {}
  }
  return { Doc: MockDoc };
});
vi.mock('y-protocols/awareness', () => {
  class MockAwareness {
    setLocalStateField() {} on() {} off() {} destroy() {} getStates() { return new Map(); }
  }
  return { Awareness: MockAwareness };
});

const mockDocData = [
  {
    id: 'doc-1',
    data: () => ({
      title: 'Weekly Standup Gathering',
      date: '2026-06-25',
      md: '# Meeting Agenda\nWelcome team!\n## Small Groups\nDiscussion about retreats and conferences.\n- [ ] Send welcome emails',
      audience: 'team',
      facilitatorId: 'u1',
    }),
  },
];

const mockNoteData = [
  {
    id: 'note-1',
    data: () => ({
      title: 'Conference Logistics',
      body: 'Book venue for annual retreat',
      date: '2026-06-20',
      series: 'Conferences',
      type: 'record',
      tags: ['retreat', 'venue'],
      contributorIds: ['u1'],
    }),
  },
];

const mockTaskData = [
  {
    id: 'task-1',
    data: () => ({
      text: 'Order welcome pack badges',
      due: '2026-06-30',
      assigneeId: 'u1',
      sourceDocId: 'doc-1',
      completed: false,
    }),
  },
];

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db: unknown, path: string) => ({ path })),
  onSnapshot: vi.fn((ref: any, callback: any) => {
    if (typeof callback === 'function') {
      const path = ref?.path || '';
      if (path === 'board_docs') {
        callback({ docs: mockDocData });
      } else if (path === 'board_notes') {
        callback({ docs: mockNoteData });
      } else if (path === 'todos' || path === 'board_tasks') {
        callback({ docs: mockTaskData });
      } else {
        callback({ docs: [] });
      }
    }
    return () => {};
  }),
  query: vi.fn((ref: unknown) => ref),
  orderBy: vi.fn(),
  where: vi.fn(),
  doc: vi.fn((_db: unknown, coll: string, id?: string) => ({ path: id ? `${coll}/${id}` : coll, id: id || 'auto-id' })),
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
  OperationType: { LIST: 'LIST', CREATE: 'CREATE', UPDATE: 'UPDATE', DELETE: 'DELETE' },
  logActivity: vi.fn(),
}));

const MockChildComponent = () => <div>Mock Component</div>;

describe('Coordination Notes Search & Jump to Anchor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLocation = { state: null, search: '' };
    (useAuth as any).mockReturnValue({
      user: { uid: 'u1', displayName: 'Test User' },
      role: 'admin',
    });
  });

  it('renders search input with placeholder and keyboard shortcut hint', async () => {
    render(<CoordinationNotes />);
    const searchInput = screen.getByPlaceholderText(/search pages, headings, notes & tasks/i);
    expect(searchInput).toBeInTheDocument();
  });

  it('focuses search input when slash (/) or Cmd+K is pressed', async () => {
    render(<CoordinationNotes />);
    const searchInput = screen.getByPlaceholderText(/search pages, headings, notes & tasks/i);

    fireEvent.keyDown(window, { key: '/' });
    expect(document.activeElement).toBe(searchInput);

    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    expect(document.activeElement).toBe(searchInput);
  });

  it('filters search results live and allows clicking a heading result to jump to anchor', async () => {
    const scrollIntoViewMock = vi.fn();
    window.HTMLElement.prototype.scrollIntoView = scrollIntoViewMock;

    render(<CoordinationNotes />);
    const searchInput = screen.getByPlaceholderText(/search pages, headings, notes & tasks/i);

    fireEvent.change(searchInput, { target: { value: 'Small Groups' } });

    const results = await screen.findAllByText('Small Groups');
    expect(results.length).toBeGreaterThan(0);

    const buttonResult = results.find((el) => el.closest('button'));
    expect(buttonResult).toBeDefined();

    fireEvent.click(buttonResult!.closest('button')!);

    await waitFor(() => {
      expect(scrollIntoViewMock).toHaveBeenCalled();
    });
  });

  it('allows clicking note search result to jump to target note', async () => {
    const scrollIntoViewMock = vi.fn();
    window.HTMLElement.prototype.scrollIntoView = scrollIntoViewMock;

    render(<CoordinationNotes />);
    const searchInput = screen.getByPlaceholderText(/search pages, headings, notes & tasks/i);

    fireEvent.change(searchInput, { target: { value: 'Conference Logistics' } });
    const noteBtn = (await screen.findAllByText('Conference Logistics')).find((el) => el.closest('button'));
    expect(noteBtn).toBeDefined();
    fireEvent.click(noteBtn!.closest('button')!);

    await waitFor(() => {
      expect(scrollIntoViewMock).toHaveBeenCalled();
    });
  });

  it('allows clicking filter tabs (Pages & Headings, Notes, Tasks)', async () => {
    render(<CoordinationNotes />);
    const searchInput = screen.getByPlaceholderText(/search pages, headings, notes & tasks/i);

    fireEvent.change(searchInput, { target: { value: 'e' } });

    const headingTab = screen.getAllByRole('button', { name: /Pages & Headings/i })[0];
    fireEvent.click(headingTab);

    const notesTab = screen.getAllByRole('button', { name: /Notes/i })[0];
    fireEvent.click(notesTab);

    const tasksTab = screen.getAllByRole('button', { name: /Tasks/i })[0];
    fireEvent.click(tasksTab);

    const allTab = screen.getAllByRole('button', { name: /^All/i })[0];
    fireEvent.click(allTab);
  });

  it('renders clear button and resets search input when clicked', async () => {
    render(<CoordinationNotes />);
    const searchInput = screen.getByPlaceholderText(/search pages, headings, notes & tasks/i) as HTMLInputElement;

    fireEvent.change(searchInput, { target: { value: 'Retreat' } });
    expect(searchInput.value).toBe('Retreat');

    const clearButton = searchInput.parentElement?.querySelector('button');
    expect(clearButton).toBeInTheDocument();
    fireEvent.click(clearButton!);

    expect(searchInput.value).toBe('');
  });

  it('shows no matching results message when search query does not match', async () => {
    render(<CoordinationNotes />);
    const searchInput = screen.getByPlaceholderText(/search pages, headings, notes & tasks/i);

    fireEvent.change(searchInput, { target: { value: 'NonExistentTermXYZ' } });

    const noResultsMsg = await screen.findByText(/no matching results found for "NonExistentTermXYZ"/i);
    expect(noResultsMsg).toBeInTheDocument();
  });

  it('handles deep-linking from location.state and location.search', async () => {
    const scrollIntoViewMock = vi.fn();
    window.HTMLElement.prototype.scrollIntoView = scrollIntoViewMock;
    mockLocation = { state: { focusNoteId: 'note-1', focusDocId: 'doc-1' }, search: '?focusDoc=doc-1&anchor=small-groups' };

    render(<CoordinationNotes />);

    await waitFor(() => {
      expect(scrollIntoViewMock).toHaveBeenCalled();
    });
  });

  it('renders SearchBarComponent in CoordinationNotesMobile', () => {
    render(
      <CoordinationNotesMobile
        canEdit={true}
        canSeeNotes={true}
        docs={[]}
        active={null}
        activeId={null}
        setActiveId={vi.fn()}
        newDoc={vi.fn()}
        promoteDoc={vi.fn()}
        heading="Notes"
        intro="Intro"
        uid="u1"
        meName="User"
        pagesCollapsed={false}
        togglePages={vi.fn()}
        setLiveActiveMd={vi.fn()}
        saveMarkdown={vi.fn()}
        saveTitle={vi.fn()}
        saveAudience={vi.fn()}
        deleteBoardDoc={vi.fn()}
        team={[]}
        showToast={vi.fn()}
        contacts={[]}
        setSelectedContact={vi.fn()}
        setIsDetailsModalOpen={vi.fn()}
        DocEditorComponent={MockChildComponent}
        ReadOnlyDocComponent={MockChildComponent}
        TodoSectionComponent={<MockChildComponent />}
        NotesSectionComponent={<MockChildComponent />}
        SearchBarComponent={<div data-testid="mobile-search-bar">Mobile Search Bar</div>}
      />,
    );

    expect(screen.getByTestId('mobile-search-bar')).toBeInTheDocument();
  });
});
