import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  Impersonation,
  impStaffTarget,
  impPersonaTarget,
  impContactTarget,
  impFirst,
  impInits,
  cleanCisaName,
  DEFAULT_TEST_ACCOUNTS,
} from '../lib/impersonate';
import ImpersonatePicker from '../components/layout/ImpersonatePicker';
import ImpersonateBar from '../components/layout/ImpersonateBar';
import ImpersonateModal from '../components/layout/ImpersonateModal';

vi.mock('../lib/firebase', () => ({
  db: {},
  auth: {},
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  query: vi.fn(),
  orderBy: vi.fn(),
  onSnapshot: vi.fn(() => () => {}),
}));

let mockOwnerViewRole: any = null;
let mockImpersonateTarget: any = null;
const mockSetOwnerViewRole = vi.fn();
const mockSetImpersonateTarget = vi.fn();

vi.mock('../components/AuthProvider', () => ({
  useAuth: () => ({
    isOwner: true,
    ownerViewRole: mockOwnerViewRole,
    setOwnerViewRole: mockSetOwnerViewRole,
    impersonateTarget: mockImpersonateTarget,
    setImpersonateTarget: mockSetImpersonateTarget,
  }),
}));



describe('Impersonation Data & Helpers', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('handles name helper fallback edge cases', () => {
    expect(impFirst('')).toBe('');
    expect(impInits('')).toBe('');
    expect(impInits('  ')).toBe('');
    expect(impPersonaTarget('invalid')).toBeNull();
    expect(cleanCisaName('cisa-admin (Test Full-timer)')).toBe('cisa-admin');
    expect(cleanCisaName('cisa-trainee')).toBe('cisa-trainee');
    expect(cleanCisaName('John Doe')).toBe('John Doe');
  });

  it('resolves staff targets correctly', () => {
    const target = Impersonation.resolve('staff:cisa-admin');
    expect(target).not.toBeNull();
    expect(target?.name).toBe('cisa-admin');
    expect(target?.name).not.toContain('(Test');
    expect(target?.role).toBe('admin');

    const traineeTarget = Impersonation.resolve('staff:cisa-trainee');
    expect(traineeTarget?.name).toBe('cisa-trainee');
    expect(traineeTarget?.name).not.toContain('(Test');
    expect(traineeTarget?.role).toBe('manager');

    expect(Impersonation.resolve('staff:nonexistent')).toBeNull();
  });

  it('strips (Test *) suffixes from cisa-* names in impStaffTarget and impContactTarget', () => {
    const staffTarget = impStaffTarget({ id: 'cisa-admin', name: 'cisa-admin (Test Full-timer)' });
    expect(staffTarget.name).toBe('cisa-admin');

    const contactTarget = impContactTarget({ id: 'cisa-student', name: 'cisa-student (Test Student)' });
    expect(contactTarget.name).toBe('cisa-student');
  });

  it('resolves custom user targets correctly when passed users array', () => {
    const mockUsers = [{ uid: 'u99', displayName: 'Jane Doe', email: 'jane@example.com', role: 'admin' }];
    const target = Impersonation.resolve('staff:u99', [], mockUsers);
    expect(target).not.toBeNull();
    expect(target?.name).toBe('Jane Doe');
    expect(target?.role).toBe('admin');
  });

  it('handles impStaffTarget edge cases for email fallback and role mappings', () => {
    const emailOnly = impStaffTarget({ id: 'u100', email: 'user100@example.com', role: 'Trainee' });
    expect(emailOnly.name).toBe('user100');
    expect(emailOnly.role).toBe('manager');

    const viewerTarget = impStaffTarget({ id: 'u101', name: 'Bob Smith', role: 'viewer' });
    expect(viewerTarget.role).toBe('viewer');
    expect(viewerTarget.sub).toBe('Community');

    const unknownRoleTarget = impStaffTarget({ id: 'u102', name: 'Unknown Role', role: 'custom' });
    expect(unknownRoleTarget.role).toBe('admin');

    const fallbackNoName = impStaffTarget({ id: 'u103' });
    expect(fallbackNoName.name).toBe('Team Member');
  });

  it('handles impContactTarget without year or major', () => {
    const contactNoDetails = impContactTarget({ id: 'c999', name: 'No Details Contact' });
    expect(contactNoDetails.sub).toBe('Student');
    expect(contactNoDetails.role).toBe('operator');
  });

  it('resolves persona targets correctly', () => {
    const student = Impersonation.resolve('persona:student');
    expect(student?.name).toContain('Student');
    expect(student?.role).toBe('operator');

    const community = Impersonation.resolve('persona:community');
    expect(community?.name).toContain('Community');
    expect(community?.role).toBe('viewer');

    expect(Impersonation.resolve('persona:nonexistent')).toBeNull();
  });

  it('resolves contact targets correctly when passed contacts roster', () => {
    const mockContacts = [{ id: 'c123', name: 'Sam Taylor', year: 'Senior', major: 'Math' }];
    const target = Impersonation.resolve('contact:c123', mockContacts);
    expect(target?.name).toBe('Sam Taylor');
    expect(target?.sub).toBe('Senior · Math');
    expect(target?.role).toBe('operator');

    expect(Impersonation.resolve('contact:nonexistent', mockContacts)).toBeNull();
  });

  it('handles null, empty, or invalid key resolution', () => {
    expect(Impersonation.resolve(null)).toBeNull();
    expect(Impersonation.resolve('')).toBeNull();
    expect(Impersonation.resolve('invalidkey')).toBeNull();
  });

  it('persists impersonation target key in localStorage', () => {
    expect(Impersonation.key()).toBeNull();
    Impersonation.set('staff:cisa-admin');
    expect(Impersonation.key()).toBe('staff:cisa-admin');
    expect(Impersonation.current()?.name).toContain('cisa-admin');

    Impersonation.set(null);
    expect(Impersonation.key()).toBeNull();
  });
});

