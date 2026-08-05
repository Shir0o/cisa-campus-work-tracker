import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi } from 'vitest';
import LandingStudent from '../views/landings/LandingStudent';

vi.mock('../components/AuthProvider', () => ({
  useAuth: vi.fn(() => ({
    user: { uid: 'u-student', displayName: 'Student Alex' },
    role: 'operator',
  })),
}));

vi.mock('../lib/firebase', () => ({
  db: {},
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db, ...parts) => ({ path: parts.join('/') })),
  query: vi.fn((ref) => ref),
  where: vi.fn(),
  onSnapshot: vi.fn((_q, callback) => {
    if (typeof callback === 'function') {
      try {
        callback({
          docs: [
            {
              id: 'e1',
              data: () => ({
                name: 'Friday Fellowship',
                date: new Date(Date.now() + 86400000).toISOString(),
                location: 'Main Hall',
                type: 'Gathering',
                order: 1,
              }),
            },
            {
              id: 'e2',
              data: () => ({
                name: 'Saturday Study',
                date: new Date(Date.now() + 86400000).toISOString(),
                location: 'Room B',
                type: 'Study',
                order: 2,
              }),
            },
          ],
        });
      } catch (e) {}
    }
    return () => {};
  }),
}));

vi.mock('../lib/personalPrayers', () => ({
  subscribePersonalPrayers: vi.fn((_uid, callback) => {
    callback([
      { id: 'p1', title: 'Pray for semester', status: 'open', date: new Date().toISOString() },
    ]);
    return () => {};
  }),
  addPersonalPrayer: vi.fn().mockResolvedValue(true),
  updatePersonalPrayer: vi.fn().mockResolvedValue(true),
  deletePersonalPrayer: vi.fn().mockResolvedValue(true),
}));

vi.mock('../lib/rsvp', () => ({
  subscribeMyRsvps: vi.fn((_uid, callback) => {
    callback(new Set(['e1']));
    return () => {};
  }),
  setRsvp: vi.fn().mockResolvedValue(true),
}));

describe('LandingStudent component', () => {
  it('renders student landing page with prayers and rsvp', async () => {
    render(
      <MemoryRouter>
        <LandingStudent />
      </MemoryRouter>
    );

    expect(await screen.findByText('Pray for semester')).toBeInTheDocument();

    const rsvpBtns = screen.getAllByRole('button', { name: /Coming|I'll be there/i });
    // First click: toggle OFF (covers delete branch)
    fireEvent.click(rsvpBtns[0]);
    // Second click: toggle ON (covers add branch)
    fireEvent.click(rsvpBtns[0]);
    // Click second event RSVP too
    if (rsvpBtns[1]) fireEvent.click(rsvpBtns[1]);

    const addBtn = screen.getByRole('button', { name: /Add someone/i });
    fireEvent.click(addBtn);

    const input = screen.getByPlaceholderText(/Who's on your heart/i);
    fireEvent.change(input, { target: { value: 'Friend Sam' } });
    fireEvent.keyDown(input, { key: 'Escape' });

    // Open again and press Enter to commit
    const addBtn2 = screen.getByRole('button', { name: /Add someone/i });
    fireEvent.click(addBtn2);
    const input2 = screen.getByPlaceholderText(/Who's on your heart/i);
    fireEvent.change(input2, { target: { value: 'Friend Sam' } });
    fireEvent.keyDown(input2, { key: 'Enter' });

    const ongoingBtn = screen.getAllByRole('button', { name: /^ongoing$/i })[0];
    fireEvent.click(ongoingBtn);

    const calendarBtn = screen.getByRole('button', { name: /Full calendar/i });
    fireEvent.click(calendarBtn);

    // Click the prayer title to exercise the edit/delete flow
    const prayerTitle = screen.getByText('Pray for semester');
    fireEvent.click(prayerTitle);
  });
});
