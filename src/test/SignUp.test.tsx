import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { addDoc } from 'firebase/firestore';
import SignUp, { INTERESTS, YEARS, GENDERS, SPIRITUAL_BACKGROUNDS, MAJORS } from '../views/SignUp';
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

describe('SignUp View Constants', () => {
  it('includes Home fellowship and Bible study in INTERESTS, and excludes removed options', () => {
    expect(INTERESTS).toContain('Home fellowship');
    expect(INTERESTS).toContain('Bible study');
    expect(INTERESTS).not.toContain('Friday gathering');
    expect(INTERESTS).not.toContain('Small group');
    expect(INTERESTS).not.toContain('Worship team');
  });

  it('includes Other in YEARS', () => {
    expect(YEARS).toContain('Other');
  });

  it('provides GENDERS options', () => {
    expect(GENDERS).toEqual(['Male', 'Female', 'Other']);
  });

  it('provides SPIRITUAL_BACKGROUNDS options', () => {
    expect(SPIRITUAL_BACKGROUNDS.length).toBeGreaterThanOrEqual(5);
  });
});

describe('SignUp View', () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('renders single-step form with all primary inputs and chips', () => {
    render(<SignUp />);

    expect(screen.getByText('Tell us about you.')).toBeInTheDocument();
    expect(screen.getByText('Just the basics. Fields marked with * are required.')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('e.g. Naomi Park')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('(___) ___-____')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('you@umail.edu')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Male' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Freshman' })).toBeInTheDocument();
    expect(screen.getByLabelText(/Major/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Home fellowship' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Bible study' })).toBeInTheDocument();
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

  it('fills all fields and submits successfully in one step', async () => {
    render(<SignUp />);

    // Name
    fireEvent.change(screen.getByPlaceholderText('e.g. Naomi Park'), {
      target: { value: 'Jane Doe' },
    });

    // Gender chip
    fireEvent.click(screen.getByRole('button', { name: 'Female' }));

    // Year chip
    fireEvent.click(screen.getByRole('button', { name: 'Freshman' }));

    // Major select
    fireEvent.change(screen.getByLabelText(/Major/i), {
      target: { value: 'Computer Science' },
    });

    // Phone & Email
    fireEvent.change(screen.getByPlaceholderText('(___) ___-____'), {
      target: { value: '123-456-7890' },
    });
    fireEvent.change(screen.getByPlaceholderText('you@umail.edu'), {
      target: { value: 'jane@example.com' },
    });

    // Faith background chip
    fireEvent.click(screen.getByRole('button', { name: 'Exploring faith' }));

    // Interests chips (including Home fellowship and Bible study)
    fireEvent.click(screen.getByRole('button', { name: 'Home fellowship' }));
    fireEvent.click(screen.getByRole('button', { name: 'Bible study' }));

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
    expect(submitBtn).not.toBeDisabled();
    fireEvent.click(submitBtn);

    await waitFor(() => expect(addDoc).toHaveBeenCalled());

    // Confirmation Screen
    expect(await screen.findByText(/Thanks, Jane\./i)).toBeInTheDocument();
    expect(
      screen.getByText(/We got it — you're part of our Summer '26 cohort now\./i),
    ).toBeInTheDocument();

    // Verify submitted document payload
    const contactArg = (addDoc as any).mock.calls.find(
      (c: any[]) => c[1] && Array.isArray(c[1].tags),
    )?.[1];
    expect(contactArg?.name).toBe('Jane Doe');
    expect(contactArg?.gender).toBe('Female');
    expect(contactArg?.year).toBe('Freshman');
    expect(contactArg?.major).toBe('Computer Science');
    expect(contactArg?.phone).toBe('123-456-7890');
    expect(contactArg?.email).toBe('jane@example.com');
    expect(contactArg?.spiritualBackground).toBe('Exploring');
    expect(contactArg?.interests).toEqual(['Home fellowship', 'Bible study']);
    expect(contactArg?.prayerRequest).toBe('Pray for exams');
    expect(contactArg?.notes).toBe('No allergies');
    expect(contactArg?.createdBy).toBe('ft-123');
    expect(contactArg?.createdByName).toBe('Staff Tester');
    expect(contactArg?.tags).toEqual(
      expect.arrayContaining(['New Sign Up', 'Summer 2026']),
    );
  });

  it('validates required fields on submission attempt if button is clicked', async () => {
    render(<SignUp />);

    const submitBtn = screen.getByRole('button', { name: /Send it/i });
    expect(submitBtn).toBeDisabled();

    // Fill name only
    fireEvent.change(screen.getByPlaceholderText('e.g. Naomi Park'), {
      target: { value: 'Incomplete User' },
    });
    expect(submitBtn).toBeDisabled();
  });

  it('supports reset form via "Add another"', async () => {
    render(<SignUp />);

    fireEvent.change(screen.getByPlaceholderText('e.g. Naomi Park'), {
      target: { value: 'Alex Smith' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Male' }));
    fireEvent.click(screen.getByRole('button', { name: 'Junior' }));
    fireEvent.change(screen.getByLabelText(/Major/i), {
      target: { value: 'Biology' },
    });
    fireEvent.change(screen.getByPlaceholderText('(___) ___-____'), {
      target: { value: '555-1234' },
    });
    fireEvent.change(screen.getByPlaceholderText('you@umail.edu'), {
      target: { value: 'alex@umail.edu' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Home fellowship' }));

    fireEvent.click(screen.getByRole('button', { name: /Send it/i }));

    expect(await screen.findByText(/Thanks, Alex\./i)).toBeInTheDocument();

    // Click "Add another"
    fireEvent.click(screen.getByRole('button', { name: /Add another/i }));
    expect(screen.getByText('Tell us about you.')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('e.g. Naomi Park')).toHaveValue('');
  });

  it('handles cancel button and triggers onBack or navigate', () => {
    const onBack = vi.fn();
    render(<SignUp onBack={onBack} />);

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onBack).toHaveBeenCalled();
  });

  it('silently ignores honeypot submissions without Firestore write', async () => {
    render(<SignUp />);

    fireEvent.change(screen.getByPlaceholderText('e.g. Naomi Park'), {
      target: { value: 'Bot User' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Female' }));
    fireEvent.click(screen.getByRole('button', { name: 'Senior' }));
    fireEvent.change(screen.getByLabelText(/Major/i), {
      target: { value: 'Music' },
    });
    fireEvent.change(screen.getByPlaceholderText('(___) ___-____'), {
      target: { value: '555-0000' },
    });
    fireEvent.change(screen.getByPlaceholderText('you@umail.edu'), {
      target: { value: 'bot@spam.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Home fellowship' }));

    // Fill botField
    const botInput = document.getElementById('botField') as HTMLInputElement;
    fireEvent.change(botInput, { target: { value: 'I am spam' } });

    fireEvent.click(screen.getByRole('button', { name: /Send it/i }));

    expect(await screen.findByText(/Thanks, Bot\./i)).toBeInTheDocument();
    expect(addDoc).not.toHaveBeenCalled();
  });

  it('renders mobile layout branch without error', () => {
    render(<SignUp isMobile={true} />);
    expect(screen.getByText("Hey — we'd love to know you.")).toBeInTheDocument();
    expect(screen.getByPlaceholderText('e.g. Naomi Park')).toBeInTheDocument();
  });

  it('switches to the mobile layout when the viewport shrinks', () => {
    const originalWidth = window.innerWidth;
    Object.defineProperty(window, 'innerWidth', { value: 600, configurable: true });
    render(<SignUp />);

    fireEvent(window, new Event('resize'));
    expect(screen.getByText("Hey — we'd love to know you.")).toBeInTheDocument();

    Object.defineProperty(window, 'innerWidth', { value: originalWidth, configurable: true });
  });

  it('navigates home when back is pressed without an onBack handler', () => {
    render(<SignUp />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(mockNavigate).toHaveBeenCalledWith('/');
  });

  it('deselects chips when clicked twice', async () => {
    render(<SignUp />);

    // Toggle gender chip on then off
    const maleChip = screen.getByRole('button', { name: 'Male' });
    fireEvent.click(maleChip);
    fireEvent.click(maleChip);

    // Toggle year chip on then off
    const gradChip = screen.getByRole('button', { name: 'Graduate' });
    fireEvent.click(gradChip);
    fireEvent.click(gradChip);

    // Toggle faith background on then off
    const catholicChip = screen.getByRole('button', { name: 'Catholic' });
    fireEvent.click(catholicChip);
    fireEvent.click(catholicChip);

    // Toggle interest chip on then off
    const prayerGroupChip = screen.getByRole('button', { name: 'Prayer group' });
    fireEvent.click(prayerGroupChip);
    fireEvent.click(prayerGroupChip);

    expect(screen.getByRole('button', { name: /Send it/i })).toBeDisabled();
  });

  it('calls onSubmitted for honeypot submissions and keeps them off Firestore', async () => {
    const onSubmitted = vi.fn();
    render(<SignUp onSubmitted={onSubmitted} />);

    fireEvent.change(screen.getByPlaceholderText('e.g. Naomi Park'), {
      target: { value: 'Honey Bot' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Female' }));
    fireEvent.click(screen.getByRole('button', { name: 'Junior' }));
    fireEvent.change(screen.getByLabelText(/Major/i), {
      target: { value: 'Biology' },
    });
    fireEvent.change(screen.getByPlaceholderText('(___) ___-____'), {
      target: { value: '555-4321' },
    });
    fireEvent.change(screen.getByPlaceholderText('you@umail.edu'), {
      target: { value: 'honey@spam.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Home fellowship' }));

    fireEvent.change(document.getElementById('botField') as HTMLInputElement, {
      target: { value: 'spam' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Send it/i }));

    expect(await screen.findByText(/Thanks, Honey\./i)).toBeInTheDocument();
    expect(addDoc).not.toHaveBeenCalled();
    expect(onSubmitted).toHaveBeenCalledWith('Honey Bot');
  });

  it('calls onSubmitted after the confirmation delay on a real submit', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const onSubmitted = vi.fn();
      render(<SignUp onSubmitted={onSubmitted} />);

      fireEvent.change(screen.getByPlaceholderText('e.g. Naomi Park'), {
        target: { value: 'Timed Jane' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Female' }));
      fireEvent.click(screen.getByRole('button', { name: 'Freshman' }));
      fireEvent.change(screen.getByLabelText(/Major/i), {
        target: { value: 'Economics' },
      });
      fireEvent.change(screen.getByPlaceholderText('(___) ___-____'), {
        target: { value: '555-9999' },
      });
      fireEvent.change(screen.getByPlaceholderText('you@umail.edu'), {
        target: { value: 'timed@umail.edu' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Bible study' }));

      fireEvent.click(screen.getByRole('button', { name: /Send it/i }));

      await act(async () => {
        await Promise.resolve();
      });

      expect(screen.getByText(/Thanks, Timed\./i)).toBeInTheDocument();
      expect(onSubmitted).not.toHaveBeenCalled();
      act(() => {
        vi.advanceTimersByTime(1800);
      });
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
    fireEvent.change(screen.getByPlaceholderText('e.g. Naomi Park'), {
      target: { value: 'No Notify' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Male' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sophomore' }));
    fireEvent.change(screen.getByLabelText(/Major/i), {
      target: { value: 'Economics' },
    });
    fireEvent.change(screen.getByPlaceholderText('(___) ___-____'), {
      target: { value: '555-8888' },
    });
    fireEvent.change(screen.getByPlaceholderText('you@umail.edu'), {
      target: { value: 'nonotify@umail.edu' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Outreach' }));

    fireEvent.click(screen.getByRole('button', { name: /Send it/i }));

    expect(await screen.findByText(/Thanks, No\./i)).toBeInTheDocument();
    expect(consoleSpy).toHaveBeenCalledWith('Failed to broadcast admin notification:', expect.any(Error));
    consoleSpy.mockRestore();
  });

  it('reports contact creation failures through handleFirestoreError', async () => {
    const { handleFirestoreError } = await import('../lib/firebase');
    (addDoc as any).mockRejectedValueOnce(new Error('write blocked'));

    render(<SignUp />);
    fireEvent.change(screen.getByPlaceholderText('e.g. Naomi Park'), {
      target: { value: 'Failing Fred' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Male' }));
    fireEvent.click(screen.getByRole('button', { name: 'Junior' }));
    fireEvent.change(screen.getByLabelText(/Major/i), {
      target: { value: 'Math' },
    });
    fireEvent.change(screen.getByPlaceholderText('(___) ___-____'), {
      target: { value: '555-7777' },
    });
    fireEvent.change(screen.getByPlaceholderText('you@umail.edu'), {
      target: { value: 'fred@umail.edu' },
    });
    fireEvent.click(screen.getByRole('button', { name: '1:1 mentorship' }));

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
