import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ReleaseSheet } from '../components/release/ReleaseSheet';
import { markReleaseSeen, seenVersion, RELEASES } from '../lib/releases';

vi.mock('../components/AuthProvider', () => ({ useAuth: vi.fn() }));

import { useAuth } from '../components/AuthProvider';

beforeEach(() => {
  localStorage.clear();
  // Re-stamp the fresh-browser seed so each test starts from a clean slate
  // (the module cache keeps `seen` across tests, so localStorage.clear() alone
  // wouldn't reset the gate).
  markReleaseSeen(RELEASES[1].version);
});

describe('ReleaseSheet', () => {
  it('shows nothing when there is no release to show', () => {
    // Mark the newest release seen so the gate stays closed for any role.
    markReleaseSeen(RELEASES[0].version);
    (useAuth as any).mockReturnValue({ role: 'admin' });
    render(<ReleaseSheet />);
    expect(screen.queryByText('A few things are different')).toBeNull();
  });

  it('shows the sheet once for an unseen release and stamps it on dismiss', () => {
    (useAuth as any).mockReturnValue({ role: 'admin' });
    const before = seenVersion();
    expect(before).toBe(RELEASES[1].version);

    render(<ReleaseSheet />);
    expect(screen.getByText('A few things are different')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Carry on'));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(seenVersion()).toBe(RELEASES[0].version);
  });

  it('closes on Escape', () => {
    (useAuth as any).mockReturnValue({ role: 'admin' });
    render(<ReleaseSheet />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});