import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { addDoc, getDocs } from 'firebase/firestore';
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

describe('SignUp View', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders Step 1 with basic fields', () => {
    render(<SignUp />);

    expect(screen.getByText('Tell us about you.')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('e.g. Naomi Park')).toBeInTheDocument();
  });

  it('navigates through steps and validates input', async () => {
    render(<SignUp />);

    const nameInput = screen.getByPlaceholderText('e.g. Naomi Park');
    fireEvent.change(nameInput, { target: { value: 'Jane Doe' } });
    fireEvent.change(screen.getByPlaceholderText('you@umail.edu'), { target: { value: 'jane@example.com' } });
    fireEvent.change(screen.getByPlaceholderText('(___) ___-____'), { target: { value: '123-456-7890' } });
    const spiritualSelect = screen.getByText('Where are you with faith right now?').nextElementSibling?.querySelector('select') as HTMLSelectElement;
    fireEvent.change(spiritualSelect, { target: { value: 'None' } });

    const continueButton = screen.getByRole('button', { name: /Continue/i });
    fireEvent.click(continueButton);

    // Should now be on Step 2
    expect(await screen.findByText('And a little more.')).toBeInTheDocument();

    // Verify step number matches step 2
    expect(screen.getByText('Step 2 of 2')).toBeInTheDocument();
  });

  it('shows error on invalid math answer, submits correctly on valid answer', async () => {
    render(<SignUp />);

    // Step 1
    fireEvent.change(screen.getByPlaceholderText('e.g. Naomi Park'), { target: { value: 'Jane Doe' } });
    fireEvent.change(screen.getByPlaceholderText('you@umail.edu'), { target: { value: 'jane@example.com' } });
    fireEvent.change(screen.getByPlaceholderText('(___) ___-____'), { target: { value: '123-456-7890' } });
    const spiritualSelect = screen.getByText('Where are you with faith right now?').nextElementSibling?.querySelector('select') as HTMLSelectElement;
    fireEvent.change(spiritualSelect, { target: { value: 'None' } });

    fireEvent.click(screen.getByRole('button', { name: /Continue/i }));

    expect(await screen.findByText('And a little more.')).toBeInTheDocument();

    // Find the math question to answer
    const mathLabelElement = screen.getByText(/Quick check/i);
    const mathLabelText = mathLabelElement.textContent || '';
    const match = mathLabelText.match(/(\d+)\s*\+\s*(\d+)/);
    expect(match).not.toBeNull();

    const a = parseInt(match![1], 10);
    const b = parseInt(match![2], 10);
    const wrongSum = a + b + 1;
    const correctSum = a + b;

    const mathInput = screen.getByPlaceholderText('Your answer');

    // Submit with wrong answer
    fireEvent.change(mathInput, { target: { value: wrongSum.toString() } });
    const submitBtn = screen.getByRole('button', { name: /Send it/i });
    fireEvent.click(submitBtn);

    expect(await screen.findByText(/didn't quite add up/i)).toBeInTheDocument();

    // Submit with correct answer
    fireEvent.change(mathInput, { target: { value: correctSum.toString() } });
    fireEvent.click(submitBtn);

    // Step 3 success page
    expect(await screen.findByText(/Thanks, Jane\./i)).toBeInTheDocument();
    expect(addDoc).toHaveBeenCalled();
  });

  it('covers optional inputs, back navigation, honeypot, and success page actions', async () => {
    render(<SignUp />);

    // Cancel on step 1 goes back to '/'
    const cancelBtn = screen.getByRole('button', { name: 'Cancel' });
    fireEvent.click(cancelBtn);
    expect(mockNavigate).toHaveBeenCalledWith('/');

    // Fill step 1
    fireEvent.change(screen.getByPlaceholderText('e.g. Naomi Park'), { target: { value: 'Jane Doe' } });
    fireEvent.change(screen.getByPlaceholderText('you@umail.edu'), { target: { value: 'jane@example.com' } });
    fireEvent.change(screen.getByPlaceholderText('(___) ___-____'), { target: { value: '123-456-7890' } });
    
    // Fill optional inputs
    fireEvent.change(screen.getByPlaceholderText('she / her'), { target: { value: 'she/her' } });
    fireEvent.change(screen.getByPlaceholderText('@handle'), { target: { value: '@jane_doe' } });

    const yearSelect = screen.getByText('Year').nextElementSibling?.querySelector('select') as HTMLSelectElement;
    fireEvent.change(yearSelect, { target: { value: 'Freshman' } });

    const majorSelect = screen.getByText('Major').nextElementSibling?.querySelector('select') as HTMLSelectElement;
    fireEvent.change(majorSelect, { target: { value: 'Computer Science' } });

    const hallSelect = screen.getByText('Where do you live?').nextElementSibling?.querySelector('select') as HTMLSelectElement;
    fireEvent.change(hallSelect, { target: { value: 'Whitman Hall' } });

    const spiritualSelect = screen.getByText('Where are you with faith right now?').nextElementSibling?.querySelector('select') as HTMLSelectElement;
    fireEvent.change(spiritualSelect, { target: { value: 'None' } });

    fireEvent.click(screen.getByRole('button', { name: /Continue/i }));

    expect(await screen.findByText('And a little more.')).toBeInTheDocument();

    // Toggle some interests
    const firstInterestChip = screen.getByText('Friday gathering');
    fireEvent.click(firstInterestChip); // select
    fireEvent.click(firstInterestChip); // deselect
    fireEvent.click(firstInterestChip); // select again

    // Fill optional textareas
    fireEvent.change(screen.getByPlaceholderText(/Confidentially/i), { target: { value: 'Please pray for my exams.' } });
    fireEvent.change(screen.getByPlaceholderText(/Allergies/i), { target: { value: 'No allergies.' } });

    // Test back button
    const backBtn = screen.getByRole('button', { name: 'Back' });
    fireEvent.click(backBtn);
    expect(screen.getByText('Tell us about you.')).toBeInTheDocument();

    // Continue to step 2 again
    fireEvent.click(screen.getByRole('button', { name: /Continue/i }));
    expect(await screen.findByText('And a little more.')).toBeInTheDocument();

    // Trigger honeypot
    const botInput = document.getElementById('botField') as HTMLInputElement;
    fireEvent.change(botInput, { target: { value: 'I am a bot' } });

    // Submit (with correct math, though honeypot bypasses it anyway)
    const submitBtn = screen.getByRole('button', { name: /Send it/i });
    fireEvent.click(submitBtn);

    // It should go straight to step 3 success state without database writes
    expect(await screen.findByText(/Thanks, Jane\./i)).toBeInTheDocument();
    expect(addDoc).not.toHaveBeenCalled();

    // Click "Add another" to reset
    fireEvent.click(screen.getByRole('button', { name: /Add another/i }));
    expect(screen.getByText('Tell us about you.')).toBeInTheDocument();

    // Go to step 3 again via normal path
    fireEvent.change(screen.getByPlaceholderText('e.g. Naomi Park'), { target: { value: 'Jane Doe' } });
    fireEvent.change(screen.getByPlaceholderText('you@umail.edu'), { target: { value: 'jane@example.com' } });
    fireEvent.change(screen.getByPlaceholderText('(___) ___-____'), { target: { value: '123-456-7890' } });
    const spiritualSelect2 = screen.getByText('Where are you with faith right now?').nextElementSibling?.querySelector('select') as HTMLSelectElement;
    fireEvent.change(spiritualSelect2, { target: { value: 'None' } });
    fireEvent.click(screen.getByRole('button', { name: /Continue/i }));

    const mathLabelElement = screen.getByText(/Quick check/i);
    const mathLabelText = mathLabelElement.textContent || '';
    const match = mathLabelText.match(/(\d+)\s*\+\s*(\d+)/);
    const correctSum = parseInt(match![1], 10) + parseInt(match![2], 10);
    fireEvent.change(screen.getByPlaceholderText('Your answer'), { target: { value: correctSum.toString() } });
    fireEvent.click(screen.getByRole('button', { name: /Send it/i }));

    expect(await screen.findByText(/Thanks, Jane\./i)).toBeInTheDocument();

    // Click "Back to app"
    fireEvent.click(screen.getByRole('button', { name: 'Back to app' }));
    expect(mockNavigate).toHaveBeenCalledWith('/');
  });
});
