import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import SignupInvite, { copySignupLink, signupLink } from '../components/layout/SignupInvite';
import React from 'react';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

describe('SignupInvite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders button with correct title and aria-label', () => {
    render(<SignupInvite />);
    const btn = screen.getByRole('button', { name: 'Sign-up form' });
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveAttribute(
      'title',
      'Sign-up form — So someone new can ask to hear from us.',
    );
  });

  it('opens popover dialog on click and closes on Escape key', () => {
    render(<SignupInvite />);
    const btn = screen.getByRole('button', { name: 'Sign-up form' });
    fireEvent.click(btn);

    expect(screen.getByRole('dialog', { name: 'Sign-up form' })).toBeInTheDocument();
    expect(
      screen.getByText("Not a login for this app — it's the short form a new friend fills in so we can stay in touch with them."),
    ).toBeInTheDocument();
    expect(screen.getByText('Open it here')).toBeInTheDocument();
    expect(screen.getByText('Copy the link')).toBeInTheDocument();

    // Close on Escape key
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Sign-up form' })).not.toBeInTheDocument();
  });

  it('closes popover on scrim click', () => {
    const { container } = render(<SignupInvite />);
    const btn = screen.getByRole('button', { name: 'Sign-up form' });
    fireEvent.click(btn);

    expect(screen.getByRole('dialog', { name: 'Sign-up form' })).toBeInTheDocument();
    const scrim = container.querySelector('.sgi-scrim');
    expect(scrim).toBeInTheDocument();
    fireEvent.click(scrim!);

    expect(screen.queryByRole('dialog', { name: 'Sign-up form' })).not.toBeInTheDocument();
  });

  it('navigates to /signup or calls onOpen when "Open it here" is clicked', () => {
    const onOpen = vi.fn();
    const { unmount } = render(<SignupInvite onOpen={onOpen} />);
    fireEvent.click(screen.getByRole('button', { name: 'Sign-up form' }));
    fireEvent.click(screen.getByText('Open it here'));

    expect(onOpen).toHaveBeenCalledWith('signup');
    unmount();

    // Without onOpen prop, navigates via router
    render(<SignupInvite />);
    fireEvent.click(screen.getByRole('button', { name: 'Sign-up form' }));
    fireEvent.click(screen.getByText('Open it here'));
    expect(mockNavigate).toHaveBeenCalledWith('/signup');
  });

  it('copies link to clipboard and calls onToast when "Copy the link" is clicked', async () => {
    const onToast = vi.fn();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: { writeText },
    });

    render(<SignupInvite onToast={onToast} />);
    fireEvent.click(screen.getByRole('button', { name: 'Sign-up form' }));
    fireEvent.click(screen.getByText('Copy the link'));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(expect.stringContaining('/signup'));
      expect(onToast).toHaveBeenCalledWith(
        'Sign-up link copied — text it, or put it on a poster.',
      );
    });
  });

  it('shows local toast fallback when onToast is not provided', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: { writeText },
    });

    render(<SignupInvite />);
    fireEvent.click(screen.getByRole('button', { name: 'Sign-up form' }));
    fireEvent.click(screen.getByText('Copy the link'));

    expect(
      await screen.findByText('Sign-up link copied — text it, or put it on a poster.'),
    ).toBeInTheDocument();
  });

  it('signupLink helper returns origin with /signup', () => {
    const link = signupLink();
    expect(link).toContain('/signup');
  });

  it('copySignupLink writes to clipboard and invokes callback', async () => {
    const onToast = vi.fn();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: { writeText },
    });

    await copySignupLink(onToast);
    expect(writeText).toHaveBeenCalled();
    expect(onToast).toHaveBeenCalledWith(
      'Sign-up link copied — text it, or put it on a poster.',
    );
  });
});
