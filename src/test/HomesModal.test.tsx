import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import HomesModal from '../components/modals/HomesModal';
import { useAuth } from '../components/AuthProvider';
import { addHome, updateHome } from '../lib/homes';
import { handleFirestoreError } from '../lib/firebase';
import type { Contact, Home, Visit } from '../types';

vi.mock('../components/AuthProvider', () => ({ useAuth: vi.fn() }));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  doc: vi.fn(),
  onSnapshot: vi.fn(() => vi.fn()),
  addDoc: vi.fn(() => Promise.resolve({ id: 'h-new' })),
  updateDoc: vi.fn(() => Promise.resolve()),
}));

vi.mock('../lib/firebase', () => ({
  db: {},
  handleFirestoreError: vi.fn(),
  OperationType: { LIST: 'LIST', CREATE: 'CREATE', UPDATE: 'UPDATE', DELETE: 'DELETE', WRITE: 'WRITE' },
  logActivity: vi.fn(),
}));

vi.mock('../lib/homes', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/homes')>();
  return {
    ...actual,
    addHome: vi.fn(() => Promise.resolve('h-new')),
    updateHome: vi.fn(() => Promise.resolve()),
  };
});

const contact = (id: string, name: string): Contact => ({ id, name } as Contact);

const visit = (id: string, contactIds: string[]): Visit =>
  ({
    id,
    date: '2026-08-01',
    contactIds,
    contactNames: [],
    went: [],
    wentNames: [],
    where: '',
    purpose: '',
    how: '',
    followUp: '',
    photos: [],
    createdAt: '',
    createdById: '',
    createdByName: '',
  }) as Visit;

const baseProps = {
  isOpen: true,
  onClose: vi.fn(),
  homes: [] as Home[],
  contacts: [contact('c1', 'Ama Osei'), contact('c2', 'Kofi Osei'), contact('c3', 'Bo Chen')],
  visits: [] as Visit[],
  onHomeSaved: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  (useAuth as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
    user: { uid: 'u1', displayName: 'Mei Tanaka' },
    effectiveUserId: 'u1',
  });
});

describe('HomesModal', () => {
  it('renders nothing when closed', () => {
    const { container } = render(<HomesModal {...baseProps} isOpen={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('creates a home by hand', async () => {
    render(<HomesModal {...baseProps} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add a home' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'the Chens' } });
    fireEvent.click(screen.getByRole('button', { name: /Bo Chen$/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Create home' }));

    await waitFor(() => expect(addHome).toHaveBeenCalled());
    const [input, by] = (addHome as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(input).toMatchObject({
      label: 'the Chens',
      members: ['c3'],
      active: true,
    });
    expect(by).toMatchObject({ uid: 'u1', name: 'Mei Tanaka' });
  });

  it('proposes a home from a co-visited pair and confirms it', async () => {
    const visits = [visit('v1', ['c1', 'c3'])];
    render(<HomesModal {...baseProps} visits={visits} />);

    expect(screen.getByText('Suggested homes')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Review' }));
    // The suggestion prefills the members and an empty label to be named.
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'the Oseis' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create home' }));

    await waitFor(() => expect(addHome).toHaveBeenCalled());
    const [input] = (addHome as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(input.members).toEqual(['c1', 'c3']);
    expect(input.label).toBe('the Oseis');
  });

  it('proposes nothing already accepted by an existing home', () => {
    const homes = [{ id: 'h1', label: 'the Oseis', members: ['c1', 'c2'], active: true }];
    render(<HomesModal {...baseProps} homes={homes} visits={[visit('v1', ['c1', 'c2'])]} />);
    expect(screen.queryByText('Suggested homes')).not.toBeInTheDocument();
  });

  it('edits an existing home', async () => {
    const homes = [{ id: 'h1', label: 'the Oseis', members: ['c1'], active: true }];
    render(<HomesModal {...baseProps} homes={homes} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit home: the Oseis' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'the Peinados' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(updateHome).toHaveBeenCalled());
    const [id, input] = (updateHome as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(id).toBe('h1');
    expect(input).toMatchObject({ label: 'the Peinados', members: ['c1'], active: true });
  });

  it('marks a home inactive when the last member is removed', async () => {
    const homes = [{ id: 'h1', label: 'the Oseis', members: ['c1'], active: true }];
    render(<HomesModal {...baseProps} homes={homes} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit home: the Oseis' }));
    fireEvent.click(screen.getByRole('button', { name: /Ama Osei$/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(updateHome).toHaveBeenCalled());
    const [, input] = (updateHome as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(input).toMatchObject({ members: [], active: false });
  });

  it('surfaces a failed save', async () => {
    (addHome as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('denied'));
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<HomesModal {...baseProps} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add a home' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'the Chens' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create home' }));
    await waitFor(() =>
      expect(handleFirestoreError).toHaveBeenCalledWith(expect.any(Error), 'WRITE', 'homes'),
    );
    errSpy.mockRestore();
  });

  it('does not propose people already homed to the surname cluster', () => {
    const homes = [{ id: 'h1', label: 'the Oseis', members: ['c1'], active: true }];
    const contacts = [contact('c1', 'Ama Osei'), contact('c2', 'Kofi Osei')];
    render(<HomesModal {...baseProps} homes={homes} contacts={contacts} />);
    // The Oseis home already exists; the only other Osei (c2) is alone, so
    // nothing is proposed — the list shows the existing home, not a suggestion.
    expect(screen.queryByText('Suggested homes')).not.toBeInTheDocument();
  });

  it('does not re-propose people in an inactive home', () => {
    const homes = [{ id: 'h1', label: 'the retired Oseis', members: ['c1', 'c2'], active: false }];
    const contacts = [contact('c1', 'Ama Osei'), contact('c2', 'Kofi Osei'), contact('c3', 'Bo Chen')];
    const visits = [visit('v1', ['c1', 'c3'])];
    render(<HomesModal {...baseProps} homes={homes} contacts={contacts} visits={visits} />);
    // c1 is already in a home (even an inactive one) so it is not re-proposed;
    // c3 is co-visited with c1 but c1 is excluded, so c3 proposes nothing alone.
    expect(screen.queryByText('Suggested homes')).not.toBeInTheDocument();
  });
});