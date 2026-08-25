import React from 'react';
import { render } from '@testing-library/react-native';
import { ThemeProvider } from '../../theme/ThemeProvider';
import { FtHomeScreen } from './FtHomeScreen';
import { useFtHomeData } from '../../lib/useFtHomeData';

jest.mock('../../lib/AuthProvider', () => ({
  useAuth: () => ({ uid: 'user1', user: null, role: 'full-timer' }),
}));

jest.mock('../../lib/useFtHomeData', () => ({ useFtHomeData: jest.fn() }));

jest.mock('../log/LogSheet', () => ({ LogSheet: () => null }));

describe('FtHomeScreen', () => {
  it('shows the full-timer home skeleton while data is loading', () => {
    (useFtHomeData as jest.Mock).mockReturnValue({ loading: true });
    const { getByTestId } = render(
      <ThemeProvider>
        <FtHomeScreen />
      </ThemeProvider>,
    );
    expect(getByTestId('ft-home-skeleton')).toBeTruthy();
  });

  it('does not show the skeleton once data has loaded', () => {
    (useFtHomeData as jest.Mock).mockReturnValue({
      loading: false,
      contacts: [],
      carrying: { count: 0, detail: '' },
      nextGathering: null,
      todos: { today: [], laterThisWeek: [], overdue: [] },
      inboxRows: [],
      askStacks: [],
      askUnread: 0,
      quiet: [],
      carryRows: [],
      prayedToday: false,
      homesOpen: [],
      weekAhead: [],
      assignees: [],
      nameByUid: {},
      summary: '',
      error: null,
    });
    const { queryByTestId } = render(
      <ThemeProvider>
        <FtHomeScreen />
      </ThemeProvider>,
    );
    expect(queryByTestId('ft-home-skeleton')).toBeNull();
  });
});
