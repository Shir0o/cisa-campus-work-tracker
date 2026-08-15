import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
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
  getDocs: vi.fn(() =>
    Promise.resolve({
      empty: false,
      docs: [{ data: () => ({ label: 'Lead' }) }],
    }),
  ),
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
    role: 'admin',
  }),
}));

const mockSetSeason = vi.fn();
const mockResetSeason = vi.fn();
const mockToggleClubRush = vi.fn();

const seasonState = vi.hoisted(() => ({ isAuto: true, clubRush: false }));

vi.mock('../lib/seasons', () => ({
  SEASON_ORDER: ['spring', 'summer', 'fall', 'winter'],
  SEASONS: {
    spring: { id: 'spring', label: 'Spring', tone: 'sage', blurb: '' },
    summer: { id: 'summer', label: 'Summer', tone: 'amber', blurb: '' },
    fall: { id: 'fall', label: 'Fall', tone: 'accent', blurb: '' },
    winter: { id: 'winter', label: 'Winter', tone: 'teal', blurb: '' },
  },
  seasonYear: () => '26',
  useSeason: () => ({
    autoId: 'summer',
    activeId: 'summer',
    active: { id: 'summer', label: 'Summer', tone: 'amber', blurb: '' },
    isAuto: seasonState.isAuto,
    clubRush: seasonState.clubRush,
    label: "Summer '26",
    tags: ["Summer '26"],
    setSeason: mockSetSeason,
    resetSeason: mockResetSeason,
    toggleClubRush: mockToggleClubRush,
  }),
  getAutoSemesterAndSchoolYearTags: () => ['Summer 2026', '2026-27'],
}));

