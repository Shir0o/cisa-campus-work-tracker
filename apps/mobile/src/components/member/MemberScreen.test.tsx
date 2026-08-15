import React from 'react';
import { Text } from 'react-native';
import { render } from '@testing-library/react-native';
import { ThemeProvider } from '../../theme/ThemeProvider';
import { MemberScreen } from './MemberScreen';

jest.mock('../../lib/AuthProvider', () => ({
  useAuth: () => ({ uid: 'user1', user: null, role: 'student' }),
}));

describe('MemberScreen', () => {
  it('shows the member home skeleton while loading', () => {
    const { getByTestId } = render(
      <ThemeProvider>
        <MemberScreen loading error={null}>
          <Text>Never rendered while loading</Text>
        </MemberScreen>
      </ThemeProvider>,
    );
    expect(getByTestId('member-home-skeleton')).toBeTruthy();
  });

  it('renders children once loading settles', () => {
    const { getByText, queryByTestId } = render(
      <ThemeProvider>
        <MemberScreen error={null}>
          <Text>Today's content</Text>
        </MemberScreen>
      </ThemeProvider>,
    );
    expect(queryByTestId('member-home-skeleton')).toBeNull();
    expect(getByText("Today's content")).toBeTruthy();
  });
});
