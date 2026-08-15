import React from 'react';
import { render } from '@testing-library/react-native';
import { ThemeProvider } from '../../theme/ThemeProvider';
import { SkeletonList } from './SkeletonList';

jest.mock('../../lib/AuthProvider', () => ({
  useAuth: () => ({ uid: 'user1', user: null, role: 'full-timer' }),
}));

describe('SkeletonList', () => {
  it('renders the requested number of avatar rows', () => {
    const { getByTestId, getAllByTestId } = render(
      <ThemeProvider>
        <SkeletonList rows={4} />
      </ThemeProvider>,
    );
    expect(getByTestId('skeleton-list')).toBeTruthy();
    expect(getAllByTestId('skeleton').length).toBeGreaterThanOrEqual(12);
  });

  it('renders plain line rows when avatar is off', () => {
    const { getAllByTestId } = render(
      <ThemeProvider>
        <SkeletonList rows={2} avatar={false} />
      </ThemeProvider>,
    );
    expect(getAllByTestId('skeleton').length).toBe(6);
  });
});
