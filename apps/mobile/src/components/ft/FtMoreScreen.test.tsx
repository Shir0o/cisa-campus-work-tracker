import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { FtMoreScreen } from './FtMoreScreen';
import { ThemeProvider } from '../../theme/ThemeProvider';

jest.mock('../../lib/data/bibleStudy', () => ({
  subscribeEntryPoints: jest.fn(() => () => {}),
  subscribePublishedStudyMeetings: jest.fn(() => () => {}),
}));

jest.mock('../../lib/AuthProvider', () => ({
  useAuth: () => ({
    user: { displayName: 'Staffer Tony' },
    uid: 'ft-1',
    role: 'admin',
    isOwner: true,
  }),
}));

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('../impersonate/ImpersonateLayer', () => ({
  useImpersonateSheet: () => ({ open: jest.fn() }),
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

describe('FtMoreScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders More screen items including Tell us how it\'s going', async () => {
    const { getByText, queryByTestId } = await render(
      <ThemeProvider>
        <FtMoreScreen />
      </ThemeProvider>,
    );

    expect(getByText('The Journey')).toBeTruthy();
    expect(getByText('Gatherings')).toBeTruthy();
    expect(getByText("Tell us how it's going")).toBeTruthy();
    expect(queryByTestId('feedback-sheet')).toBeNull();
  });

  it('opens FeedbackSheet when Tell us how it\'s going is pressed', async () => {
    const { getByText, getByTestId, queryByTestId } = await render(
      <ThemeProvider>
        <FtMoreScreen />
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
