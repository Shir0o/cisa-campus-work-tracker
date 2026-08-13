import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { addDoc } from 'firebase/firestore';
import SignUp from '../views/SignUp';
import React from 'react';

// Mock dependencies
const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db, path) => ({ path })),
  query: vi.fn((ref) => ref),
  orderBy: vi.fn(),
  limit: vi.fn(),
  onSnapshot: vi.fn((ref, callback) => {
    callback({ docs: [], size: 0 });
    return vi.fn();
  }),
  getDocs: vi.fn(() => Promise.resolve({
    empty: false,
    docs: [{ data: () => ({ label: 'Lead' }) }],
  })),
  addDoc: vi.fn(() => Promise.resolve({ id: 'new-doc-id' })),
  doc: vi.fn((_db, path, id) => ({ path, id })),
  serverTimestamp: vi.fn(() => 'mock-timestamp'),
}));

vi.mock('../lib/firebase', () => ({
  db: {},
  handleFirestoreError: vi.fn(),
  OperationType: { CREATE: 'CREATE' },
  logActivity: vi.fn(),
}));

vi.mock('../components/AuthProvider', () => ({
  useAuth: () => ({
    user: { uid: 'ft-123', displayName: 'Staff Tester', email: 'staff@test.com' },
  }),
}));

vi.mock('../lib/seasons', () => ({
  useSeason: () => ({
    autoId: 'summer',
    activeId: 'summer',
    active: { id: 'summer', label: 'Summer', tone: 'amber', blurb: '' },
    isAuto: true,
    clubRush: false,
    label: "Summer '26",
    tags: ["Summer '26"],
    setSeason: vi.fn(),
    resetSeason: vi.fn(),
    toggleClubRush: vi.fn(),
  }),
  getAutoSemesterAndSchoolYearTags: () => ['Summer 2026', '2026-27'],
}));

