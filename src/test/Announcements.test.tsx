import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Announcement } from '../../packages/core/src/announcements';
import type { AppUser } from '../../packages/core/src/types';

const h = vi.hoisted(() => ({
  auth: { user: { uid: 'ben' }, role: 'manager' } as any,
  list: [] as any[],
  team: [] as any[],
  markGotIt: vi.fn(),
  postAnnouncement: vi.fn(),
}));

vi.mock('../components/AuthProvider', () => ({ useAuth: () => h.auth }));
vi.mock('../lib/announcements', async () => {
  const actual = await vi.importActual<typeof import('../../packages/core/src/announcements')>(
    '../../packages/core/src/announcements',
  );
  const { useMemo } = await import('react');
  return {
    ...actual,
    markGotIt: h.markGotIt,
    postAnnouncement: h.postAnnouncement,
    useAnnouncements: () => h.list,
    useOpenAnnouncements: (uid: string) => useMemo(() => actual.openAnnouncements(h.list, uid), [uid]),
    useTeamUsers: () => h.team,
  };
});

import AnnouncementCards from '../components/announcements/AnnouncementCards';
import AnnouncementComposer from '../components/announcements/AnnouncementComposer';

const user = (uid: string, over: Partial<AppUser> = {}): AppUser => ({
  uid,
  email: `${uid}@example.com`,
  displayName: uid.toUpperCase(),
  photoURL: '',
  approved: true,
  role: 'manager',
  ...over,
});

const announcement = (over: Partial<Announcement> = {}): Announcement => ({
  id: 'a1',
  body: 'Retreat moves to Saturday',
  authorId: 'ana',
  authorName: 'Ana Admin',
  createdAt: new Date().toISOString(),
  gotIt: {},
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  h.auth = { user: { uid: 'ben' }, role: 'manager' };
  h.list = [];
  h.team = [];
  h.markGotIt.mockResolvedValue(undefined);
  h.postAnnouncement.mockResolvedValue('new1');
});

describe('AnnouncementCards', () => {
  it('draws nothing when there is nothing to acknowledge', () => {
    const { container } = render(<AnnouncementCards />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows a card per open announcement, newest first, naming who posted it', () => {
    h.list = [
      announcement({ id: 'old', body: 'Older news', createdAt: '2026-11-17T10:00:00.000Z' }),
      announcement({ id: 'new', body: 'Newer news', createdAt: '2026-11-18T10:00:00.000Z' }),
    ];
    render(<AnnouncementCards />);
    const cards = screen.getAllByTestId('announcement-card');
    expect(cards.map((c) => c.textContent)).toEqual([
      expect.stringContaining('Newer news'),
      expect.stringContaining('Older news'),
    ]);
    expect(within(cards[0]).getByText('Announcement from Ana Admin')).toBeInTheDocument();
  });

  it('leaves out one this person got and one they posted themselves', () => {
    h.list = [
      announcement({ id: 'got', body: 'Already got', gotIt: { ben: '2026-11-18T10:05:00.000Z' } }),
      announcement({ id: 'mine', body: 'Mine', authorId: 'ben', authorName: 'Ben' }),
      announcement({ id: 'open', body: 'Still open' }),
    ];
    render(<AnnouncementCards />);
    expect(screen.getAllByTestId('announcement-card')).toHaveLength(1);
    expect(screen.getByText('Still open')).toBeInTheDocument();
  });

  it('marks it Got it for the reader when they press the button', async () => {
    h.list = [announcement({ id: 'a1' })];
    render(<AnnouncementCards />);
    fireEvent.click(screen.getByRole('button', { name: 'Got it' }));
    await waitFor(() => expect(h.markGotIt).toHaveBeenCalledWith('a1'));
  });

  it('says so when marking it fails, and keeps the card', async () => {
    h.markGotIt.mockRejectedValue(new Error('denied'));
    h.list = [announcement({ id: 'a1' })];
    render(<AnnouncementCards />);
    fireEvent.click(screen.getByRole('button', { name: 'Got it' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't mark it");
    expect(screen.getByTestId('announcement-card')).toBeInTheDocument();
  });
});

describe('AnnouncementComposer', () => {
  beforeEach(() => {
    h.auth = { user: { uid: 'ana' }, role: 'admin' };
    h.team = [
      user('ana', { role: 'admin', displayName: 'Ana Admin' }),
      user('ben', { displayName: 'Ben Trainee' }),
      user('cal', { displayName: 'Cal Trainee' }),
      user('dee', { displayName: 'Dee Trainee' }),
    ];
  });

  it('is for a Full-timer only: a Trainee gets no box', () => {
    h.auth = { user: { uid: 'ben' }, role: 'manager' };
    const { container } = render(<AnnouncementComposer />);
    expect(container).toBeEmptyDOMElement();
  });

  it('posts what was written and clears the box', async () => {
    render(<AnnouncementComposer />);
    const box = screen.getByLabelText('Post an announcement');
    const post = screen.getByRole('button', { name: 'Post' });
    expect(post).toBeDisabled();
    fireEvent.change(box, { target: { value: 'Retreat moves to Saturday' } });
    expect(post).toBeEnabled();
    fireEvent.click(post);
    await waitFor(() => expect(h.postAnnouncement).toHaveBeenCalledWith('Retreat moves to Saturday'));
    await waitFor(() => expect(box).toHaveValue(''));
  });

  it('caps the box at 2000 characters', () => {
    render(<AnnouncementComposer />);
    expect(screen.getByLabelText('Post an announcement')).toHaveAttribute('maxlength', '2000');
  });

  it('keeps the text and says so when posting fails', async () => {
    h.postAnnouncement.mockRejectedValue(new Error('denied'));
    render(<AnnouncementComposer />);
    const box = screen.getByLabelText('Post an announcement');
    fireEvent.change(box, { target: { value: 'Hello' } });
    fireEvent.click(screen.getByRole('button', { name: 'Post' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't post it");
    expect(box).toHaveValue('Hello');
  });

  it('shows the poster how many got it and names who has not', () => {
    h.list = [announcement({ id: 'm1', authorId: 'ana', gotIt: { ben: '2026-11-18T10:05:00.000Z' } })];
    render(<AnnouncementComposer />);
    const mine = screen.getByTestId('your-announcement');
    expect(within(mine).getByText('1 of 3 got it')).toBeInTheDocument();
    expect(within(mine).getByText('Not yet: Cal Trainee, Dee Trainee')).toBeInTheDocument();
  });

  it('drops the names once everyone got it', () => {
    h.list = [
      announcement({
        id: 'm1',
        authorId: 'ana',
        gotIt: { ben: 't', cal: 't', dee: 't' },
      }),
    ];
    render(<AnnouncementComposer />);
    expect(screen.getByText('3 of 3 got it')).toBeInTheDocument();
    expect(screen.queryByText(/Not yet/)).not.toBeInTheDocument();
  });

  it("does not list someone else's announcement as the poster's own", () => {
    h.list = [announcement({ id: 'x', authorId: 'dee', authorName: 'Dee' })];
    render(<AnnouncementComposer />);
    expect(screen.queryByTestId('your-announcement')).not.toBeInTheDocument();
  });
});
