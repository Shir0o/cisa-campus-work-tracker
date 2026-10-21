// FocusCard — the card never scrolls, so content that doesn't fit must say so
// (#1715 review): a "Read more" cue appears only when the body is cut off, and
// opens the full card like tapping the body does.
import React from 'react';
import { Text } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import { ThemeProvider } from '../../theme/ThemeProvider';
import { FocusCard } from './FocusCard';

jest.mock('../../lib/AuthProvider', () => ({
  useAuth: () => ({ uid: undefined, user: null, role: null }),
}));

const layout = (height: number) => ({ nativeEvent: { layout: { x: 0, y: 0, width: 300, height } } });

const renderCard = async (onRead = jest.fn()) => {
  const utils = await render(
    <ThemeProvider>
      <FocusCard tone="follow" label="Follow up" foot={<Text>foot</Text>} onRead={onRead} readLabel="Read all about Sam">
        <Text>Body</Text>
      </FocusCard>
    </ThemeProvider>,
  );
  return { ...utils, onRead };
};

describe('FocusCard', () => {
  it('shows no cue while the body fits', async () => {
    const { getByTestId, queryByText } = await renderCard();
    await fireEvent(getByTestId('focus-card-body'), 'layout', layout(400));
    await fireEvent(getByTestId('focus-card-content'), 'layout', layout(300));
    expect(queryByText('Read more')).toBeNull();
  });

  it('shows "Read more" when the body is cut off, and it opens the full card', async () => {
    const { getByTestId, getByText, onRead } = await renderCard();
    await fireEvent(getByTestId('focus-card-body'), 'layout', layout(300));
    await fireEvent(getByTestId('focus-card-content'), 'layout', layout(420));
    await fireEvent.press(getByText('Read more'));
    expect(onRead).toHaveBeenCalledTimes(1);
  });

  it('drops the cue again once the content fits', async () => {
    const { getByTestId, queryByText } = await renderCard();
    await fireEvent(getByTestId('focus-card-body'), 'layout', layout(300));
    await fireEvent(getByTestId('focus-card-content'), 'layout', layout(420));
    await fireEvent(getByTestId('focus-card-content'), 'layout', layout(200));
    expect(queryByText('Read more')).toBeNull();
  });
});
