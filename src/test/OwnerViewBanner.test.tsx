import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import OwnerViewBanner from '../components/layout/OwnerViewBanner';
import { useAuth } from '../components/AuthProvider';

vi.mock('../components/AuthProvider', () => ({
  useAuth: vi.fn(),
}));

describe('OwnerViewBanner', () => {
  const mockSetImpersonateTarget = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when user is not app owner or not impersonating target', () => {
    (useAuth as any).mockReturnValue({
      isOwner: false,
      impersonateTarget: null,
      setImpersonateTarget: mockSetImpersonateTarget,
    });

    const { container } = render(<OwnerViewBanner />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when user is owner but no impersonation target is selected', () => {
    (useAuth as any).mockReturnValue({
      isOwner: true,
      impersonateTarget: null,
      setImpersonateTarget: mockSetImpersonateTarget,
    });

    const { container } = render(<OwnerViewBanner />);
    expect(container.firstChild).toBeNull();
  });

  it('renders active ImpersonateBar when impersonateTarget is set', () => {
    const mockTarget = {
      key: 'staff:cisa-admin',
      name: 'cisa-admin',
      sub: 'Full-timer',
      note: 'Full workspace',
      role: 'admin',
    };

    (useAuth as any).mockReturnValue({
      isOwner: true,
      impersonateTarget: mockTarget,
      setImpersonateTarget: mockSetImpersonateTarget,
    });

    render(<OwnerViewBanner />);
    expect(screen.getByText(/You're seeing CISA as/i)).toBeInTheDocument();
    expect(screen.getByText('cisa-admin')).toBeInTheDocument();

    const exitBtn = screen.getByRole('button', { name: /Back to my view/i });
    fireEvent.click(exitBtn);
    expect(mockSetImpersonateTarget).toHaveBeenCalledWith(null);
  });
});