describe('SignUp View', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders Step 1 with mandatory fields', () => {
    render(<SignUp />);

    expect(screen.getByText('Tell us about you.')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('e.g. Naomi Park')).toBeInTheDocument();
    expect(screen.getByLabelText(/Gender/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Year/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Major/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Cell number/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Email/i)).toBeInTheDocument();
  });

  it('navigates through steps after filling mandatory fields and submits', async () => {
    render(<SignUp />);

    fireEvent.change(screen.getByPlaceholderText('e.g. Naomi Park'), { target: { value: 'Jane Doe' } });
    fireEvent.change(screen.getByLabelText(/Gender/i), { target: { value: 'Female' } });
    fireEvent.change(screen.getByLabelText(/Year/i), { target: { value: 'Freshman' } });
    fireEvent.change(screen.getByLabelText(/Major/i), { target: { value: 'Computer Science' } });
    fireEvent.change(screen.getByPlaceholderText('(___) ___-____'), { target: { value: '123-456-7890' } });
    fireEvent.change(screen.getByPlaceholderText('you@umail.edu'), { target: { value: 'jane@example.com' } });

    const continueButton = screen.getByRole('button', { name: /Continue/i });
    await waitFor(() => expect(continueButton).not.toBeDisabled());
    fireEvent.click(continueButton);

    // Should now be on Step 2
    expect(await screen.findByText('And a little more.')).toBeInTheDocument();
    expect(screen.getByText('Step 2 of 2')).toBeInTheDocument();

    // Select interest (mandatory step 2)
    const firstInterestChip = screen.getByText('Friday gathering');
    fireEvent.click(firstInterestChip);

    const submitBtn = screen.getByRole('button', { name: /Send it/i });
    await waitFor(() => expect(submitBtn).not.toBeDisabled());
    fireEvent.submit(submitBtn.closest('form')!);

    await waitFor(() => expect(addDoc).toHaveBeenCalled());

    await waitFor(() => {
      expect(screen.getByText(/Thanks, Jane\./i)).toBeInTheDocument();
    });

    // Verify contact contains logged in actor and auto tags
    const contactArg = (addDoc as any).mock.calls.find(
      (c: any[]) => c[1] && Array.isArray(c[1].tags),
    )?.[1];
    expect(contactArg?.gender).toBe('Female');
    expect(contactArg?.createdBy).toBe('ft-123');
    expect(contactArg?.createdByName).toBe('Staff Tester');
    expect(contactArg?.tags).toEqual(expect.arrayContaining(['New Sign Up', "Summer '26"]));
  });

  it('covers optional fields, chip toggles, back navigation, reset form, and spiritual background', async () => {
    render(<SignUp />);

    // Fill step 1
    fireEvent.change(screen.getByPlaceholderText('e.g. Naomi Park'), { target: { value: 'Jane Doe' } });
    fireEvent.change(screen.getByLabelText(/Gender/i), { target: { value: 'Female' } });
    fireEvent.change(screen.getByLabelText(/Year/i), { target: { value: 'Freshman' } });
    fireEvent.change(screen.getByLabelText(/Major/i), { target: { value: 'Computer Science' } });
    fireEvent.change(screen.getByPlaceholderText('(___) ___-____'), { target: { value: '123-456-7890' } });
    fireEvent.change(screen.getByPlaceholderText('you@umail.edu'), { target: { value: 'jane@example.com' } });
    fireEvent.change(screen.getByLabelText(/Where are you with faith/i), { target: { value: 'Christian' } });

    fireEvent.click(screen.getByRole('button', { name: /Continue/i }));
    expect(await screen.findByText('And a little more.')).toBeInTheDocument();

    // Toggle how heard chip
    const friendChip = screen.getByText('Friend');
    fireEvent.click(friendChip); // select
    fireEvent.click(friendChip); // deselect

    // Toggle interest chip
    const interestChip = screen.getByText('Friday gathering');
    fireEvent.click(interestChip); // select
    fireEvent.click(interestChip); // deselect
    fireEvent.click(interestChip); // select again

    // Optional textareas
    fireEvent.change(screen.getByPlaceholderText(/Confidentially/i), { target: { value: 'Pray for exams' } });
    fireEvent.change(screen.getByPlaceholderText(/Allergies/i), { target: { value: 'No allergies' } });

    // Test back button
    const backBtn = screen.getByRole('button', { name: 'Back' });
    fireEvent.click(backBtn);
    expect(screen.getByText('Tell us about you.')).toBeInTheDocument();

    // Continue again
    fireEvent.click(screen.getByRole('button', { name: /Continue/i }));
    expect(await screen.findByText('And a little more.')).toBeInTheDocument();

    const submitBtn = screen.getByRole('button', { name: /Send it/i });
    await waitFor(() => expect(submitBtn).not.toBeDisabled());
    fireEvent.submit(submitBtn.closest('form')!);

    expect(await screen.findByText(/Thanks, Jane\./i)).toBeInTheDocument();

    // Add another resets form
    fireEvent.click(screen.getByRole('button', { name: /Add another/i }));
    expect(screen.getByText('Tell us about you.')).toBeInTheDocument();
  });

  it('handles cancel button on step 1 and honeypot check', async () => {
    render(<SignUp />);

    const cancelBtn = screen.getByRole('button', { name: 'Cancel' });
    fireEvent.click(cancelBtn);
    expect(mockNavigate).toHaveBeenCalledWith('/');

    // Fill step 1
    fireEvent.change(screen.getByPlaceholderText('e.g. Naomi Park'), { target: { value: 'Jane Doe' } });
    fireEvent.change(screen.getByLabelText(/Gender/i), { target: { value: 'Female' } });
    fireEvent.change(screen.getByLabelText(/Year/i), { target: { value: 'Freshman' } });
    fireEvent.change(screen.getByLabelText(/Major/i), { target: { value: 'Computer Science' } });
    fireEvent.change(screen.getByPlaceholderText('(___) ___-____'), { target: { value: '123-456-7890' } });
    fireEvent.change(screen.getByPlaceholderText('you@umail.edu'), { target: { value: 'jane@example.com' } });

    fireEvent.click(screen.getByRole('button', { name: /Continue/i }));

    expect(await screen.findByText('And a little more.')).toBeInTheDocument();

    // Select interest so step 2 submit button is enabled
    const firstInterestChip = screen.getByText('Friday gathering');
    fireEvent.click(firstInterestChip);

    // Trigger honeypot
    const botInput = document.getElementById('botField') as HTMLInputElement;
    fireEvent.change(botInput, { target: { value: 'I am a bot' } });

    const submitBtn = screen.getByRole('button', { name: /Send it/i });
    await waitFor(() => expect(submitBtn).not.toBeDisabled());
    fireEvent.submit(submitBtn.closest('form')!);

    expect(await screen.findByText(/Thanks, Jane\./i)).toBeInTheDocument();
    expect(addDoc).not.toHaveBeenCalled();
  });
});





