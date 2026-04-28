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
  return {
    collection: vi.fn(() => mockCollection),
    onSnapshot: vi.fn(),
    query: vi.fn(),
    orderBy: vi.fn(),
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
    stage: 'First Contact',
    initials: 'JD',
    lastSeen: '2 days ago',
  },
  {
    id: '2',
    name: 'Jane Smith',
    email: 'jane@example.com',
    role: 'Faculty',
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
          data: () => {
            const { id, ...data } = c;
            return data;
          }
        }))
      });
      return vi.fn(); // Unsubscribe
    });

    render(<Directory />, { wrapper: BrowserRouter });

    expect(screen.getByText('John Doe')).toBeInTheDocument();
    expect(screen.getByText('Jane Smith')).toBeInTheDocument();
    expect(screen.getByText('john@example.com')).toBeInTheDocument();
  });

  it('Adding a Contact: calls addDoc with correct data', async () => {
    render(<NewContactModal isOpen={true} onClose={vi.fn()} />);

    // Fill form
    fireEvent.change(screen.getByPlaceholderText(/e.g. Alex/i), { target: { value: 'Bob' } });
    fireEvent.change(screen.getByPlaceholderText(/e.g. Johnson/i), { target: { value: 'Builder' } });
    fireEvent.change(screen.getByPlaceholderText(/alex@campus.edu/i), { target: { value: 'bob@build.it' } });
    fireEvent.change(screen.getByPlaceholderText(/e.g. Student/i), { target: { value: 'Contractor' } });

    // Submit
    const submitBtn = screen.getByText('Add Contact');
    fireEvent.click(submitBtn);

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
    const editBtn = screen.getByTitle(/Edit Contact/i);
    fireEvent.click(editBtn);

    // Change role
    const roleInput = screen.getByDisplayValue(contact.role);
    fireEvent.change(roleInput, { target: { value: 'Alumni' } });

    // Save
    const saveBtn = screen.getByText('Save Changes');
    fireEvent.click(saveBtn);

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
