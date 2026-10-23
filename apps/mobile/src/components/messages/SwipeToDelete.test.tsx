import React from 'react';
import { Pressable, Text } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { fireEvent, render } from '@testing-library/react-native';
import { ThemeProvider } from '../../theme/ThemeProvider';
import { SwipeToDelete } from './SwipeToDelete';

jest.mock('../../lib/AuthProvider', () => ({
  useAuth: () => ({ uid: 'user1', user: null, role: 'full-timer' }),
}));

function setup(props: { onHide?: () => void; onDeleteForEveryone?: () => void } = {}) {
  const onHide = props.onHide ?? jest.fn();
  return render(
    <GestureHandlerRootView>
      <ThemeProvider>
        <SwipeToDelete title="Grace Lin" onHide={onHide} onDeleteForEveryone={props.onDeleteForEveryone}>
          {(openActions) => (
            <Pressable onLongPress={openActions}>
              <Text>Conversation Row</Text>
            </Pressable>
          )}
        </SwipeToDelete>
      </ThemeProvider>
    </GestureHandlerRootView>,
  );
}

describe('SwipeToDelete', () => {
  it('renders the row', async () => {
    const { getByText } = await setup();
    expect(getByText('Conversation Row')).toBeTruthy();
  });

  // #1706: holding a row opens the conversation's sheet, not the swipe panel.
  it('opens the conversation sheet on long-press, and Delete for me hides it (#1706)', async () => {
    const onHide = jest.fn();
    const { getByText, getByRole, queryByRole } = await setup({ onHide });
    expect(queryByRole('button', { name: 'Delete for me' })).toBeNull();

    await fireEvent(getByText('Conversation Row'), 'longPress');
    expect(getByText('Grace Lin')).toBeTruthy();
    expect(queryByRole('button', { name: 'Delete for everyone' })).toBeNull();

    await fireEvent.press(getByRole('button', { name: 'Delete for me' }));
    expect(onHide).toHaveBeenCalledTimes(1);
  });

  it('offers Delete for everyone only when the caller allows it (#1706)', async () => {
    const onHide = jest.fn();
    const onDeleteForEveryone = jest.fn();
    const { getByText, getByRole } = await setup({ onHide, onDeleteForEveryone });

    await fireEvent(getByText('Conversation Row'), 'longPress');
    await fireEvent.press(getByRole('button', { name: 'Delete for everyone' }));
    expect(onDeleteForEveryone).toHaveBeenCalledTimes(1);
    expect(onHide).not.toHaveBeenCalled();
  });

  it('Cancel closes the sheet without deleting (#1706)', async () => {
    const onHide = jest.fn();
    const { getByText, getByRole } = await setup({ onHide });

    await fireEvent(getByText('Conversation Row'), 'longPress');
    await fireEvent.press(getByRole('button', { name: 'Cancel' }));
    expect(onHide).not.toHaveBeenCalled();
  });
});
