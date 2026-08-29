import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { FeedbackSheet } from './FeedbackSheet';
import { ThemeProvider } from '../../theme/ThemeProvider';
import { captureRef } from 'react-native-view-shot';

jest.mock('../../lib/AuthProvider', () => ({
  useAuth: () => ({
    user: { uid: 'm-uid-1', displayName: 'Mobile User', email: 'm@example.com', getIdToken: jest.fn().mockResolvedValue('tok-1') },
  }),
}));

jest.mock('../../lib/firebase', () => ({
  auth: {
    currentUser: {
      uid: 'm-uid-1',
      displayName: 'Mobile User',
      email: 'm@example.com',
      getIdToken: jest.fn().mockResolvedValue('tok-1'),
    },
  },
}));

jest.mock('react-native-view-shot', () => ({
  captureRef: jest.fn().mockResolvedValue('fake-base64-string'),
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

describe('FeedbackSheet', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true, id: 'fb-m-1' }),
    });
  });

  it('triggers captureRef when visible with targetRef', async () => {
    const dummyRef = { current: {} };
    render(
      <ThemeProvider>
        <FeedbackSheet visible={true} onClose={jest.fn()} targetRef={dummyRef} />
      </ThemeProvider>
    );

    await waitFor(() => {
      expect(captureRef).toHaveBeenCalledWith(dummyRef, expect.objectContaining({
        format: 'jpg',
        result: 'base64',
      }));
    });
  });

  it('submits feedback message and screenshot to /api/feedback', async () => {
    const dummyRef = { current: {} };
    const { getByPlaceholderText, getByText } = render(
      <ThemeProvider>
        <FeedbackSheet visible={true} onClose={jest.fn()} targetRef={dummyRef} />
      </ThemeProvider>
    );

    await waitFor(() => {
      expect(captureRef).toHaveBeenCalled();
    });

    const input = getByPlaceholderText("What's on your mind?");
    fireEvent.changeText(input, 'Mobile test feedback note');

    const sendBtn = getByText('Send');
    fireEvent.press(sendBtn);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/api/feedback'), expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('Mobile test feedback note'),
      }));
    });

    const bodyStr = (global.fetch as jest.Mock).mock.calls[0][1].body;
    expect(bodyStr).toContain('data:image/jpeg;base64,fake-base64-string');

    await waitFor(() => {
      expect(getByText(/We got your note/)).toBeTruthy();
    });
  });
});

