import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import AttachDataModal from '../components/modals/AttachDataModal';
import * as firestore from 'firebase/firestore';
import { useAuth } from '../components/AuthProvider';

// Mock Auth
vi.mock('../components/AuthProvider', () => ({
  useAuth: vi.fn(),
}));

// Mock Firebase
vi.mock('../lib/firebase', () => ({
  db: 'mock-db',
}));

// Mock Firestore
vi.mock('firebase/firestore', () => ({
  collection: vi.fn().mockReturnValue('mock-collection'),
  collectionGroup: vi.fn().mockReturnValue('mock-collection-group'),
  query: vi.fn().mockReturnValue('mock-query'),
  orderBy: vi.fn(),
  onSnapshot: vi.fn(),
  limit: vi.fn(),
  doc: vi.fn(),
}));

// Mock motion
vi.mock('motion/react', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

const mockContacts = [
  { id: 'c1', name: 'Alice Green', role: 'Student', location: 'Campus Hub' },
  { id: 'c2', name: 'Bob Jones', role: 'Staff', location: 'Main Hall' },
];

describe('AttachDataModal Component', () => {
  const mockOnClose = vi.fn();
  const mockOnAttach = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (useAuth as any).mockReturnValue({
      role: 'admin', // Allows viewing all tabs
    });
  });

  const setupOnSnapshot = (data: any[]) => {
    (firestore.onSnapshot as any).mockImplementation((q: any, successCallback: any) => {
      successCallback({
        docs: data.map(item => ({
          id: item.id,
          data: () => {
            const { id, ...rest } = item;
            return rest;
          }
        }))
      });
      return vi.fn(); // Unsubscribe
    });
  };

  it('renders all tabs for Admin user', async () => {
    setupOnSnapshot(mockContacts);
    render(
      <AttachDataModal
        isOpen={true}
        onClose={mockOnClose}
        onAttach={mockOnAttach}
      />
    );

    expect(screen.getByText('Attach Reference Data')).toBeInTheDocument();
    expect(screen.getByText('Contact')).toBeInTheDocument();
    expect(screen.getByText('Todo')).toBeInTheDocument();
    expect(screen.getByText('Event')).toBeInTheDocument();
    expect(screen.getByText('Interaction')).toBeInTheDocument();
    expect(screen.getByText('Prayer')).toBeInTheDocument();
    expect(screen.getByText('Note')).toBeInTheDocument();
    expect(screen.getByText('Feedback')).toBeInTheDocument();
  });

  it('hides admin-only tabs for operator role', async () => {
    (useAuth as any).mockReturnValue({
      role: 'operator',
    });
    setupOnSnapshot(mockContacts);
    
    render(
      <AttachDataModal
        isOpen={true}
        onClose={mockOnClose}
        onAttach={mockOnAttach}
      />
    );

    expect(screen.getByText('Contact')).toBeInTheDocument();
    expect(screen.queryByText('Note')).not.toBeInTheDocument();
    expect(screen.queryByText('Feedback')).not.toBeInTheDocument();
  });

  it('renders data items and triggers onAttach when an item is clicked', async () => {
    setupOnSnapshot(mockContacts);
    
    render(
      <AttachDataModal
        isOpen={true}
        onClose={mockOnClose}
        onAttach={mockOnAttach}
      />
    );

    expect(screen.getByText('Alice Green')).toBeInTheDocument();
    expect(screen.getByText('Bob Jones')).toBeInTheDocument();

    const aliceItem = screen.getByText('Alice Green').closest('button');
    expect(aliceItem).toBeTruthy();
    fireEvent.click(aliceItem!);

    expect(mockOnAttach).toHaveBeenCalledWith({
      type: 'contact',
      id: 'c1',
      name: 'Alice Green',
      subtitle: 'Student',
      status: undefined,
      priority: undefined
    });
    expect(mockOnClose).toHaveBeenCalled();
  });

  it('filters data items using search input', async () => {
    setupOnSnapshot(mockContacts);
    
    render(
      <AttachDataModal
        isOpen={true}
        onClose={mockOnClose}
        onAttach={mockOnAttach}
      />
    );

    const searchInput = screen.getByPlaceholderText(/Search contacts/i);
    fireEvent.change(searchInput, { target: { value: 'Alice' } });

    expect(screen.getByText('Alice Green')).toBeInTheDocument();
    expect(screen.queryByText('Bob Jones')).not.toBeInTheDocument();
  });

  it('supports selecting and attaching a todo item', async () => {
    const mockTodos = [
      { id: 't1', title: 'Buy milk', dueDate: '2026-06-30', status: 'pending', priority: 'high' }
    ];
    setupOnSnapshot(mockTodos);
    render(
      <AttachDataModal
        isOpen={true}
        onClose={mockOnClose}
        onAttach={mockOnAttach}
      />
    );

    fireEvent.click(screen.getByText('Todo'));
    expect(await screen.findByText('Buy milk')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Buy milk').closest('button')!);

    expect(mockOnAttach).toHaveBeenCalledWith({
      type: 'todo',
      id: 't1',
      name: 'Buy milk',
      subtitle: 'Due: 2026-06-30',
      status: 'pending',
      priority: 'high'
    });
    expect(mockOnClose).toHaveBeenCalled();
  });

  it('supports selecting and attaching an event', async () => {
    const mockEvents = [
      { id: 'e1', name: 'Summer Camp', date: '2026-07-15' }
    ];
    setupOnSnapshot(mockEvents);
    render(
      <AttachDataModal
        isOpen={true}
        onClose={mockOnClose}
        onAttach={mockOnAttach}
      />
    );

    fireEvent.click(screen.getByText('Event'));
    expect(await screen.findByText('Summer Camp')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Summer Camp').closest('button')!);

    expect(mockOnAttach).toHaveBeenCalledWith({
      type: 'event',
      id: 'e1',
      name: 'Summer Camp',
      subtitle: '2026-07-15',
      status: undefined,
      priority: undefined
    });
  });

  it('supports selecting and attaching an interaction', async () => {
    const mockInteractions = [
      { id: 'i1', content: 'Discussed progress with Bob Jones', userName: 'Alice', dateTime: '2026-06-20T10:00:00Z' }
    ];
    setupOnSnapshot(mockInteractions);
    render(
      <AttachDataModal
        isOpen={true}
        onClose={mockOnClose}
        onAttach={mockOnAttach}
      />
    );

    fireEvent.click(screen.getByText('Interaction'));
    expect(await screen.findByText('Discussed progress with Bob Jones')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Discussed progress with Bob Jones').closest('button')!);

    expect(mockOnAttach).toHaveBeenCalledWith({
      type: 'interaction',
      id: 'i1',
      name: 'Discussed progress with Bob Jones',
      subtitle: expect.any(String),
      status: undefined,
      priority: undefined
    });
  });

  it('supports selecting and attaching a prayer burden', async () => {
    const mockPrayers = [
      { id: 'p1', burden: 'Pray for campus revival and fellowships', status: 'pending' }
    ];
    setupOnSnapshot(mockPrayers);
    render(
      <AttachDataModal
        isOpen={true}
        onClose={mockOnClose}
        onAttach={mockOnAttach}
      />
    );

    fireEvent.click(screen.getByText('Prayer'));
    expect(await screen.findByText('Pray for campus revival and fellowships')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Pray for campus revival and fellowships').closest('button')!);

    expect(mockOnAttach).toHaveBeenCalledWith({
      type: 'prayer',
      id: 'p1',
      name: 'Pray for campus revival and fellowships',
      subtitle: 'Status: pending',
      status: 'pending',
      priority: undefined
    });
  });

  it('supports selecting and attaching coordination notes', async () => {
    const mockNotes = [
      { id: 'n1', title: 'Chapter 2 coordination notes', series: 'Series A', date: '2026-06-22' }
    ];
    setupOnSnapshot(mockNotes);
    render(
      <AttachDataModal
        isOpen={true}
        onClose={mockOnClose}
        onAttach={mockOnAttach}
      />
    );

    fireEvent.click(screen.getByText('Note'));
    expect(await screen.findByText('Chapter 2 coordination notes')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Chapter 2 coordination notes').closest('button')!);

    expect(mockOnAttach).toHaveBeenCalledWith({
      type: 'note',
      id: 'n1',
      name: 'Chapter 2 coordination notes',
      subtitle: 'Series A • 2026-06-22',
      status: undefined,
      priority: undefined
    });
  });

  it('supports selecting and attaching feedback', async () => {
    const mockFeedbacks = [
      { id: 'f1', message: 'The app works perfectly!', userEmail: 'bob@example.com', type: 'Suggestion', status: 'new' }
    ];
    setupOnSnapshot(mockFeedbacks);
    render(
      <AttachDataModal
        isOpen={true}
        onClose={mockOnClose}
        onAttach={mockOnAttach}
      />
    );

    fireEvent.click(screen.getByText('Feedback'));
    expect(await screen.findByText('The app works perfectly!')).toBeInTheDocument();
    fireEvent.click(screen.getByText('The app works perfectly!').closest('button')!);

    expect(mockOnAttach).toHaveBeenCalledWith({
      type: 'feedback',
      id: 'f1',
      name: 'The app works perfectly!',
      subtitle: 'bob@example.com • Suggestion',
      status: 'new',
      priority: undefined
    });
  });

  it('closes on Escape key when open', () => {
    setupOnSnapshot([]);
    render(
      <AttachDataModal
        isOpen={true}
        onClose={mockOnClose}
        onAttach={mockOnAttach}
      />
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(mockOnClose).toHaveBeenCalled();
  });

  it('does not register the Escape listener when closed', () => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    setupOnSnapshot([]);
    render(
      <AttachDataModal
        isOpen={false}
        onClose={mockOnClose}
        onAttach={mockOnAttach}
      />
    );
    expect(addSpy).not.toHaveBeenCalledWith('keydown', expect.any(Function));
    addSpy.mockRestore();
  });

  it('sets loading false and clears items when the snapshot errors', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    (firestore.onSnapshot as any).mockImplementation((q: any, success: any, error: any) => {
      error(new Error('permission denied'));
      return vi.fn();
    });
    render(
      <AttachDataModal
        isOpen={true}
        onClose={mockOnClose}
        onAttach={mockOnAttach}
      />
    );
    // error path clears loading so the empty message appears
    expect(await screen.findByText(/No contacts found matching your query/i)).toBeInTheDocument();
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it('shows an empty message when a tab returns no items', async () => {
    setupOnSnapshot([]);
    render(
      <AttachDataModal
        isOpen={true}
        onClose={mockOnClose}
        onAttach={mockOnAttach}
      />
    );
    expect(await screen.findByText(/No contacts found matching your query/i)).toBeInTheDocument();
  });

  it('renders a status chip for todo/feedback items with a status', async () => {
    setupOnSnapshot([
      { id: 't1', title: 'Booked flights', dueDate: '2026-06-30', status: 'completed', priority: 'high' },
    ]);
    render(
      <AttachDataModal
        isOpen={true}
        onClose={mockOnClose}
        onAttach={mockOnAttach}
      />
    );
    fireEvent.click(screen.getByText('Todo'));
    expect(await screen.findByText('completed')).toBeInTheDocument();
  });
});
