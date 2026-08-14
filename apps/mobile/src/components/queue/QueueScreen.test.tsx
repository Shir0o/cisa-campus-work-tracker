import React from 'react';
import { render } from '@testing-library/react-native';
import { ThemeProvider } from '../../theme/ThemeProvider';
import { QueueScreen } from './QueueScreen';
import { useTraineeLandingData } from '../../lib/useTraineeLandingData';

jest.mock('../../lib/AuthProvider', () => ({
  useAuth: () => ({ uid: 'user1', user: null, role: 'trainee' }),
}));

jest.mock('../../lib/useTraineeLandingData', () => ({ useTraineeLandingData: jest.fn() }));

jest.mock('../../lib/data/todos', () => ({
  setTodoDone: jest.fn(),
  updateTodo: jest.fn(),
}));

jest.mock('../../lib/data/threads', () => ({
  addThreadMessage: jest.fn(),
  toggleReaction: jest.fn(),
}));

jest.mock('../../lib/data/inboxReads', () => ({
  InboxReads: { markRead: jest.fn() },
}));

jest.mock('../log/LogSheet', () => ({ LogSheet: () => null }));

describe('QueueScreen', () => {
  const baseData = {
    loading: true,
    queue: Object.assign([], { held: 0 }),
    queueState: { handled: {}, handledCount: 0, handle: jest.fn(), pushLater: jest.fn() },
    queuePrefs: { prefs: {} },
    week: [],
    dates: [],
    error: null,
  };

  it('shows the queue skeleton while data is loading', () => {
    (useTraineeLandingData as jest.Mock).mockReturnValue(baseData);
    const { getByTestId } = render(
      <ThemeProvider>
        <QueueScreen />
      </ThemeProvider>,
    );
    expect(getByTestId('queue-skeleton')).toBeTruthy();
  });

  it('shows the queue instead of the skeleton once loaded', () => {
    (useTraineeLandingData as jest.Mock).mockReturnValue({ ...baseData, loading: false });
    const { queryByTestId } = render(
      <ThemeProvider>
        <QueueScreen />
      </ThemeProvider>,
    );
    expect(queryByTestId('queue-skeleton')).toBeNull();
  });
});
