import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import Directory from '../views/Directory';
import NewContactModal from '../components/modals/NewContactModal';
import ContactDetailsModal from '../components/modals/ContactDetailsModal';
import * as firestore from 'firebase/firestore';

// Mock Firebase
vi.mock('firebase/firestore', () => {
  const mockDoc = { id: 'mock-id' };
  const mockCollection = { id: 'mock-collection' };
  class MockTimestamp {
    seconds: number;
    nanoseconds: number;
    constructor(seconds: number, nanoseconds: number) {
      this.seconds = seconds;
      this.nanoseconds = nanoseconds;
    }
    toDate() {
      return new Date(this.seconds * 1000);
    }
    static now() {
      return new MockTimestamp(Math.floor(Date.now() / 1000), 0);
    }
    static fromDate(date: Date) {
      return new MockTimestamp(Math.floor(date.getTime() / 1000), 0);
    }
  }

  return {
    collection: vi.fn(() => mockCollection),
    collectionGroup: vi.fn(() => mockCollection),
    onSnapshot: vi.fn(),
    query: vi.fn(),
    orderBy: vi.fn(),
    where: vi.fn(),
    addDoc: vi.fn(),
    updateDoc: vi.fn(),
    deleteDoc: vi.fn(),
    doc: vi.fn(() => mockDoc),
    getDocs: vi.fn(() => Promise.resolve({ empty: true, docs: [] })),
    serverTimestamp: vi.fn(),
    limit: vi.fn(),
    writeBatch: vi.fn(() => ({
      delete: vi.fn(),
      commit: vi.fn(),
    })),
    Timestamp: MockTimestamp,
  };
});

vi.mock('../lib/firebase', () => ({
  db: {},
  handleFirestoreError: vi.fn(),
  OperationType: {
    CREATE: 'create',
    UPDATE: 'update',
    DELETE: 'delete',
    LIST: 'list',
    GET: 'get',
    WRITE: 'write',
  },
}));

vi.mock('../components/AuthProvider', () => ({
  useAuth: () => ({
    user: { uid: '123' },
    isAdmin: true,
  }),
}));

vi.mock('../App', () => ({
  useLayout: () => ({
    isSidebarCollapsed: false,
    setSelectedContact: vi.fn(),
    openNewContact: vi.fn(),
  }),
}));

// Mock framer-motion
vi.mock('motion/react', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    span: ({ children, ...props }: any) => <span {...props}>{children}</span>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

const mockContacts = [
  {
    id: '1',
    name: 'John Doe',
    email: 'john@example.com',
    role: 'Student',
    location: 'Campus Hub',
    phone: '123-456-7890',
    stage: 'First Contact',
    initials: 'JD',
    lastSeen: '2 days ago',
  },
  {
    id: '2',
    name: 'Jane Smith',
    email: 'jane@example.com',
    role: 'Faculty',
    location: 'Office 101',
    phone: '098-765-4321',
    stage: 'Regular',
    initials: 'JS',
    lastSeen: '1 hour ago',
  }
];

describe('Contact Management', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Seeing Contacts: renders contact list from Firestore', async () => {
    // Setup onSnapshot mock to return our contacts
    (firestore.onSnapshot as any).mockImplementation((q: any, successCallback: any) => {
      successCallback({
        docs: mockContacts.map(c => ({
          id: c.id,
          ref: { path: `contacts/${c.id}/interactions/x` },
          data: () => {
            const { id, ...data } = c;
            return data;
          }
        }))
      });
      return vi.fn(); // Unsubscribe
    });

    render(<Directory />, { wrapper: BrowserRouter });

    // People-first cards: names + meta render (emails live behind a mailto button).
    expect(await screen.findByText('John Doe')).toBeInTheDocument();
    expect(await screen.findByText('Jane Smith')).toBeInTheDocument();
    expect(await screen.findByText(/Student · Campus Hub/)).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /Email/i }).length).toBeGreaterThan(0);
  });

  it('Adding a Contact: calls addDoc with correct data', async () => {
    render(<NewContactModal isOpen={true} onClose={vi.fn()} />);

    // Fill primary 2 fields
    fireEvent.change(screen.getByPlaceholderText(/First name is plenty/i), { target: { value: 'Bob' } });
    fireEvent.change(screen.getByPlaceholderText(/\(555\) 000-0000/i), { target: { value: '(555) 123-4567' } });

    // Open disclosure for remaining fields
    fireEvent.click(screen.getByText(/\+ Add the rest/i));

    fireEvent.change(screen.getByPlaceholderText(/e.g. Johnson/i), { target: { value: 'Builder' } });
    fireEvent.change(screen.getByPlaceholderText(/alex@campus.edu/i), { target: { value: 'bob@build.it' } });
    fireEvent.change(screen.getByPlaceholderText(/e.g. Student/i), { target: { value: 'Contractor' } });
    fireEvent.change(screen.getByPlaceholderText(/e.g. Campus Coffee/i), { target: { value: 'Library' } });

    // Submit
    const form = document.getElementById('new-contact-form');
    fireEvent.submit(form!);

    await waitFor(() => {
      expect(firestore.addDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          name: 'Bob Builder',
          email: 'bob@build.it',
          role: 'Contractor'
        })
      );
    });
  });

  it('Changing a Contact: updates contact details', async () => {
    const contact = mockContacts[0];
    render(
      <ContactDetailsModal 
        isOpen={true} 
        onClose={vi.fn()} 
        contact={contact} 
      />
    );

    // Enter edit mode
    const editBtn = screen.getByTitle(/Edit details/i);
    fireEvent.click(editBtn);

    // Change role
    const roleInput = screen.getByDisplayValue(contact.role);
    fireEvent.change(roleInput, { target: { value: 'Alumni' } });

    // Save
    const form = document.getElementById('edit-contact-form');
    fireEvent.submit(form!);

    await waitFor(() => {
      expect(firestore.updateDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          role: 'Alumni'
        })
      );
    });
  });

  it('Deleting a Contact: calls deleteDoc', async () => {
    // Mock window.confirm
    vi.stubGlobal('confirm', vi.fn(() => true));
    
    const contact = mockContacts[0];
    render(
      <ContactDetailsModal 
        isOpen={true} 
        onClose={vi.fn()} 
        contact={contact} 
      />
    );

    const deleteButtons = screen.getAllByText(/Delete Contact/i);
    fireEvent.click(deleteButtons[0]);

    await waitFor(() => {
      expect(firestore.deleteDoc).toHaveBeenCalled();
    });
  });
});
