import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { FeedbackSheet } from './FeedbackSheet';
import { ThemeProvider } from '../../theme/ThemeProvider';
import { captureRef } from 'react-native-view-shot';
import { MAX_SCREENSHOT_CHARS } from '@cisa/core';

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

const renderSheet = (targetRef?: any) =>
  render(
    <ThemeProvider>
      <FeedbackSheet visible={true} onClose={jest.fn()} targetRef={targetRef} />
    </ThemeProvider>
  );

const submit = async (getByPlaceholderText: any, getByText: any) => {
  const input = getByPlaceholderText("What's on your mind?");
  fireEvent.changeText(input, 'Mobile test feedback note');
  fireEvent.press(getByText('Send'));
  await waitFor(() => expect(global.fetch).toHaveBeenCalled());
  return JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
};

describe('FeedbackSheet', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (captureRef as jest.Mock).mockResolvedValue('fake-base64-string');
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true, id: 'fb-m-1' }),
    });
  });

  it('captures the screen behind the sheet when given a targetRef', async () => {
    const dummyRef = { current: {} };
    renderSheet(dummyRef);

    await waitFor(() => {
      expect(captureRef).toHaveBeenCalledWith(dummyRef, expect.objectContaining({
        format: 'jpg',
        result: 'base64',
      }));
    });
  });

  it('sends the captured screenshot to /api/feedback', async () => {
    const dummyRef = { current: {} };
    const { getByPlaceholderText, getByText } = renderSheet(dummyRef);

    await waitFor(() => expect(captureRef).toHaveBeenCalled());

    const body = await submit(getByPlaceholderText, getByText);
    expect(body.screenshot).toBe('data:image/jpeg;base64,fake-base64-string');
    expect(body.message).toBe('Mobile test feedback note');
  });

  it('never sends the reporter email (ADR 0018 decision 5)', async () => {
    const { getByPlaceholderText, getByText } = renderSheet({ current: {} });

    const body = await submit(getByPlaceholderText, getByText);
    expect(body).not.toHaveProperty('userEmail');
  });

  it('submits without a screenshot when no targetRef is given', async () => {
    const { getByPlaceholderText, getByText } = renderSheet(undefined);

    const body = await submit(getByPlaceholderText, getByText);
    expect(captureRef).not.toHaveBeenCalled();
    expect(body.screenshot).toBe('');
  });

  it('drops a capture that overflows the size ceiling at every quality', async () => {
    // Always larger than the ceiling, so the whole quality ladder is exhausted.
    (captureRef as jest.Mock).mockResolvedValue('x'.repeat(MAX_SCREENSHOT_CHARS + 1));
    const { getByPlaceholderText, getByText } = renderSheet({ current: {} });

    await waitFor(() => expect(captureRef).toHaveBeenCalledTimes(3));

    const body = await submit(getByPlaceholderText, getByText);
    expect(body.screenshot).toBe('');
  });

  it('submits without a screenshot when capture throws', async () => {
    (captureRef as jest.Mock).mockRejectedValue(new Error('no native view'));
    const { getByPlaceholderText, getByText } = renderSheet({ current: {} });

    await waitFor(() => expect(captureRef).toHaveBeenCalled());

    const body = await submit(getByPlaceholderText, getByText);
    expect(body.screenshot).toBe('');
  });
});
