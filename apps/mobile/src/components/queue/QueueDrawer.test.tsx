import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { QueueDrawer } from './QueueDrawer';
import { ThemeProvider } from '../../theme/ThemeProvider';

jest.mock('../../lib/AuthProvider', () => ({
  useAuth: () => ({
    user: { displayName: 'Trainee User' },
    uid: 'trainee-1',
    role: 'trainee',
  }),
}));

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

describe('QueueDrawer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders menu items including Tell us how it\'s going', () => {
    const { getByText } = render(
      <ThemeProvider>
        <QueueDrawer visible={true} onClose={jest.fn()} onFeedback={jest.fn()} />
      </ThemeProvider>,
    );

    expect(getByText('People')).toBeTruthy();
    expect(getByText('The Journey')).toBeTruthy();
    expect(getByText('Messages')).toBeTruthy();
    expect(getByText('Ask the team')).toBeTruthy();
    expect(getByText('Sign-up form')).toBeTruthy();
    expect(getByText('How this works')).toBeTruthy();
    expect(getByText("Tell us how it's going")).toBeTruthy();
    expect(getByText('Your app')).toBeTruthy();
  });

  it('calls onClose and onFeedback when Tell us how it\'s going is pressed', () => {
    const onClose = jest.fn();
    const onFeedback = jest.fn();

    const { getByText } = render(
      <ThemeProvider>
        <QueueDrawer visible={true} onClose={onClose} onFeedback={onFeedback} />
      </ThemeProvider>,
    );

    const feedbackBtn = getByText("Tell us how it's going");
    fireEvent.press(feedbackBtn);

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onFeedback).toHaveBeenCalledTimes(1);
    expect(mockPush).not.toHaveBeenCalled();
  });
});
