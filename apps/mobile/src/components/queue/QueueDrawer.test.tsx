import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { QueueDrawer } from './QueueDrawer';
import { ThemeProvider } from '../../theme/ThemeProvider';

jest.mock('../../lib/data/bibleStudy', () => ({
  subscribeEntryPoints: jest.fn(() => () => {}),
  subscribePublishedStudyMeetings: jest.fn(() => () => {}),
}));

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

  it('renders menu items including Tell us how it\'s going', async () => {
    const { getByText, queryByText } = await render(
      <ThemeProvider>
        <QueueDrawer visible={true} onClose={jest.fn()} onFeedback={jest.fn()} />
      </ThemeProvider>,
    );

    expect(getByText('People')).toBeTruthy();
    // People is the one door; The Journey is its Step pills (ADR 0047).
    expect(queryByText('The Journey')).toBeNull();
    // Messages (chats) is cut (cut-or-keep §20).
    expect(queryByText('Messages')).toBeNull();
    // Ask a Full-timer (Questions for the team) is cut (cut-or-keep §5).
    expect(queryByText('Ask a Full-timer')).toBeNull();
    expect(getByText('Sign-up form')).toBeTruthy();
    expect(getByText('How this works')).toBeTruthy();
    expect(getByText("Report a problem or idea")).toBeTruthy();
    expect(getByText('Your app')).toBeTruthy();
  });

  it('calls onClose and onFeedback when Tell us how it\'s going is pressed', async () => {
    const onClose = jest.fn();
    const onFeedback = jest.fn();

    const { getByText } = await render(
      <ThemeProvider>
        <QueueDrawer visible={true} onClose={onClose} onFeedback={onFeedback} />
      </ThemeProvider>,
    );

    const feedbackBtn = getByText("Report a problem or idea");
    await fireEvent.press(feedbackBtn);

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onFeedback).toHaveBeenCalledTimes(1);
    expect(mockPush).not.toHaveBeenCalled();
  });
});
