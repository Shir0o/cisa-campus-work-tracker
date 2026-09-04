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
});
