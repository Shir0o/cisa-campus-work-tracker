import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi } from 'vitest';
import LandingCommunity from '../views/landings/LandingCommunity';
import { onSnapshot } from 'firebase/firestore';
import { getOrCreateDirectChat } from '../services/chat';

vi.mock('../components/AuthProvider', () => ({
  useAuth: () => ({
    user: { uid: 'u-community', displayName: 'Viewer Val' },
    role: 'viewer',
  }),
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db, ...parts) => ({ path: parts.join('/') })),
  query: vi.fn((ref) => ref),
  where: vi.fn(),
  onSnapshot: vi.fn((q, callback) => {
    if (typeof callback === 'function') {
      try {
        const path = q?.path || '';
        if (path.includes('events')) {
          callback({
            docs: [
              {
                id: 'e1',
                data: () => ({
                  name: 'Friday Fellowship',
                  date: new Date(Date.now() + 86400000).toISOString(),
                  location: 'Main Hall',
                  type: 'Gathering',
                }),
              },
            ],
          });
        } else {
          callback({
            docs: [
              {
                id: 'ft1',
                data: () => ({
                  displayName: 'FullTimer Sam',
                  email: 'sam@campus.org',
                  approved: true,
                }),
              },
            ],
          });
        }
      } catch (e) {}
    }
    return () => {};
  }),
}));

vi.mock('../lib/firebase', () => ({
  db: {},
}));

vi.mock('../services/chat', () => ({
  getOrCreateDirectChat: vi.fn().mockResolvedValue('room-1'),
}));

vi.mock('../lib/rsvp', () => ({
  subscribeMyRsvps: vi.fn((_uid, callback) => {
    callback(new Set(['e1']));
    return () => {};
  }),
  setRsvp: vi.fn().mockResolvedValue(true),
}));

describe('LandingCommunity component', () => {
  it('renders community landing with full timers and triggers reach out and rsvp', async () => {
    render(
      <MemoryRouter>
        <LandingCommunity />
      </MemoryRouter>
    );

    expect(await screen.findByText(/and the team are glad you're here/i)).toBeInTheDocument();

    const rsvpBtn = screen.getByRole('button', { name: /Coming|I'll be there/i });
    fireEvent.click(rsvpBtn);
    // Second click covers the add branch of toggle
    fireEvent.click(rsvpBtn);
    // Click Full calendar to cover onLink callback
    const calendarBtn = screen.getByRole('button', { name: /Full calendar/i });
    fireEvent.click(calendarBtn);

    const reachOutBtn = screen.getByRole('button', { name: /Reach out/i });
    fireEvent.click(reachOutBtn);
  });

  it('handles chat fallback when getOrCreateDirectChat fails', async () => {
    vi.mocked(getOrCreateDirectChat).mockRejectedValueOnce(new Error('chat blocked'));
    const originalLocation = window.location;
    delete (window as any).location;
    (window as any).location = { href: '' };

    render(
      <MemoryRouter>
        <LandingCommunity />
      </MemoryRouter>
    );

    const reachOutBtn = screen.getByRole('button', { name: /Reach out/i });
    fireEvent.click(reachOutBtn);

    await waitFor(() => {
      expect(window.location.href).toContain('mailto:sam@campus.org');
    });

    (window as any).location = originalLocation;
  });

  it('handles onSnapshot error callback', () => {
    (onSnapshot as any).mockImplementation((_q: any, _success: any, errorCb: any) => {
      if (typeof errorCb === 'function') errorCb(new Error('firestore fail'));
      return () => {};
    });

    render(
      <MemoryRouter>
        <LandingCommunity />
      </MemoryRouter>
    );
  });
});
