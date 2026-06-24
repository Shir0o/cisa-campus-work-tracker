import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import TodoRow, { type TodoItem } from '../components/todos/TodoRow';

// Keep the firebase side-effects out of the import chain (todos.ts → firebase.ts).
vi.mock('../lib/firebase', () => ({
  db: {},
  handleFirestoreError: vi.fn(),
  OperationType: { CREATE: 'create', UPDATE: 'update', DELETE: 'delete', LIST: 'list' },
}));

const baseTodo: TodoItem = {
  id: 't1',
  title: 'Confirm the Friday setlist',
  status: 'pending',
  dueDate: null,
  createdByName: 'Priya Anand',
  sourceDocId: 'bd-fri',
  sourceDocTitle: 'Friday Night — run of show',
};

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
});
