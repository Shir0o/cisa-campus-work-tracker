import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import TodoRow, { PersonAvatar, type TodoItem } from '../components/todos/TodoRow';

// Keep the firebase side-effects out of the import chain (todos.ts → firebase.ts).
vi.mock('../lib/firebase', () => ({
  db: {},
  handleFirestoreError: vi.fn(),
  OperationType: { CREATE: 'create', UPDATE: 'update', DELETE: 'delete', LIST: 'list' },
}));

// toggleSubtask writes to Firestore — stub it so subtask interactions are unit-testable.
vi.mock('../lib/todos', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/todos')>();
  return { ...actual, toggleSubtask: vi.fn().mockResolvedValue(undefined) };
});

import { toggleSubtask } from '../lib/todos';

const mockedToggleSubtask = vi.mocked(toggleSubtask);

const baseTodo: TodoItem = {
  id: 't1',
  title: 'Confirm the Friday setlist',
  status: 'pending',
  dueDate: null,
  createdByName: 'Priya Anand',
  sourceDocId: 'bd-fri',
  sourceDocTitle: 'Friday Night — run of show',
};

describe('PersonAvatar', () => {
  it('renders an img when the person has a photoURL', () => {
    render(<PersonAvatar person={{ uid: 'u1', name: 'Tony Wang', photoURL: 'http://example.com/pic.jpg' }} />);
    const img = screen.getByAltText('Tony Wang');
    expect(img).toHaveAttribute('src', 'http://example.com/pic.jpg');
  });

  it('renders initials when the person has no photoURL', () => {
    render(<PersonAvatar person={{ uid: 'u1', name: 'Tony Wang' }} />);
    expect(screen.getByTitle('Tony Wang')).toBeInTheDocument();
    expect(screen.getByText('TW')).toBeInTheDocument();
  });

  it('renders a dash when no person is provided', () => {
    render(<PersonAvatar />);
    expect(screen.getByText('–')).toBeInTheDocument();
  });

  it.each(['xs', 'sm', 'md'] as const)('renders at size=%s without error', (size) => {
    const { container } = render(<PersonAvatar person={{ uid: 'u1', name: 'A B' }} size={size} />);
    expect(container.firstChild).toBeInTheDocument();
  });
});

