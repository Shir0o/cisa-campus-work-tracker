import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import OwnerViewBanner from '../components/layout/OwnerViewBanner';
import { useAuth } from '../components/AuthProvider';

vi.mock('../components/AuthProvider', () => ({
  useAuth: vi.fn(),
}));

describe('OwnerViewBanner', () => {
  const mockSetOwnerViewRole = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when user is not app owner', () => {
    (useAuth as any).mockReturnValue({
      isOwner: false,
      ownerViewRole: null,
      setOwnerViewRole: mockSetOwnerViewRole,
    });

    const { container } = render(<OwnerViewBanner />);
    expect(container.firstChild).toBeNull();
  });

  it('renders banner when user is allowed to simulate roles in normal mode', () => {
    (useAuth as any).mockReturnValue({
      isOwner: true,
      ownerViewRole: null,
      setOwnerViewRole: mockSetOwnerViewRole,
    });

    render(<OwnerViewBanner />);
    expect(screen.getByText(/Full-timer View Mode/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /See their view…/i })).toBeInTheDocument();
  });

  it('renders active preview banner and allows switching role view', () => {
    (useAuth as any).mockReturnValue({
      isOwner: true,
      ownerViewRole: 'operator',
      setOwnerViewRole: mockSetOwnerViewRole,
    });

    render(<OwnerViewBanner />);
    expect(screen.getByText(/You are seeing CISA as/i)).toBeInTheDocument();
    expect(screen.getByText('Student')).toBeInTheDocument();

    // Open dropdown
    const toggleBtn = screen.getByRole('button', { name: /View: Student/i });
    fireEvent.click(toggleBtn);

    // Click Student to toggle or Trainee to switch
    const traineeBtn = screen.getByRole('button', { name: /Trainee/i });
    fireEvent.click(traineeBtn);
    expect(mockSetOwnerViewRole).toHaveBeenCalledWith('manager');
  });

  it('resets owner view role when Reset button is clicked', () => {
    (useAuth as any).mockReturnValue({
      isOwner: true,
      ownerViewRole: 'viewer',
      setOwnerViewRole: mockSetOwnerViewRole,
    });

    render(<OwnerViewBanner />);
    const resetBtn = screen.getByRole('button', { name: /Reset to Full-timer/i });
    fireEvent.click(resetBtn);
    expect(mockSetOwnerViewRole).toHaveBeenCalledWith(null);
  });
});
