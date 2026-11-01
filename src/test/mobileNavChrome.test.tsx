/**
 * Mobile nav shell at phone width (#1775).
 *
 * The critique at 375×812 found the bottom bar's selected destination was a
 * 6%-opacity wash on a bar of the same tone (1.09:1) with the label in the
 * same ink as every other item — the Inversion Rule in DESIGN.md, written
 * exactly to stop that. These are the assertions that would have gone red.
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import MobileNav from '../components/layout/MobileNav';

let currentUser: { role: string } = { role: 'manager' };
let teamWaiting = 0;
let myReplies = 0;

vi.mock('../components/AuthProvider', () => ({
  useAuth: () => currentUser,
}));

vi.mock('../App', () => {
  const layout = () => ({ setSearchOpen: vi.fn() });
  return { useLayout: layout, useOptionalLayout: layout };
});

// The two counts the bar can carry (#1806). Stubbed here so the assertions are
// about the bar, not about Firestore; the hooks have their own tests.
vi.mock('../hooks/useWaitingAsksCount', () => ({
  useWaitingAsksCount: () => teamWaiting,
}));
vi.mock('../hooks/useMyAskRepliesCount', () => ({
  useMyAskRepliesCount: () => myReplies,
}));

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

// ── Re-tapping the lit destination (#1779) ──────────────────────────────────
//
// A native tab bar returns the current list to the top when you tap the tab you
// are already on; ours re-navigated to the same route and left the list where
// it was. The phone shell's only scroller is the routed `main` pane (#1795), so
// that is the element the re-tap has to move.
describe('MobileNav re-tap (#1779)', () => {
  const scrollTo = vi.fn();

  beforeEach(() => {
    scrollTo.mockClear();
    // jsdom has no layout, so the element scroll is a spy rather than a
    // measurement — the assertion is on the call, not on a rendered offset.
    (HTMLElement.prototype as unknown as { scrollTo: typeof scrollTo }).scrollTo = scrollTo;
  });

  function renderWithScroller(path: string) {
    return render(
      <MemoryRouter initialEntries={[path]}>
        <main data-testid="list" />
        <MobileNav />
      </MemoryRouter>,
    );
  }

  it('returns the current list to the top when the lit destination is tapped', () => {
    renderWithScroller('/');
    fireEvent.click(screen.getByRole('link', { name: 'Home' }));
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
  });

  it('does not move the list when the tap goes to a different destination', () => {
    renderWithScroller('/');
    fireEvent.click(screen.getByRole('link', { name: 'People' }));
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it('scrolls the list on a re-tap of the destination lighting a deeper route', () => {
    renderWithScroller('/people/e2e-contact-lila');
    fireEvent.click(screen.getByRole('link', { name: 'People' }));
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
  });
});

// ── Destinations and the waiting count (#1806, ADR 0049) ─────────────────────
//
// The bar is the only surface a Trainee reaches in one tap, and at 375px it
// held two destinations and a search FAB that duplicated the header's search.
// Messages and Questions took the slot; the FAB's 56px did not have to be
// traded for a destination because it was a duplicate, not a tool.
describe('MobileNav destinations (#1806)', () => {
  beforeEach(() => {
    teamWaiting = 0;
    myReplies = 0;
    currentUser = { role: 'manager' };
  });

  it('gives a trainee four destinations in one tap', () => {
    renderAt('/');
    for (const name of ['Home', 'Messages', 'Questions', 'People']) {
      expect(screen.getByRole('link', { name: new RegExp(name) })).toBeInTheDocument();
    }
  });

  it('keeps every destination at a 44px tap target', () => {
    renderAt('/');
    for (const name of ['Home', 'Messages', 'Questions', 'People']) {
      expect(screen.getByRole('link', { name: new RegExp(name) }).className).toContain('min-h-11');
    }
  });

  it('lights Messages and Questions on the routes underneath them', () => {
    const messages = renderAt('/messages/room-1');
    expect(screen.getByRole('link', { name: /Messages/ })).toHaveAttribute('aria-current', 'page');
    messages.unmount();
    renderAt('/questions');
    expect(screen.getByRole('link', { name: /Questions/ })).toHaveAttribute('aria-current', 'page');
  });

  it('badges a trainee with the replies owed on their own questions', () => {
    myReplies = 3;
    teamWaiting = 9;
    renderAt('/');
    const disc = screen.getByTestId('mobile-nav-waiting');
    expect(disc).toHaveTextContent('3');
    // Not the team's backlog — that is a full-timer's queue, not a trainee's.
    expect(disc).not.toHaveTextContent('9');
  });

  it('badges a full-timer with the team backlog the rail and top bar show', () => {
    currentUser = { role: 'admin' };
    teamWaiting = 2;
    myReplies = 7;
    renderAt('/');
    expect(screen.getByTestId('mobile-nav-waiting')).toHaveTextContent('2');
  });

  it('draws no badge when nothing is waiting', () => {
    renderAt('/');
    expect(screen.queryByTestId('mobile-nav-waiting')).not.toBeInTheDocument();
  });

  it('announces the count after the destination, like a native tab bar', () => {
    myReplies = 3;
    renderAt('/');
    expect(screen.getByRole('link', { name: 'Questions, 3 waiting' })).toBeInTheDocument();
  });

  it('never badges a role that cannot open Questions', () => {
    currentUser = { role: 'operator' };
    myReplies = 4;
    renderAt('/');
    expect(screen.queryByRole('link', { name: /Questions/ })).not.toBeInTheDocument();
    expect(screen.queryByTestId('mobile-nav-waiting')).not.toBeInTheDocument();
  });
});
