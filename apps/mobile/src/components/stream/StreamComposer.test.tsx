import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import { ThemeProvider } from '../../theme/ThemeProvider';
import { StreamComposer } from './StreamComposer';
import type { MentionUser } from '../../lib/mentions';

jest.mock('../../lib/AuthProvider', () => ({ useAuth: () => ({ uid: 'tony', user: null, role: 'admin' }) }));

const roster: MentionUser[] = [
  { uid: 'u1', name: 'Tony Wang', role: 'admin' },
  { uid: 'u2', name: 'Zion Park', role: 'manager' },
];

const wrap = (ui: React.ReactElement) => render(<ThemeProvider>{ui}</ThemeProvider>);

/** Type into the field and move the cursor to the end, as a real keystroke does. */
const type = async (input: unknown, text: string) => {
  await fireEvent.changeText(input as never, text);
  await fireEvent(input as never, 'selectionChange', { nativeEvent: { selection: { start: text.length, end: text.length } } });
};

describe('StreamComposer — @mention picker (C4)', () => {
  it('offers the @ tool only when there is a roster to mention', async () => {
    const bare = await wrap(<StreamComposer label="Write" onSend={jest.fn()} />);
    expect(bare.queryByLabelText('Mention someone')).toBeNull();

    const withRoster = await wrap(<StreamComposer label="Write" candidates={roster} onSend={jest.fn()} />);
    expect(withRoster.getByLabelText('Mention someone')).toBeTruthy();
  });

  it('lists matches for an active query and inserts the picked full name', async () => {
    const { getByLabelText, getByText, queryByText } = await wrap(
      <StreamComposer label="Write" candidates={roster} onSend={jest.fn()} />,
    );
    const input = getByLabelText('Write');
    await type(input, '@To');
    expect(getByText('Tony Wang')).toBeTruthy();
    expect(queryByText('Zion Park')).toBeNull();
    await fireEvent.press(getByText('Tony Wang'));
    expect(input.props.value).toBe('@Tony Wang ');
  });

  it('notifies a picked mention', async () => {
    const onSend = jest.fn();
    const { getByLabelText, getByText, getByRole } = await wrap(
      <StreamComposer label="Write" candidates={roster} onSend={onSend} />,
    );
    await type(getByLabelText('Write'), '@To');
    await fireEvent.press(getByText('Tony Wang'));
    await fireEvent.press(getByRole('button', { name: 'Send' }));
    expect(onSend).toHaveBeenCalledWith({ body: '@Tony Wang', kind: 'comment', mentionedUserIds: ['u1'] });
  });

  it('drops the notification when the name is edited out before sending', async () => {
    const onSend = jest.fn();
    const { getByLabelText, getByText, getByRole } = await wrap(
      <StreamComposer label="Write" candidates={roster} onSend={onSend} />,
    );
    const input = getByLabelText('Write');
    await type(input, '@To');
    await fireEvent.press(getByText('Tony Wang'));
    await fireEvent.changeText(input, 'never mind');
    await fireEvent.press(getByRole('button', { name: 'Send' }));
    expect(onSend).toHaveBeenCalledWith({ body: 'never mind', kind: 'comment', mentionedUserIds: [] });
  });
});

describe('StreamComposer — chat attachments (C5)', () => {
  it('stages a card above the text, removable before sending', async () => {
    const onUnstage = jest.fn();
    const { getByLabelText, getByText } = await wrap(
      <StreamComposer
        label="Write"
        onSend={jest.fn()}
        staged={[{ key: '0', label: 'Daniel Reyes', kind: 'contact' }]}
        onAttach={jest.fn()}
        onUnstage={onUnstage}
      />,
    );
    expect(getByLabelText('Attach')).toBeTruthy();
    expect(getByText('Daniel Reyes')).toBeTruthy();
    await fireEvent.press(getByLabelText('Remove Daniel Reyes'));
    expect(onUnstage).toHaveBeenCalledWith('0');
  });

  it('sends a staged card even with no words', async () => {
    const onSend = jest.fn();
    const { getByRole } = await wrap(
      <StreamComposer
        label="Write"
        onSend={onSend}
        staged={[{ key: '0', label: 'Daniel Reyes', kind: 'contact' }]}
        onAttach={jest.fn()}
        onUnstage={jest.fn()}
      />,
    );
    await fireEvent.press(getByRole('button', { name: 'Send' }));
    expect(onSend).toHaveBeenCalledWith({ body: '', kind: 'comment', mentionedUserIds: [] });
  });
});

describe('StreamComposer — every tap target at least 44px', () => {
  it('sizes the tools and send', async () => {
    const { getByLabelText, getByRole } = await wrap(
      <StreamComposer label="Write" candidates={roster} onSend={jest.fn()} onAttach={jest.fn()} />,
    );
    for (const label of ['Attach', 'Mention someone']) {
      expect(StyleSheet.flatten(getByLabelText(label).props.style).height).toBeGreaterThanOrEqual(44);
    }
    expect(StyleSheet.flatten(getByRole('button', { name: 'Send' }).props.style).height).toBeGreaterThanOrEqual(44);
  });
});
