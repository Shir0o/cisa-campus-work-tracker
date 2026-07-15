import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import TodoComposer from '../components/todos/TodoComposer';
import * as todos from '../lib/todos';
import { sendNotification } from '../lib/firebase';

vi.mock('motion/react', () => ({
  AnimatePresence: ({ children }: any) => <>{children}</>,
  motion: {
    div: React.forwardRef(({ children, initial, animate, exit, transition, ...p }: any, ref: any) => (
      <div ref={ref} {...p}>
        {children}
      </div>
    )),
  },
}));

vi.mock('../lib/firebase', () => ({
  db: {},
  handleFirestoreError: vi.fn(),
  OperationType: { CREATE: 'create', UPDATE: 'update', DELETE: 'delete', LIST: 'list' },
  sendNotification: vi.fn().mockResolvedValue(undefined),
}));

// Keep the pure helpers (presets, dueChip) real; spy only on the Firestore writes.
vi.mock('../lib/todos', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/todos')>();
  return {
    ...actual,
    addTodo: vi.fn().mockResolvedValue(undefined),
    updateTodo: vi.fn().mockResolvedValue(undefined),
  };
});

const team = [
  { uid: 'u1', name: 'Tony Wang' },
  { uid: 'u2', name: 'Priya Anand' },
];