describe('SignUp View', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders Step 1 with primary inputs and progressive disclosure toggle', () => {
    render(<SignUp />);

    expect(screen.getByText('Tell us about you.')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('First name is plenty')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('(___) ___-____')).toBeInTheDocument();
    expect(screen.getByText("That's all we need. The rest is up to you.")).toBeInTheDocument();
    expect(screen.getByText('Tell us a bit more')).toBeInTheDocument();
  });

  it('renders staff preview strip when viewed by staff', () => {
    render(<SignUp role="admin" />);
    expect(
      screen.getByText(
        "You're previewing the sign-up form — how someone new asks to hear from us. It isn't an app account.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/Tagging sign-ups for/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Club rush/i })).toBeInTheDocument();
  });

  it('hides staff preview strip for student or community roles', () => {
    render(<SignUp role="student" />);
    expect(
      screen.queryByText(
        "You're previewing the sign-up form — how someone new asks to hear from us. It isn't an app account.",
      ),
    ).not.toBeInTheDocument();
  });

  it('navigates through steps, fills details in disclosure, and submits successfully', async () => {
    render(<SignUp />);

    // Step 1: name + phone
    fireEvent.change(screen.getByPlaceholderText('First name is plenty'), {
      target: { value: 'Jane Doe' },
    });
    fireEvent.change(screen.getByPlaceholderText('(___) ___-____'), {
      target: { value: '123-456-7890' },
    });

    // Open progressive disclosure
    fireEvent.click(screen.getByText('Tell us a bit more'));
    expect(screen.getByText("That's plenty")).toBeInTheDocument();

    // Fill disclosure fields
    fireEvent.change(screen.getByPlaceholderText('she / her'), {
      target: { value: 'she/her' },
    });
    fireEvent.change(screen.getByLabelText(/Year/i), {
      target: { value: 'Freshman' },
    });
    fireEvent.change(screen.getByLabelText(/Major/i), {
      target: { value: 'Computer Science' },
    });
    fireEvent.change(screen.getByPlaceholderText('you@umail.edu'), {
      target: { value: 'jane@example.com' },
    });
    fireEvent.change(screen.getByPlaceholderText('@handle'), {
      target: { value: '@janedoe' },
    });
    fireEvent.change(screen.getByLabelText(/Where do you live\?/i), {
      target: { value: 'Whitman Hall' },
    });

    const continueButton = screen.getByRole('button', { name: /Continue/i });
    expect(continueButton).not.toBeDisabled();
    fireEvent.click(continueButton);

    // Step 2
    expect(await screen.findByText('And a little more.')).toBeInTheDocument();
    expect(screen.getByText('Step 2 of 2')).toBeInTheDocument();

    // Toggle how heard chip
    const friendChip = screen.getByText('Friend');
    fireEvent.click(friendChip);

    // Toggle interest chip
    const gatheringChip = screen.getByText('Friday gathering');
    fireEvent.click(gatheringChip);

    // Optional textareas
    fireEvent.change(
      screen.getByPlaceholderText(/Totally optional. We hold these confidentially./i),
      { target: { value: 'Pray for exams' } },
    );
    fireEvent.change(
      screen.getByPlaceholderText(/Allergies, schedule conflicts, questions…/i),
      { target: { value: 'No allergies' } },
    );

    // Submit
    const submitBtn = screen.getByRole('button', { name: /Send it/i });
    fireEvent.click(submitBtn);

    await waitFor(() => expect(addDoc).toHaveBeenCalled());

    // Step 3 (Confirmation)
    expect(await screen.findByText(/Thanks, Jane\./i)).toBeInTheDocument();
    expect(
      screen.getByText(/We got it — you're part of our Summer '26 cohort now\./i),
    ).toBeInTheDocument();

    // Verify submitted document payload
    const contactArg = (addDoc as any).mock.calls.find(
      (c: any[]) => c[1] && Array.isArray(c[1].tags),
    )?.[1];
    expect(contactArg?.name).toBe('Jane Doe');
    expect(contactArg?.year).toBe('Freshman');
    expect(contactArg?.major).toBe('Computer Science');
    expect(contactArg?.pronouns).toBe('she/her');
    expect(contactArg?.hall).toBe('Whitman Hall');
    expect(contactArg?.phone).toBe('123-456-7890');
    expect(contactArg?.email).toBe('jane@example.com');
    expect(contactArg?.instagram).toBe('@janedoe');
    expect(contactArg?.createdBy).toBe('ft-123');
    expect(contactArg?.createdByName).toBe('Staff Tester');
    expect(contactArg?.tags).toEqual(
      expect.arrayContaining(['New Sign Up', "Summer '26"]),
    );
  });

  it('supports back navigation and reset form via "Add another"', async () => {
    render(<SignUp />);

    fireEvent.change(screen.getByPlaceholderText('First name is plenty'), {
      target: { value: 'Alex Smith' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Continue/i }));

    expect(await screen.findByText('And a little more.')).toBeInTheDocument();

    // Test back button
    fireEvent.click(screen.getByRole('button', { name: '← Back' }));
    expect(screen.getByText('Tell us about you.')).toBeInTheDocument();

    // Continue again and submit
    fireEvent.click(screen.getByRole('button', { name: /Continue/i }));
    expect(await screen.findByText('And a little more.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Send it/i }));

    expect(await screen.findByText(/Thanks, Alex\./i)).toBeInTheDocument();

    // Click "Add another"
    fireEvent.click(screen.getByRole('button', { name: /Add another/i }));
    expect(screen.getByText('Tell us about you.')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('First name is plenty')).toHaveValue('');
  });

  it('handles cancel button and triggers onBack or navigate', () => {
    const onBack = vi.fn();
    render(<SignUp onBack={onBack} />);

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onBack).toHaveBeenCalled();
  });

  it('silently ignores honeypot submissions without Firestore write', async () => {
    render(<SignUp />);

    fireEvent.change(screen.getByPlaceholderText('First name is plenty'), {
      target: { value: 'Bot User' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Continue/i }));

    expect(await screen.findByText('And a little more.')).toBeInTheDocument();

    // Fill botField
    const botInput = document.getElementById('botField') as HTMLInputElement;
    fireEvent.change(botInput, { target: { value: 'I am spam' } });

    fireEvent.click(screen.getByRole('button', { name: /Send it/i }));

    expect(await screen.findByText(/Thanks, Bot\./i)).toBeInTheDocument();
    expect(addDoc).not.toHaveBeenCalled();
  });

  it('renders mobile layout branch without error', () => {
    render(<SignUp isMobile={true} />);
    expect(screen.getByText('Hey — we\'d love to know you.')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('First name is plenty')).toBeInTheDocument();
  });

  it('switches to the mobile layout when the viewport shrinks', () => {
    const originalWidth = window.innerWidth;
    Object.defineProperty(window, 'innerWidth', { value: 600, configurable: true });
    render(<SignUp />);

    fireEvent(window, new Event('resize'));
    expect(screen.getByText('Hey — we\'d love to know you.')).toBeInTheDocument();

    Object.defineProperty(window, 'innerWidth', { value: originalWidth, configurable: true });
  });

  it('navigates home when back is pressed without an onBack handler', () => {
    render(<SignUp />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(mockNavigate).toHaveBeenCalledWith('/');
  });

  it('deselects an interest chip when clicked twice', async () => {
    render(<SignUp />);

    fireEvent.change(screen.getByPlaceholderText('First name is plenty'), {
      target: { value: 'Chip Tester' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Continue/i }));
    expect(await screen.findByText('And a little more.')).toBeInTheDocument();

    const chip = screen.getByRole('button', { name: /^Friday gathering$/ });
    fireEvent.click(chip);
    fireEvent.click(chip);

    fireEvent.click(screen.getByRole('button', { name: /Send it/i }));
    await waitFor(() => expect(addDoc).toHaveBeenCalled());

    const contactArg = (addDoc as any).mock.calls.find(
      (c: any[]) => c[1] && Array.isArray(c[1].interests),
    )?.[1];
    expect(contactArg?.interests).toEqual([]);
  });

  it('calls onSubmitted for honeypot submissions and keeps them off Firestore', async () => {
    const onSubmitted = vi.fn();
    render(<SignUp onSubmitted={onSubmitted} />);

    fireEvent.change(screen.getByPlaceholderText('First name is plenty'), {
      target: { value: 'Honey Bot' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Continue/i }));
    expect(await screen.findByText('And a little more.')).toBeInTheDocument();

    fireEvent.change(document.getElementById('botField') as HTMLInputElement, {
      target: { value: 'spam' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Send it/i }));

    expect(await screen.findByText(/Thanks, Honey\./i)).toBeInTheDocument();
    expect(addDoc).not.toHaveBeenCalled();
    expect(onSubmitted).toHaveBeenCalledWith('Honey Bot');
  });

  it('calls onSubmitted after the confirmation delay on a real submit', async () => {
    vi.useFakeTimers();
    try {
      const onSubmitted = vi.fn();
      render(<SignUp onSubmitted={onSubmitted} />);

      fireEvent.change(screen.getByPlaceholderText('First name is plenty'), {
        target: { value: 'Timed Jane' },
      });
      fireEvent.click(screen.getByRole('button', { name: /Continue/i }));
      fireEvent.click(screen.getByRole('button', { name: /Send it/i }));

      await act(async () => {});
      expect(screen.getByText(/Thanks, Timed\./i)).toBeInTheDocument();
      expect(onSubmitted).not.toHaveBeenCalled();
      act(() => vi.advanceTimersByTime(1800));
      expect(onSubmitted).toHaveBeenCalledWith('Timed Jane');
    } finally {
      vi.useRealTimers();
    }
  });

  it('continues to the confirmation screen when the admin broadcast fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    (addDoc as any)
      .mockResolvedValueOnce({ id: 'contact-id' })
      .mockRejectedValueOnce(new Error('notify down'));

    render(<SignUp />);
    fireEvent.change(screen.getByPlaceholderText('First name is plenty'), {
      target: { value: 'No Notify' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Continue/i }));
    fireEvent.click(screen.getByRole('button', { name: /Send it/i }));

    expect(await screen.findByText(/Thanks, No\./i)).toBeInTheDocument();
    expect(consoleSpy).toHaveBeenCalledWith('Failed to broadcast admin notification:', expect.any(Error));
    consoleSpy.mockRestore();
  });

  it('reports contact creation failures through handleFirestoreError', async () => {
    const { handleFirestoreError } = await import('../lib/firebase');
    (addDoc as any).mockRejectedValueOnce(new Error('write blocked'));

    render(<SignUp />);
    fireEvent.change(screen.getByPlaceholderText('First name is plenty'), {
      target: { value: 'Failing Fred' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Continue/i }));
    fireEvent.click(screen.getByRole('button', { name: /Send it/i }));

    await waitFor(() => expect(handleFirestoreError).toHaveBeenCalled());
    expect(handleFirestoreError).toHaveBeenCalledWith(
      expect.any(Error),
      'CREATE',
      'contacts',
    );
  });

  it('lets staff override the season, reset it, and toggle club rush', () => {
    const { container } = render(<SignUp role="admin" />);

    const seasonSelect = container.querySelector('.su-admin-sel')!;
    fireEvent.change(seasonSelect, { target: { value: 'fall' } });
    expect(mockSetSeason).toHaveBeenCalledWith('fall');

    fireEvent.click(screen.getByRole('button', { name: /Club rush/i }));
    expect(mockToggleClubRush).toHaveBeenCalled();
  });

  it('shows the season reset button and the club-rush strip when those modes are active', () => {
    seasonState.isAuto = false;
    seasonState.clubRush = true;

    const { container } = render(<SignUp role="admin" />);

    fireEvent.click(screen.getByRole('button', { name: /reset/i }));
    expect(mockResetSeason).toHaveBeenCalled();

    expect(screen.getByText(/intake · club rush/i)).toBeInTheDocument();
    expect(container.querySelector('.su-admin-toggle.on')).toBeTruthy();

    seasonState.isAuto = true;
    seasonState.clubRush = false;
  });
});
