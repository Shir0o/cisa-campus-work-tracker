import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import type { Announcement, AppUser } from '@cisa/core';
import { ThemeProvider } from '../../theme/ThemeProvider';
import { LanguageProvider } from '../../lib/LanguageProvider';
import { AnnouncementsPanel } from './AnnouncementsPanel';
import { useAnnouncements } from '../../lib/useAnnouncements';
import { markGotIt, postAnnouncement } from '../../lib/data/announcements';

jest.mock('../../lib/AuthProvider', () => ({
  useAuth: () => ({ uid: 'ben', user: null, role: 'manager' }),
}));
jest.mock('../../lib/useAnnouncements', () => ({ useAnnouncements: jest.fn() }));
jest.mock('../../lib/data/announcements', () => ({
  markGotIt: jest.fn(),
  postAnnouncement: jest.fn(),
}));

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

const team = [
  user('ana', { role: 'admin', displayName: 'Ana Admin' }),
  user('ben', { displayName: 'Ben Trainee' }),
  user('cal', { displayName: 'Cal Trainee' }),
  user('dee', { displayName: 'Dee Trainee' }),
];

const renderPanel = (props: { uid?: string; isFullTimer: boolean }) =>
  render(
    <ThemeProvider>
      <LanguageProvider>
        <AnnouncementsPanel uid={props.uid ?? 'ben'} name="Ben" isFullTimer={props.isFullTimer} />
      </LanguageProvider>
    </ThemeProvider>,
  );

beforeEach(() => {
  jest.clearAllMocks();
  (useAnnouncements as jest.Mock).mockReturnValue({ open: [], mine: [], team: [] });
  (markGotIt as jest.Mock).mockResolvedValue(undefined);
  (postAnnouncement as jest.Mock).mockResolvedValue('new1');
});

describe('AnnouncementsPanel — a Trainee', () => {
  it('draws nothing when there is nothing to acknowledge', async () => {
    const { toJSON } = await renderPanel({ isFullTimer: false });
    expect(toJSON()).toBeNull();
  });

  it('shows a card per open announcement, naming who posted it', async () => {
    (useAnnouncements as jest.Mock).mockReturnValue({
      open: [announcement({ body: 'Retreat moves to Saturday' }), announcement({ id: 'a2', body: 'Bring a coat' })],
      mine: [],
      team: [],
    });
    const { getByText, getAllByText } = await renderPanel({ isFullTimer: false });
    expect(getByText('Retreat moves to Saturday')).toBeTruthy();
    expect(getByText('Bring a coat')).toBeTruthy();
    expect(getAllByText(/Announcement from Ana Admin/)).toHaveLength(2);
  });

  it('marks it Got it for the reader', async () => {
    (useAnnouncements as jest.Mock).mockReturnValue({ open: [announcement({ id: 'a1' })], mine: [], team: [] });
    const { getByText } = await renderPanel({ isFullTimer: false });
    await fireEvent.press(getByText('Got it'));
    await waitFor(() => expect(markGotIt).toHaveBeenCalledWith('a1', 'ben'));
  });

  it('gets no box to post one', async () => {
    (useAnnouncements as jest.Mock).mockReturnValue({ open: [announcement()], mine: [], team: [] });
    const { queryByText } = await renderPanel({ isFullTimer: false });
    expect(queryByText('Post an announcement')).toBeNull();
  });
});

describe('AnnouncementsPanel — a Full-timer', () => {
  it('posts what was written as themselves and clears the box', async () => {
    const { getByText, getByPlaceholderText } = await renderPanel({ uid: 'ana', isFullTimer: true });
    const box = getByPlaceholderText('Write an announcement');
    await fireEvent.changeText(box, 'Retreat moves to Saturday');
    await fireEvent.press(getByText('Post'));
    await waitFor(() =>
      expect(postAnnouncement).toHaveBeenCalledWith({ uid: 'ana', name: 'Ben' }, 'Retreat moves to Saturday'),
    );
    await waitFor(() => expect(getByPlaceholderText('Write an announcement').props.value).toBe(''));
  });

  it('keeps the text and says so when posting fails', async () => {
    (postAnnouncement as jest.Mock).mockRejectedValue(new Error('denied'));
    const { getByText, getByPlaceholderText } = await renderPanel({ uid: 'ana', isFullTimer: true });
    await fireEvent.changeText(getByPlaceholderText('Write an announcement'), 'Hello');
    await fireEvent.press(getByText('Post'));
    await waitFor(() => expect(getByText("Couldn't post it. Try again.")).toBeTruthy());
    expect(getByPlaceholderText('Write an announcement').props.value).toBe('Hello');
  });

  it('cuts the box off at 2000 characters', async () => {
    const { getByPlaceholderText } = await renderPanel({ uid: 'ana', isFullTimer: true });
    await fireEvent.changeText(getByPlaceholderText('Write an announcement'), 'x'.repeat(2500));
    expect(getByPlaceholderText('Write an announcement').props.value).toHaveLength(2000);
  });

  it('shows how many got it and names who has not', async () => {
    (useAnnouncements as jest.Mock).mockReturnValue({
      open: [],
      mine: [announcement({ authorId: 'ana', gotIt: { ben: '2026-11-18T10:05:00.000Z' } })],
      team,
    });
    const { getByText } = await renderPanel({ uid: 'ana', isFullTimer: true });
    expect(getByText('1 of 3 got it')).toBeTruthy();
    expect(getByText('Not yet: Cal Trainee, Dee Trainee')).toBeTruthy();
  });
});
