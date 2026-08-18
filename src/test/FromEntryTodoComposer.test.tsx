import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import FromEntryTodoComposer from '../components/todos/FromEntryTodoComposer';
import * as todos from '../lib/todos';

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
  logActivity: vi.fn(),
}));

vi.mock('../lib/todos', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/todos')>();
  return {
    ...actual,
    addTodo: vi.fn().mockResolvedValue('todo-1'),
    updateTodo: vi.fn().mockResolvedValue(undefined),
  };
});

const team = [
  { uid: 'u1', name: 'Tony Wang' },
  { uid: 'u2', name: 'Priya Anand' },
];

const baseProps = {
  text: 'Check on Alice',
  contactId: 'c1',
  contactName: 'Alice Johnson',
  source: { interactionId: 'ev-1', interactionTitle: 'Friday Gathering' },
  team,
  meUid: 'u1',
  meName: 'Tony Wang',
  onClose: vi.fn(),
};

describe('FromEntryTodoComposer', () => {
  beforeEach(() => vi.clearAllMocks());

  it('opens pre-filled with the entry text, assignee and contact (issue #336)', () => {
    render(<FromEntryTodoComposer {...baseProps} />);
    expect(screen.getByPlaceholderText('What needs doing?')).toHaveValue('Check on Alice');
    // The entry point's assignee (me) is pre-selected; the source is shown.
    expect(screen.getByText('Friday Gathering')).toBeInTheDocument();
  });

  it('commits the to-do carrying the contact and the interaction source', async () => {
    render(<FromEntryTodoComposer {...baseProps} />);
    fireEvent.click(screen.getByRole('button', { name: /add to-do/i }));

    await waitFor(() => expect(todos.addTodo).toHaveBeenCalled());
    expect(todos.addTodo).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Check on Alice',
        contactId: 'c1',
        contactName: 'Alice Johnson',
        source: { interactionId: 'ev-1', interactionTitle: 'Friday Gathering' },
      }),
      { uid: 'u1', name: 'Tony Wang' },
    );
  });

  it('closes on commit', async () => {
    render(<FromEntryTodoComposer {...baseProps} />);
    fireEvent.click(screen.getByRole('button', { name: /add to-do/i }));
    await waitFor(() => expect(baseProps.onClose).toHaveBeenCalled());
  });
});