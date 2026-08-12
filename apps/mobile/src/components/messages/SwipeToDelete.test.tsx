import React from 'react';
import { Text } from 'react-native';
import { render } from '@testing-library/react-native';
import { ThemeProvider } from '../../theme/ThemeProvider';
import { SwipeToDelete } from './SwipeToDelete';

jest.mock('../../lib/AuthProvider', () => ({
  useAuth: () => ({ uid: 'user1', user: null, role: 'full-timer' }),
}));

describe('SwipeToDelete', () => {
  it('renders children wrapped in swipeable container', () => {
    const onHide = jest.fn();
    const { getByText } = render(
      <ThemeProvider>
        <SwipeToDelete onHide={onHide}>
          <Text>Conversation Row</Text>
        </SwipeToDelete>
      </ThemeProvider>,
    );
    expect(getByText('Conversation Row')).toBeTruthy();
  });
});
