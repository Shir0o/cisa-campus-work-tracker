import React from 'react';
import { Text } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import { buildStream, type StreamMessage, type StreamRow } from '@cisa/core';
import { ThemeProvider } from '../../theme/ThemeProvider';
import { StreamRowView } from './StreamRow';
import { StreamActionSheet } from './StreamActionSheet';

jest.mock('../../lib/AuthProvider', () => ({ useAuth: () => ({ uid: 'tony', user: null, role: 'admin' }) }));

const NOW = Date.parse('2026-09-30T12:00:00.000Z');
const m = (id: string, over: Partial<StreamMessage> = {}): StreamMessage => ({
  id,
  from: 'maria',
  fromName: 'Maria Santos',
  body: `body-${id}`,
  at: '2026-09-30T10:00:00.000Z',
  ...over,
});
const rowOf = (msg: StreamMessage) =>
  buildStream({ messages: [msg], viewer: { uid: 'tony', role: 'admin' }, now: NOW }).find((i) => i.type === 'row') as StreamRow;

const wrap = (ui: React.ReactElement) => render(<ThemeProvider>{ui}</ThemeProvider>);

describe('StreamRowView — what a chat adds to the row', () => {
  it('shows the sender photo when there is one, and initials when there is not', async () => {
    const { getByLabelText, queryByLabelText, getByText, rerender } = await wrap(
      <StreamRowView row={rowOf(m('a'))} now={NOW} avatarUrl={() => 'https://x/maria.png'} />,
    );
    expect(getByLabelText('Maria Santos photo').props.source).toEqual({ uri: 'https://x/maria.png' });
    await rerender(
      <ThemeProvider>
        <StreamRowView row={rowOf(m('a'))} now={NOW} avatarUrl={() => undefined} />
      </ThemeProvider>,
    );
    expect(queryByLabelText('Maria Santos photo')).toBeNull();
    expect(getByText('MS')).toBeTruthy();
  });

  it('falls back to initials when the photo will not load', async () => {
    const { getByLabelText, getByText } = await wrap(
      <StreamRowView row={rowOf(m('a'))} now={NOW} avatarUrl={() => 'https://x/broken.png'} />,
    );
    await fireEvent(getByLabelText('Maria Santos photo'), 'error');
    expect(getByText('MS')).toBeTruthy();
  });

  it('puts a neutral badge beside the name', async () => {
    const { getByText } = await wrap(<StreamRowView row={rowOf(m('a'))} now={NOW} badge={() => 'Full-timer'} />);
    expect(getByText('Full-timer')).toBeTruthy();
  });

  it('draws a taken-back message as its label, with no body, no long-press and no Thread chip', async () => {
    const onLongPress = jest.fn();
    const { getByText, queryByText, queryByHintText } = await wrap(
      <StreamRowView row={rowOf(m('a'))} now={NOW} goneLabel={() => 'Maria took this message back.'} onLongPress={onLongPress} />,
    );
    expect(getByText('Maria took this message back.')).toBeTruthy();
    expect(queryByText('body-a')).toBeNull();
    // A live row invites the long-press; a gone one does not.
    expect(queryByHintText('Message actions')).toBeNull();
  });

  it('invites a long-press on a live row', async () => {
    const { getByHintText } = await wrap(<StreamRowView row={rowOf(m('a'))} now={NOW} onLongPress={jest.fn()} />);
    expect(getByHintText('Message actions')).toBeTruthy();
  });

  it('draws a system notice centred and plain, with no name or avatar', async () => {
    const { getByText, queryByText } = await wrap(
      <StreamRowView row={rowOf(m('a', { body: 'Maria created group "Team"' }))} now={NOW} notice={() => true} />,
    );
    expect(getByText('Maria created group "Team"')).toBeTruthy();
    expect(queryByText('Maria Santos')).toBeNull();
  });

  it('lets the screen render the body and what sits under it', async () => {
    const { getByText, queryByText } = await wrap(
      <StreamRowView
        row={rowOf(m('a'))}
        now={NOW}
        renderBody={(row) => <Text>custom-{row.message.id}</Text>}
        renderFooter={() => <Text>the-footer</Text>}
      />,
    );
    expect(getByText('custom-a')).toBeTruthy();
    expect(queryByText('body-a')).toBeNull();
    expect(getByText('the-footer')).toBeTruthy();
  });
});

describe('StreamActionSheet — Pin', () => {
  const row = rowOf(m('a'));
  it('offers Pin or Unpin only when a handler is given', async () => {
    const onPin = jest.fn();
    const { getByRole, queryByRole, rerender } = await wrap(
      <StreamActionSheet row={row} visible onClose={jest.fn()} onCopy={jest.fn()} />,
    );
    expect(queryByRole('button', { name: 'Pin' })).toBeNull();
    await rerender(
      <ThemeProvider>
        <StreamActionSheet row={row} visible onClose={jest.fn()} onCopy={jest.fn()} onPin={onPin} />
      </ThemeProvider>,
    );
    await fireEvent.press(getByRole('button', { name: 'Pin' }));
    expect(onPin).toHaveBeenCalledWith(row);
    await rerender(
      <ThemeProvider>
        <StreamActionSheet row={row} visible onClose={jest.fn()} onCopy={jest.fn()} onPin={onPin} pinned />
      </ThemeProvider>,
    );
    expect(getByRole('button', { name: 'Unpin' })).toBeTruthy();
  });
});
