import { describe, expect, it, jest } from '@jest/globals';
import { render, fireEvent } from '@testing-library/react-native';
import { ThemeProvider } from '../../theme/ThemeProvider';
import { M2WhatsNew } from './M2WhatsNew';
import type { WhatsNewRelease } from '@cisa/core';

jest.mock('../../lib/AuthProvider', () => ({
  useAuth: () => ({ uid: 'user1', user: null, role: 'admin' }),
}));

const mockAnnouncement = jest.fn<() => WhatsNewRelease | null>();
jest.mock('../../lib/releases', () => ({
  latestAnnouncement: () => mockAnnouncement(),
}));

const releaseWithVideo: WhatsNewRelease = {
  id: '2026-09-17-v1.6.0',
  version: '1.6.0',
  title: 'With Video',
  date: '2026-09-17',
  platforms: ['mobile'],
  video_url: 'https://www.youtube.com/watch?v=abc123',
  items: [{ text: 'A change', platforms: ['mobile'] }],
};

describe('M2WhatsNew', () => {
  it('shows the current announcement record and closes on demand', () => {
    mockAnnouncement.mockReturnValue(releaseWithVideo);
    let closed = 0;
    const tree = render(
      <ThemeProvider>
        <M2WhatsNew visible onClose={() => { closed += 1; }} />
      </ThemeProvider>,
    );
    expect(tree.getByTestId('m2-whats-new')).toBeTruthy();
    fireEvent.press(tree.getByText('Got it'));
    expect(closed).toBe(1);
  });

  it('renders nothing when hidden', () => {
    const tree = render(
      <ThemeProvider>
        <M2WhatsNew visible={false} onClose={() => {}} />
      </ThemeProvider>,
    );
    expect(tree.queryByTestId('m2-whats-new')).toBeNull();
  });

  it('renders a video link when the release carries a video_url', () => {
    mockAnnouncement.mockReturnValue(releaseWithVideo);
    const tree = render(
      <ThemeProvider>
        <M2WhatsNew visible onClose={() => {}} />
      </ThemeProvider>,
    );
    expect(tree.getByText('Watch what\'s new')).toBeTruthy();
  });

  it('renders no video link when the release has no video_url', () => {
    mockAnnouncement.mockReturnValue({ ...releaseWithVideo, video_url: undefined });
    const tree = render(
      <ThemeProvider>
        <M2WhatsNew visible onClose={() => {}} />
      </ThemeProvider>,
    );
    expect(tree.queryByText('Watch what\'s new')).toBeNull();
  });
});
