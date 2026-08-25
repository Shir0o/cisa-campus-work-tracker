import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { ThemeProvider } from '../../theme/ThemeProvider';
import { AskStack } from './AskStack';
import type { AskStack as AskStackData } from '@cisa/core';

jest.mock('../../lib/AuthProvider', () => ({
  useAuth: () => ({ uid: 'ft1', user: null, role: 'admin' }),
}));

jest.mock('../../lib/data/asks', () => ({
  subscribeAsks: jest.fn(() => () => {}),
  addAskReply: jest.fn(),
}));

jest.mock('../../lib/data/inboxReads', () => ({
  InboxReads: { isRead: jest.fn(() => false), markRead: jest.fn() },
  useInboxReads: () => ({
    isRead: () => false,
    markRead: jest.fn(),
  }),
}));

const stack: AskStackData = {
  id: 'ask:t1',
  from: 't1',
  at: '2026-08-01T10:00:00Z',
  items: [
    {
      id: 'q1',
      parentId: null,
      owner: 't1',
      from: 't1',
      fromName: 'Zion',
      kind: 'question',
      body: 'How do you start a conversation at the club table?',
      at: '2026-08-01T10:00:00Z',
      reactions: [],
    },
  ],
};

describe('AskStack (full-timer questions widget)', () => {
  it('renders nothing when there are no unanswered questions', () => {
    const { queryByText } = render(
      <ThemeProvider>
        <AskStack
          stacks={[]}
          unread={0}
          nameByUid={{}}
          uid="ft1"
          onAnswer={jest.fn()}
          onScan={jest.fn()}
          onToast={jest.fn()}
        />
      </ThemeProvider>,
    );
    expect(queryByText('Questions for the team')).toBeNull();
  });

  it('renders the question and answers it, pinging the asker', () => {
    const onAnswer = jest.fn();
    const { getByText, getByPlaceholderText } = render(
      <ThemeProvider>
        <AskStack
          stacks={[stack]}
          unread={1}
          nameByUid={{ t1: 'Zion' }}
          uid="ft1"
          onAnswer={onAnswer}
          onScan={jest.fn()}
          onToast={jest.fn()}
        />
      </ThemeProvider>,
    );

    expect(getByText('Questions for the team')).toBeTruthy();
    expect(getByText(/Zion asked the team/)).toBeTruthy();
    expect(getByText(/How do you start a conversation at the club table/)).toBeTruthy();

    const input = getByPlaceholderText("Answer Zion the way you'd say it out loud.");
    fireEvent.changeText(input, 'Three tries, spread out.');
    fireEvent.press(getByText('Send it'));

    expect(onAnswer).toHaveBeenCalledWith('q1', 't1', 'Three tries, spread out.');
  });
});