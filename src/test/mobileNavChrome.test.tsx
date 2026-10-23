/**
 * Mobile nav shell at phone width (#1775).
 *
 * The critique at 375×812 found the bottom bar's selected destination was a
 * 6%-opacity wash on a bar of the same tone (1.09:1) with the label in the
 * same ink as every other item — the Inversion Rule in DESIGN.md, written
 * exactly to stop that. These are the assertions that would have gone red.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi } from 'vitest';
import MobileNav from '../components/layout/MobileNav';

let currentUser: { role: string } = { role: 'manager' };

vi.mock('../components/AuthProvider', () => ({
  useAuth: () => currentUser,
}));

vi.mock('../App', () => {
  const layout = () => ({ setSearchOpen: vi.fn() });
  return { useLayout: layout, useOptionalLayout: layout };
});

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <MobileNav />
    </MemoryRouter>,
  );
}

describe('MobileNav selected destination (#1775)', () => {
  it('inverts the selected destination to solid ink instead of a faint tint', () => {
    renderAt('/');
    const home = screen.getByRole('link', { name: 'Home' });
    expect(home).toHaveAttribute('aria-current', 'page');
    const indicator = home.querySelector('[data-testid="mobile-nav-indicator"]');
    expect(indicator).not.toBeNull();
    // Ink inversion: a solid ink fill, not `--secondary-container`'s 6% wash.
    expect(indicator!.className).toContain('bg-primary');
    expect(indicator!.className).not.toContain('bg-secondary-container');
  });

  it('keeps a destination lit on the routes underneath it', () => {
    renderAt('/people/e2e-contact-lila');
    const people = screen.getByRole('link', { name: 'People' });
    expect(people).toHaveAttribute('aria-current', 'page');
  });

  it('uses the destination names the drawer, rail and top bar use', () => {
    renderAt('/');
    expect(screen.getByRole('link', { name: 'People' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Contacts' })).not.toBeInTheDocument();
  });

  it('says "My Day" for a full-timer, like every other shell', () => {
    currentUser = { role: 'admin' };
    renderAt('/');
    expect(screen.getByRole('link', { name: 'My Day' })).toBeInTheDocument();
    currentUser = { role: 'manager' };
  });

  it('insets the bar for the home indicator', () => {
    renderAt('/');
    expect(screen.getByLabelText(/mobile navigation/i).className).toContain('safe-area-inset-bottom');
  });

  it('gives each destination a 44px-tall tap target and a visible focus ring', () => {
    renderAt('/');
    const home = screen.getByRole('link', { name: 'Home' });
    expect(home.className).toContain('min-h-11');
    expect(home.className).toContain('focus-visible:ring');
  });
});
