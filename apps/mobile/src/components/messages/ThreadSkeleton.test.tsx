import React from 'react';
import { render } from '@testing-library/react-native';
import { ThemeProvider } from '../../theme/ThemeProvider';
import { ThreadSkeleton } from './ThreadSkeleton';

jest.mock('../../lib/AuthProvider', () => ({
  useAuth: () => ({ uid: 'user1', user: null, role: 'full-timer' }),
}));

describe('ThreadSkeleton', () => {
  it('renders a conversation-shaped set of row placeholders', async () => {
    const { getByTestId, getAllByTestId } = await render(
      <ThemeProvider>
        <ThreadSkeleton />
      </ThemeProvider>,
    );
    expect(getByTestId('thread-skeleton')).toBeTruthy();
    expect(getAllByTestId('skeleton').length).toBeGreaterThan(3);
  });

  it('keeps every placeholder on the left, like the rows it stands in for (G3)', async () => {
    const { toJSON } = await render(
      <ThemeProvider>
        <ThreadSkeleton />
      </ThemeProvider>,
    );
    expect(JSON.stringify(toJSON())).not.toContain('"alignSelf":"flex-end"');
  });
});
