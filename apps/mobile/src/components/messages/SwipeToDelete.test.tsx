import React from 'react';
import { Text } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { render } from '@testing-library/react-native';
import { ThemeProvider } from '../../theme/ThemeProvider';
import { SwipeToDelete } from './SwipeToDelete';

jest.mock('../../lib/AuthProvider', () => ({
  useAuth: () => ({ uid: 'user1', user: null, role: 'full-timer' }),
}));

describe('SwipeToDelete', () => {
  it('renders children wrapped in swipeable container', async () => {
    const onHide = jest.fn();
    const { getByText } = await render(
      <GestureHandlerRootView>
        <ThemeProvider>
          <SwipeToDelete onHide={onHide}>
            <Text>Conversation Row</Text>
          </SwipeToDelete>
        </ThemeProvider>
      </GestureHandlerRootView>,
    );
    expect(getByText('Conversation Row')).toBeTruthy();
  });
});