describe('ImpersonatePicker Component', () => {
  it('renders team, personas, and cisa-* test accounts and filters by search query', () => {
    const onPick = vi.fn();
    const mockUsers = [{ uid: 'u1', displayName: 'Alex Chen', email: 'alex@example.com', role: 'admin' }];
    render(<ImpersonatePicker currentKey={null} onPick={onPick} users={mockUsers} autoFocus />);

    expect(screen.getByText(/The team & test accounts/i)).toBeInTheDocument();
    expect(screen.getByText('Students & friends')).toBeInTheDocument();
    expect(screen.getByText('Alex Chen')).toBeInTheDocument();
    expect(screen.getAllByText(/cisa-admin/i).length).toBeGreaterThan(0);

    const searchInput = screen.getByPlaceholderText(/Find a person/i);
    fireEvent.change(searchInput, { target: { value: 'Alex' } });

    expect(screen.getByText('Alex Chen')).toBeInTheDocument();
    expect(screen.queryByText('cisa-trainee')).not.toBeInTheDocument();

    // Clear search
    const clearBtn = screen.getByLabelText('Clear search');
    fireEvent.click(clearBtn);
    expect(searchInput).toHaveValue('');

    const pickButton = screen.getByRole('button', { name: /Alex Chen/i });
    fireEvent.click(pickButton);
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick.mock.calls[0][0].key).toBe('staff:u1');
  });

  it('handles custom contacts and expands roster list', () => {
    const customContacts = Array.from({ length: 10 }, (_, i) => ({
      id: `custom-${i}`,
      name: `Person ${i}`,
      year: 'Junior',
      major: 'Bio',
    }));

    render(<ImpersonatePicker currentKey={null} onPick={vi.fn()} contacts={customContacts} />);

    expect(screen.getByText('Person 0')).toBeInTheDocument();
    const moreBtn = screen.getByText(/Show the rest of the roster/i);
    fireEvent.click(moreBtn);

    expect(screen.getByText('Person 9')).toBeInTheDocument();
  });
});

describe('ImpersonateBar Component', () => {
  it('renders active target banner and fires switch/exit callbacks', () => {
    const target = impStaffTarget(DEFAULT_TEST_ACCOUNTS[0]);
    const onSwitch = vi.fn();
    const onExit = vi.fn();

    render(<ImpersonateBar target={target} onSwitch={onSwitch} onExit={onExit} />);

    expect(screen.getByText(/You're seeing CISA as/i)).toBeInTheDocument();
    expect(screen.getAllByText(/cisa-admin/i).length).toBeGreaterThan(0);

    const switchBtn = screen.getByRole('button', { name: /Someone else/i });
    fireEvent.click(switchBtn);
    expect(onSwitch).toHaveBeenCalledTimes(1);

    const exitBtn = screen.getByRole('button', { name: /Back to my view/i });
    fireEvent.click(exitBtn);
    expect(onExit).toHaveBeenCalledTimes(1);
  });
});

describe('ImpersonateModal Component', () => {
  it('renders modal when open, handles picking target, scrim click, and ESC key', () => {
    const onClose = vi.fn();
    const onPick = vi.fn();

    const { rerender } = render(
      <ImpersonateModal isOpen={false} currentKey={null} onPick={onPick} onClose={onClose} />,
    );
    expect(screen.queryByText('See as their view')).not.toBeInTheDocument();

    rerender(
      <ImpersonateModal isOpen={true} currentKey={null} onPick={onPick} onClose={onClose} />,
    );
    expect(screen.getByText('See as their view')).toBeInTheDocument();

    // Pick target inside modal
    const staffBtn = screen.getByRole('button', { name: /cisa-admin/i });
    fireEvent.click(staffBtn);
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);

    // ESC key test
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();

    // Scrim click test
    const dialogTitle = screen.getByText('See as their view');
    const scrim = dialogTitle.closest('.fixed')!;
    fireEvent.click(scrim);
    expect(onClose).toHaveBeenCalled();
  });

  it('handles role preview pills and Back to my view reset button', () => {
    const onClose = vi.fn();
    const onPick = vi.fn();

    render(
      <ImpersonateModal isOpen={true} currentKey={null} onPick={onPick} onClose={onClose} />,
    );

    // Click Student role preview button
    const studentRoleBtn = screen.getByRole('button', { name: 'Student' });
    fireEvent.click(studentRoleBtn);
    expect(mockSetOwnerViewRole).toHaveBeenCalledWith('operator');

    // Click Trainee role preview button
    const traineeRoleBtn = screen.getByRole('button', { name: 'Trainee' });
    fireEvent.click(traineeRoleBtn);
    expect(mockSetOwnerViewRole).toHaveBeenCalledWith('manager');
  });

  it('renders Back to my view button when active view is set', () => {
    const onClose = vi.fn();
    const onPick = vi.fn();

    // Re-mock useAuth with active ownerViewRole
    mockOwnerViewRole = 'operator';
    mockImpersonateTarget = { key: 'staff:cisa-admin', name: 'cisa-admin', sub: 'Full-timer', note: 'Full workspace', role: 'admin' };

    render(
      <ImpersonateModal isOpen={true} currentKey="staff:cisa-admin" onPick={onPick} onClose={onClose} />,
    );

    const resetBtn = screen.getByRole('button', { name: /Back to my view/i });
    expect(resetBtn).toBeInTheDocument();

    fireEvent.click(resetBtn);
    expect(mockSetImpersonateTarget).toHaveBeenCalledWith(null);
    expect(mockSetOwnerViewRole).toHaveBeenCalledWith(null);
  });
});