describe('TodoComposer', () => {
  beforeEach(() => vi.clearAllMocks());

  it('requires both text and an assignee before it can save', () => {
    render(
      <TodoComposer mode="create" team={team} meUid="u1" meName="Tony Wang" onClose={vi.fn()} onSaved={vi.fn()} />,
    );
    const add = screen.getByRole('button', { name: /add to-do/i });
    expect(add).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText('What needs doing?'), { target: { value: 'Call the venue' } });
    expect(add).toBeDisabled(); // text but no assignee yet
    fireEvent.click(screen.getByRole('button', { name: /Priya/ }));
    expect(add).toBeEnabled();
  });

  it('creates a to-do with its source page and notifies a different assignee', async () => {
    const onSaved = vi.fn();
    render(
      <TodoComposer
        mode="create"
        source={{ docId: 'bd1', docTitle: 'Friday Night' }}
        team={team}
        meUid="u1"
        meName="Tony Wang"
        onClose={vi.fn()}
        onSaved={onSaved}
      />,
    );
    fireEvent.change(screen.getByPlaceholderText('What needs doing?'), { target: { value: 'Call the venue' } });
    fireEvent.click(screen.getByRole('button', { name: /Priya/ }));
    fireEvent.click(screen.getByRole('button', { name: /add to-do/i }));

    await waitFor(() => expect(todos.addTodo).toHaveBeenCalled());
    expect(todos.addTodo).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Call the venue', assigneeId: 'u2', source: { docId: 'bd1', docTitle: 'Friday Night' } }),
      { uid: 'u1', name: 'Tony Wang' },
    );
    expect(sendNotification).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u2', type: 'assignment' }));
    expect(onSaved).toHaveBeenCalled();
  });

  it('does not notify when you assign a to-do to yourself', async () => {
    render(
      <TodoComposer mode="create" team={team} meUid="u1" meName="Tony Wang" onClose={vi.fn()} onSaved={vi.fn()} />,
    );
    fireEvent.change(screen.getByPlaceholderText('What needs doing?'), { target: { value: 'Prep the agenda' } });
    fireEvent.click(screen.getByRole('button', { name: /Tony/ }));
    fireEvent.click(screen.getByRole('button', { name: /add to-do/i }));

    await waitFor(() => expect(todos.addTodo).toHaveBeenCalled());
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it('creates multiple to-dos at once', async () => {
    const onSaved = vi.fn();
    render(
      <TodoComposer
        mode="create"
        initialTexts={['Task 1', 'Task 2']}
        team={team}
        meUid="u1"
        meName="Tony Wang"
        onClose={vi.fn()}
        onSaved={onSaved}
      />,
    );
    
    // Assignee is required
    const add = screen.getByRole('button', { name: /add to-dos/i });
    expect(add).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /Priya/ }));
    expect(add).toBeEnabled();

    // Verify task inputs are rendered
    expect(screen.getByPlaceholderText('Task 1')).toHaveValue('Task 1');
    expect(screen.getByPlaceholderText('Task 2')).toHaveValue('Task 2');

    // Add them
    fireEvent.click(add);

    await waitFor(() => expect(todos.addTodo).toHaveBeenCalledTimes(2));
    expect(onSaved).toHaveBeenCalledWith('Created 2 tasks for Priya.');
  });

  it('edits an existing to-do through updateTodo', async () => {
    render(
      <TodoComposer
        mode="edit"
        initial={{ id: 't9', text: 'Old text', assigneeId: 'u1', dueDate: null }}
        team={team}
        meUid="u1"
        meName="Tony Wang"
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );
    const ta = screen.getByPlaceholderText('What needs doing?') as HTMLTextAreaElement;
    expect(ta.value).toBe('Old text');
    fireEvent.change(ta, { target: { value: 'New text' } });
    fireEvent.click(screen.getByRole('button', { name: /^Save$/ }));

    await waitFor(() =>
      expect(todos.updateTodo).toHaveBeenCalledWith('t9', expect.objectContaining({ title: 'New text', assigneeId: 'u1' })),
    );
  });

  it('closes when Escape is pressed', () => {
    const onClose = vi.fn();
    render(
      <TodoComposer mode="create" team={team} meUid="u1" meName="Tony Wang" onClose={onClose} />,
    );
    fireEvent.keyDown(screen.getByPlaceholderText('What needs doing?').closest('div[class*="bg-surface"]')!, {
      key: 'Escape',
    });
    expect(onClose).toHaveBeenCalled();
  });

  it('saves via Ctrl+Enter keyboard shortcut', async () => {
    render(
      <TodoComposer mode="create" team={team} meUid="u1" meName="Tony Wang" onClose={vi.fn()} onSaved={vi.fn()} />,
    );
    fireEvent.change(screen.getByPlaceholderText('What needs doing?'), { target: { value: 'Keyboard task' } });
    fireEvent.click(screen.getByRole('button', { name: /Tony/ }));
    const card = screen.getByPlaceholderText('What needs doing?').closest('div[class*="bg-surface"]')!;
    fireEvent.keyDown(card, { key: 'Enter', ctrlKey: true });
    await waitFor(() => expect(todos.addTodo).toHaveBeenCalled());
  });

  it('closes when Cancel button is clicked', () => {
    const onClose = vi.fn();
    render(
      <TodoComposer mode="create" team={team} meUid="u1" meName="Tony Wang" onClose={onClose} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Cancel/ }));
    expect(onClose).toHaveBeenCalled();
  });

  it('shows the custom DatePicker when "Pick a date…" is clicked', () => {
    render(
      <TodoComposer mode="create" team={team} meUid="u1" meName="Tony Wang" onClose={vi.fn()} />,
    );
    // Click "Pick a date…" to switch to custom mode
    fireEvent.click(screen.getByRole('button', { name: /Pick a date/i }));
    expect(screen.getByText('Due date')).toBeInTheDocument();
  });

  it('renders in anchored mode when anchorRect is provided', () => {
    render(
      <TodoComposer
        mode="create"
        anchorRect={{ top: 200, left: 400 }}
        team={team}
        meUid="u1"
        meName="Tony Wang"
        onClose={vi.fn()}
      />,
    );
    // The component should render — just verify it's in the DOM
    expect(screen.getByPlaceholderText('What needs doing?')).toBeInTheDocument();
  });

  it('handles save failure gracefully', async () => {
    (todos.addTodo as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('save failed'));
    const onClose = vi.fn();
    render(
      <TodoComposer mode="create" team={team} meUid="u1" meName="Tony Wang" onClose={onClose} onSaved={vi.fn()} />,
    );
    fireEvent.change(screen.getByPlaceholderText('What needs doing?'), { target: { value: 'Failing task' } });
    fireEvent.click(screen.getByRole('button', { name: /Tony/ }));
    fireEvent.click(screen.getByRole('button', { name: /add to-do/i }));

    // Wait a tick — the save should fail but not crash
    await waitFor(() => expect(todos.addTodo).toHaveBeenCalled());
    // onClose should NOT have been called since save failed
    expect(onClose).not.toHaveBeenCalled();
  });

  it('pre-selects "custom" due pill when editing with an arbitrary due date', () => {
    render(
      <TodoComposer
        mode="edit"
        initial={{ id: 't1', text: 'Task', assigneeId: 'u1', dueDate: '2099-12-31' }}
        team={team}
        meUid="u1"
        meName="Tony Wang"
        onClose={vi.fn()}
      />,
    );
    // The "Pick a date…" button should be styled as active (bg-primary)
    const pickBtn = screen.getByRole('button', { name: /Pick a date/i });
    expect(pickBtn.className).toContain('bg-primary');
  });
});