describe('TodoRow', () => {
  it('renders the title, "from" attribution, and the source-page link', () => {
    render(<TodoRow todo={baseTodo} onToggle={vi.fn()} />);
    expect(screen.getByText('Confirm the Friday setlist')).toBeInTheDocument();
    expect(screen.getByText('from Priya')).toBeInTheDocument();
    expect(screen.getByText('Friday Night — run of show')).toBeInTheDocument();
  });

  it('toggles done when the check button is clicked', () => {
    const onToggle = vi.fn();
    render(<TodoRow todo={baseTodo} onToggle={onToggle} />);
    fireEvent.click(screen.getByTitle('Mark done'));
    expect(onToggle).toHaveBeenCalledWith(baseTodo, true);
  });

  it('toggles back to pending when a completed todo is clicked', () => {
    const onToggle = vi.fn();
    const doneTodo = { ...baseTodo, status: 'completed' as const };
    render(<TodoRow todo={doneTodo} onToggle={onToggle} />);
    fireEvent.click(screen.getByTitle('Done — tap to reopen'));
    expect(onToggle).toHaveBeenCalledWith(doneTodo, false);
  });

  it('jumps to the source page when the source link is clicked', () => {
    const onJump = vi.fn();
    render(<TodoRow todo={baseTodo} onToggle={vi.fn()} onJumpToSource={onJump} />);
    fireEvent.click(screen.getByText('Friday Night — run of show'));
    expect(onJump).toHaveBeenCalledWith('bd-fri');
  });

  it('shows a due chip for an open dated to-do and hides it once done', () => {
    const today = new Date().toISOString();
    const { rerender } = render(<TodoRow todo={{ ...baseTodo, dueDate: today }} onToggle={vi.fn()} />);
    expect(screen.getByText('Due today')).toBeInTheDocument();
    rerender(<TodoRow todo={{ ...baseTodo, dueDate: today, status: 'completed' }} onToggle={vi.fn()} />);
    expect(screen.queryByText('Due today')).not.toBeInTheDocument();
  });

  it('calls onDelete when the delete affordance is used', () => {
    const onDelete = vi.fn();
    render(<TodoRow todo={baseTodo} onToggle={vi.fn()} onDelete={onDelete} />);
    fireEvent.click(screen.getByLabelText('Delete to-do'));
    expect(onDelete).toHaveBeenCalledWith(baseTodo);
  });

  it('shows the assignee when showAssignee is true', () => {
    const assignee = { uid: 'u2', name: 'Priya Anand', photoURL: 'http://example.com/pa.jpg' };
    render(<TodoRow todo={baseTodo} assignee={assignee} showAssignee onToggle={vi.fn()} />);
    expect(screen.getByText('Priya')).toBeInTheDocument();
    expect(screen.getByAltText('Priya Anand')).toBeInTheDocument();
  });

  it('calls onEdit when the title button is clicked', () => {
    const onEdit = vi.fn();
    render(<TodoRow todo={baseTodo} onToggle={vi.fn()} onEdit={onEdit} />);
    fireEvent.click(screen.getByText('Confirm the Friday setlist'));
    expect(onEdit).toHaveBeenCalledWith(baseTodo);
  });

  it('renders contact link and calls onContactClick', () => {
    const todoWithContact = { ...baseTodo, contactId: 'c1', contactName: 'Jane Doe' };
    const onContactClick = vi.fn();
    render(<TodoRow todo={todoWithContact} onToggle={vi.fn()} onContactClick={onContactClick} />);
    fireEvent.click(screen.getByText('Jane Doe'));
    expect(onContactClick).toHaveBeenCalledWith('c1');
  });

  it('shows the source when a to-do was born from a live item (message, prayer, absence)', () => {
    const todoFromInteraction: TodoItem = {
      ...baseTodo,
      sourceDocId: null,
      sourceDocTitle: null,
      sourceInteractionId: 'msg-1',
      sourceInteractionTitle: 'Message from Mei',
    };
    render(<TodoRow todo={todoFromInteraction} onToggle={vi.fn()} />);
    expect(screen.getByText('Message from Mei')).toBeInTheDocument();
    expect(screen.getByText('from Priya')).toBeInTheDocument();
  });

  it('renders the subtask checklist and its completion count', () => {
    const todoWithSubtasks: TodoItem = {
      ...baseTodo,
      createdByName: null,
      sourceDocId: null,
      sourceDocTitle: null,
      subtasks: [
        { id: 's1', title: 'Book the van', done: false },
        { id: 's2', title: 'Send the invite', done: true },
      ],
    };
    render(<TodoRow todo={todoWithSubtasks} onToggle={vi.fn()} />);
    expect(screen.getByText('1/2')).toBeInTheDocument();
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes).toHaveLength(2);
    expect(checkboxes[0]).not.toBeChecked();
    expect(checkboxes[1]).toBeChecked();
    expect(screen.getByText('Book the van')).toBeInTheDocument();
    expect(screen.getByText('Send the invite')).toBeInTheDocument();
  });

  it('toggles a subtask via toggleSubtask', () => {
    const todoWithSubtasks: TodoItem = {
      ...baseTodo,
      createdByName: null,
      sourceDocId: null,
      sourceDocTitle: null,
      subtasks: [{ id: 's1', title: 'Book the van', done: false }],
    };
    render(<TodoRow todo={todoWithSubtasks} onToggle={vi.fn()} />);
    fireEvent.click(screen.getByRole('checkbox'));
    expect(mockedToggleSubtask).toHaveBeenCalledWith('t1', todoWithSubtasks.subtasks, 's1', true);
  });

  it('swallows toggleSubtask failures', () => {
    mockedToggleSubtask.mockRejectedValueOnce(new Error('boom'));
    const todoWithSubtasks: TodoItem = {
      ...baseTodo,
      createdByName: null,
      sourceDocId: null,
      sourceDocTitle: null,
      subtasks: [{ id: 's1', title: 'Book the van', done: false }],
    };
    render(<TodoRow todo={todoWithSubtasks} onToggle={vi.fn()} />);
    expect(() => fireEvent.click(screen.getByRole('checkbox'))).not.toThrow();
  });

  it('renders translated todo title and subtask in Spanish mode when cached', async () => {
    const { setCachedTranslation } = await import('../lib/translator');
    const { LanguageProvider } = await import('../components/LanguageProvider');

    setCachedTranslation('Confirm the Friday setlist', 'Confirmar el repertorio del viernes', 'es');
    setCachedTranslation('Book the van', 'Reservar la furgoneta', 'es');

    const todoWithSubtasks: TodoItem = {
      ...baseTodo,
      subtasks: [{ id: 's1', title: 'Book the van', done: false }],
    };

    render(
      <LanguageProvider defaultLanguage="es">
        <TodoRow todo={todoWithSubtasks} onToggle={vi.fn()} />
      </LanguageProvider>
    );

    expect(screen.getByText('Confirmar el repertorio del viernes')).toBeInTheDocument();
    expect(screen.getByText('Reservar la furgoneta')).toBeInTheDocument();
  });
});

