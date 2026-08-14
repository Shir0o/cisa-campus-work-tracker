import React from 'react';
import { render } from '@testing-library/react-native';
import { ThemeProvider } from '../../theme/ThemeProvider';
import { ThreadSkeleton } from './ThreadSkeleton';

jest.mock('../../lib/AuthProvider', () => ({
  useAuth: () => ({ uid: 'user1', user: null, role: 'full-timer' }),
}));

describe('ThreadSkeleton', () => {
  it('renders a conversation-shaped set of bubble placeholders', () => {
    const { getByTestId, getAllByTestId } = render(
      <ThemeProvider>
        <ThreadSkeleton />
      </ThemeProvider>,
    );
    expect(getByTestId('thread-skeleton')).toBeTruthy();
    expect(getAllByTestId('skeleton').length).toBeGreaterThan(3);
  });
});
