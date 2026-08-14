import React from 'react';
import { render } from '@testing-library/react-native';
import { ThemeProvider } from '../../theme/ThemeProvider';
import { ChatThreadScreen } from './ChatThreadScreen';
import { useChatThreadData } from '../../lib/useChatThreadData';

jest.mock('../../lib/AuthProvider', () => ({
  useAuth: () => ({ uid: 'user1', user: null, role: 'full-timer' }),
}));

jest.mock('../../lib/useChatThreadData', () => ({ useChatThreadData: jest.fn() }));

jest.mock('../../lib/data/chat', () => ({
  deleteChatMessage: jest.fn(),
}));

const data = (overrides: Record<string, unknown> = {}) => ({
  room: null,
  usersCache: {},
  dayGroups: [],
  partnerContactId: null,
  loading: true,
  error: null,
  send: jest.fn(),
  ...overrides,
});

describe('ChatThreadScreen', () => {
  it('shows the thread skeleton while data is loading', () => {
    (useChatThreadData as jest.Mock).mockReturnValue(data());
    const { getByTestId, queryByTestId } = render(
      <ThemeProvider>
        <ChatThreadScreen roomId="room1" />
      </ThemeProvider>,
    );
    expect(getByTestId('thread-skeleton')).toBeTruthy();
    expect(queryByTestId('activity-indicator')).toBeNull();
  });

  it('shows the empty state instead of stale content once loading settles', () => {
    (useChatThreadData as jest.Mock).mockReturnValue(data({ loading: false }));
    const { getByText, queryByTestId } = render(
      <ThemeProvider>
        <ChatThreadScreen roomId="room1" />
      </ThemeProvider>,
    );
    expect(queryByTestId('thread-skeleton')).toBeNull();
    expect(getByText('Nothing here yet. Send one to start it off.')).toBeTruthy();
  });
});
