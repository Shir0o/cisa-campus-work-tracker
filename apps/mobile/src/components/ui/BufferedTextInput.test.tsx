// BufferedTextInput — a controlled TextInput whose owner's value may arrive a
// commit late (a field inside a BottomSheetModal, whose portal forwards new
// children from an effect). RN's TextInput pushes any value that disagrees with
// the native text back to native, which collapses the caret on Android; so the
// value the host TextInput renders must already be what was just typed.
import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { BufferedTextInput } from './BufferedTextInput';

const field = (utils: Awaited<ReturnType<typeof render>>) => utils.getByPlaceholderText('note');

describe('BufferedTextInput', () => {
  it('renders the typed text before the owner catches up', async () => {
    const onChangeText = jest.fn();
    const utils = await render(<BufferedTextInput value="hello" onChangeText={onChangeText} placeholder="note" />);

    await fireEvent.changeText(field(utils), 'hexllo');

    expect(onChangeText).toHaveBeenCalledWith('hexllo');
    expect(field(utils).props.value).toBe('hexllo');
  });

  it('ignores a late echo of text it already sent', async () => {
    const utils = await render(<BufferedTextInput value="hello" onChangeText={jest.fn()} placeholder="note" />);

    await fireEvent.changeText(field(utils), 'hexllo');
    await fireEvent.changeText(field(utils), 'hexyllo');
    // The owner's first update lands only now, one keystroke behind.
    await utils.rerender(<BufferedTextInput value="hexllo" onChangeText={jest.fn()} placeholder="note" />);
    expect(field(utils).props.value).toBe('hexyllo');

    await utils.rerender(<BufferedTextInput value="hexyllo" onChangeText={jest.fn()} placeholder="note" />);
    expect(field(utils).props.value).toBe('hexyllo');
  });

  it('takes a value the owner sets itself, like a reset after save', async () => {
    const utils = await render(<BufferedTextInput value="" onChangeText={jest.fn()} placeholder="note" />);

    await fireEvent.changeText(field(utils), 'met at the fair');
    await utils.rerender(<BufferedTextInput value="met at the fair" onChangeText={jest.fn()} placeholder="note" />);
    await utils.rerender(<BufferedTextInput value="" onChangeText={jest.fn()} placeholder="note" />);

    expect(field(utils).props.value).toBe('');
  });

  it('takes an outside value even while its own echoes are still in flight', async () => {
    const utils = await render(<BufferedTextInput value="" onChangeText={jest.fn()} placeholder="note" />);

    await fireEvent.changeText(field(utils), 'a');
    await fireEvent.changeText(field(utils), 'ab');
    await utils.rerender(<BufferedTextInput value="prefilled" onChangeText={jest.fn()} placeholder="note" />);

    expect(field(utils).props.value).toBe('prefilled');
  });

  it('passes the other TextInput props through', async () => {
    const utils = await render(
      <BufferedTextInput value="" onChangeText={jest.fn()} placeholder="note" multiline autoCapitalize="none" />,
    );

    expect(field(utils).props.multiline).toBe(true);
    expect(field(utils).props.autoCapitalize).toBe('none');
  });
});
