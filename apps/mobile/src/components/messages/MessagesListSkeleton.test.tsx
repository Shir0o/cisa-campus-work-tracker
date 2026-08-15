import React from 'react';
import { render } from '@testing-library/react-native';
import { ThemeProvider } from '../../theme/ThemeProvider';
import { MessagesListSkeleton } from './MessagesListSkeleton';

jest.mock('../../lib/AuthProvider', () => ({
  useAuth: () => ({ uid: 'user1', user: null, role: 'full-timer' }),
}));

describe('MessagesListSkeleton', () => {
  it('renders a list of conversation-row placeholders', () => {
    const { getByTestId, getAllByTestId } = render(
      <ThemeProvider>
        <MessagesListSkeleton />
      </ThemeProvider>,
    );
    expect(getByTestId('messages-list-skeleton')).toBeTruthy();
    expect(getAllByTestId('skeleton').length).toBeGreaterThanOrEqual(12);
  });
});
