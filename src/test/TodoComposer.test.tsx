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
});
