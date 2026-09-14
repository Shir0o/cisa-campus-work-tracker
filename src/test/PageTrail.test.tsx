import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import PageTrail from '../components/layout/PageTrail';

const h = vi.hoisted(() => ({
  auth: { role: 'admin' } as any,
  layout: { selectedContact: null } as any,
}));

vi.mock('../components/AuthProvider', () => ({
  useAuth: () => h.auth,
}));

vi.mock('../App', () => ({
  useOptionalLayout: () => h.layout,
}));

const at = (path: string, props: React.ComponentProps<typeof PageTrail> = {}) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <PageTrail {...props} />
    </MemoryRouter>,
  );

/** As `at`, but for a route that records where it was opened from. */
const openedFrom = (path: string, from: string) =>
  render(
    <MemoryRouter initialEntries={[{ pathname: path, state: { from } }]}>
      <PageTrail />
    </MemoryRouter>,
  );

describe('PageTrail (#803)', () => {
  beforeEach(() => {
    h.auth = { role: 'admin' };
    h.layout = { selectedContact: null };
  });

  it('names a destination with no way back', () => {
    at('/directory');
    expect(screen.getByText('People')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('draws the section as a back link and the contact as the leaf', () => {
    h.layout = { selectedContact: { name: 'David Alvarado' } };
    at('/people/abc');

    const back = screen.getByRole('link', { name: /back to people/i });
    expect(back).toHaveAttribute('href', '/directory');
    expect(screen.getByText('People')).toBeInTheDocument();
    expect(screen.getByText('David Alvarado')).toBeInTheDocument();
  });

  it('keeps the way back before the contact has loaded', () => {
    at('/people/abc');
    expect(screen.getByRole('link', { name: /back to people/i })).toHaveAttribute(
      'href',
      '/directory',
    );
    expect(screen.queryByText('David Alvarado')).not.toBeInTheDocument();
  });

  it('renders nothing outside the shell', () => {
    const { container } = at('/nowhere');
    expect(container.firstChild).toBeNull();
  });

  describe('leafOnly — the top-bar shell', () => {
    it('renders nothing on a top-level route, where the active tab already names the place', () => {
      const { container } = at('/directory', { leafOnly: true });
      expect(container.firstChild).toBeNull();
    });

    it('still renders on a route that sits under a destination', () => {
      h.layout = { selectedContact: { name: 'David Alvarado' } };
      at('/people/abc', { leafOnly: true });
      expect(screen.getByText('David Alvarado')).toBeInTheDocument();
    });
  });

  it('does not throw without a layout provider — the strip mounts it directly', () => {
    h.layout = undefined;
    expect(() => at('/people/abc')).not.toThrow();
  });

  it('points back where the reader came from, filters and all (#965)', () => {
    h.layout = { selectedContact: { name: 'Mei Oyelaran' } };
    openedFrom('/people/abc', '/around?team=yp&who=mei&new=1');

    const back = screen.getByRole('link', { name: /back to around the team/i });
    expect(back).toHaveAttribute('href', '/around?team=yp&who=mei&new=1');
    expect(screen.getByText('Around the team')).toBeInTheDocument();
    expect(screen.getByText('Mei Oyelaran')).toBeInTheDocument();
    expect(screen.queryByText('People')).not.toBeInTheDocument();
  });

  it('still says People when the contact was opened from the directory', () => {
    h.layout = { selectedContact: { name: 'Mei Oyelaran' } };
    openedFrom('/people/abc', '/directory');

    expect(screen.getByRole('link', { name: /back to people/i })).toHaveAttribute(
      'href',
      '/directory',
    );
  });
});
