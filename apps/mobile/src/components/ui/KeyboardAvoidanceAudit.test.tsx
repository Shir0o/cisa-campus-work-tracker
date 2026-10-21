import React from 'react';
import { TextInput } from 'react-native';
import { render } from '@testing-library/react-native';
import { ThemeProvider } from '../../theme/ThemeProvider';
import { Sheet } from './Sheet';
import { Screen } from './index';
import { MemberScreen, MemberRoom } from '../member/MemberScreen';
import { FeedbackSheet } from '../feedback/FeedbackSheet';

jest.mock('./KeyboardAvoidingView', () => {
  const React = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');
  return {
    KeyboardAvoidingView: jest.fn(({ children, ...props }) =>
      React.createElement(View, { testID: 'keyboard-avoiding-view', ...props }, children),
    ),
    resolveKeyboardAvoidingBehavior: jest.fn((platform, behavior) =>
      platform === 'android' ? 'padding' : behavior,
    ),
  };
});

jest.mock('../../lib/AuthProvider', () => ({
  useAuth: () => ({ uid: 'test-user', user: { uid: 'test-user' }, role: 'admin' }),
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  usePathname: () => '/',
}));

jest.mock('react-native-view-shot', () => ({
  captureRef: jest.fn().mockResolvedValue('fake-base64'),
}));

jest.mock('@gorhom/bottom-sheet', () => {
  const React = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');
  const BottomSheetModal = React.forwardRef((props: any, ref: any) => {
    React.useImperativeHandle(ref, () => ({ present: jest.fn(), dismiss: jest.fn() }));
    return React.createElement(View, null, props.children);
  });
  return {
    BottomSheetModal,
    BottomSheetScrollView: View,
    BottomSheetFooter: View,
    useBottomSheetTimingConfigs: () => ({}),
  };
});

describe('General Mobile Keyboard Avoidance (#1704)', () => {
  it('Sheet provides KeyboardAvoidingView so hosted inputs are pushed up', async () => {
    const { queryByTestId } = await render(
      <ThemeProvider>
        <Sheet visible onClose={jest.fn()}>
          <TextInput placeholder="Sheet input" />
        </Sheet>
      </ThemeProvider>,
    );

    expect(queryByTestId('keyboard-avoiding-view')).toBeTruthy();
  });

  it('Screen provides KeyboardAvoidingView so full-screen forms (login, signup) are pushed up', async () => {
    const { queryByTestId } = await render(
      <ThemeProvider>
        <Screen>
          <TextInput placeholder="Screen input" />
        </Screen>
      </ThemeProvider>,
    );

    expect(queryByTestId('keyboard-avoiding-view')).toBeTruthy();
  });

  it('MemberScreen provides KeyboardAvoidingView so member flows (notes, open your home) are pushed up', async () => {
    const { queryByTestId } = await render(
      <ThemeProvider>
        <MemberRoom>
          <MemberScreen>
            <TextInput placeholder="Member input" />
          </MemberScreen>
        </MemberRoom>
      </ThemeProvider>,
    );

    expect(queryByTestId('keyboard-avoiding-view')).toBeTruthy();
  });

  it('FeedbackSheet has keyboard avoidance so feedback input is not covered by keyboard', async () => {
    const { queryByTestId } = await render(
      <ThemeProvider>
        <FeedbackSheet visible onClose={jest.fn()} />
      </ThemeProvider>,
    );

    expect(queryByTestId('keyboard-avoiding-view')).toBeTruthy();
  });
});
