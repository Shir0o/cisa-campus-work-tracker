import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { MemberYouScreen } from './MemberYouScreen';
import { ThemeProvider } from '../../theme/ThemeProvider';

jest.mock('../../lib/data/bibleStudy', () => ({
  subscribeEntryPoints: jest.fn(() => () => {}),
  subscribePublishedStudyMeetings: jest.fn(() => () => {}),
}));

jest.mock('../../lib/AuthProvider', () => ({
  useAuth: () => ({
    user: { displayName: 'Student Alex' },
    uid: 'student-1',
    role: 'operator',
    logOut: jest.fn(),
  }),
}));

jest.mock('../../lib/firebase', () => ({
  auth: { currentUser: { uid: 'student-1' } },
}));

jest.mock('../../lib/data/chat', () => ({
  getOrCreateDirectChat: jest.fn(),
}));

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('../../lib/data/users', () => ({
  subscribeFullTimers: jest.fn((cb) => {
    cb([{ uid: 'ft-1', name: 'Tony Staff', initials: 'TS', role: 'admin' }]);
    return jest.fn();
  }),
}));

jest.mock('../feedback/FeedbackSheet', () => ({
  FeedbackSheet: ({ visible, onClose }: { visible: boolean; onClose: () => void }) => {
    const { View, Text, Pressable } = require('react-native');
    if (!visible) return null;
    return (
      <View testID="feedback-sheet">
        <Text>Feedback Sheet Open</Text>
        <Pressable onPress={onClose} testID="close-feedback-btn">
          <Text>Close</Text>
        </Pressable>
      </View>
    );
  },
}));

describe('MemberYouScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders You screen sections including Tell the team and Tell us how it\'s going', async () => {
    const { getByText, queryByTestId } = await render(
      <ThemeProvider>
        <MemberYouScreen role="student" />
      </ThemeProvider>,
    );

    expect(getByText('Tell the team')).toBeTruthy();
    expect(getByText("Tell us how it's going")).toBeTruthy();
    expect(getByText('An idea, something that felt off, or a thank-you')).toBeTruthy();
    expect(queryByTestId('feedback-sheet')).toBeNull();
  });

  it('opens FeedbackSheet when Tell us how it\'s going is pressed', async () => {
    const { getByText, getByTestId, queryByTestId } = await render(
      <ThemeProvider>
        <MemberYouScreen role="student" />
      </ThemeProvider>,
    );

    const feedbackBtn = getByText("Tell us how it's going");
    await fireEvent.press(feedbackBtn);

    expect(getByTestId('feedback-sheet')).toBeTruthy();

    const closeBtn = getByTestId('close-feedback-btn');
    await fireEvent.press(closeBtn);

    expect(queryByTestId('feedback-sheet')).toBeNull();
  });
});
