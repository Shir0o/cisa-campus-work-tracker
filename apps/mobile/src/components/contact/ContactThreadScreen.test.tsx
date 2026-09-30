import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import type { Interaction, ThreadMessage } from '@cisa/core';
import { ThemeProvider } from '../../theme/ThemeProvider';
import { ContactThreadScreen } from './ContactThreadScreen';
import { useContactDetailData } from '../../lib/useContactDetailData';
import { useAuth } from '../../lib/AuthProvider';

jest.mock('../../lib/AuthProvider', () => ({ useAuth: jest.fn() }));
jest.mock('../../lib/useContactDetailData', () => ({ useContactDetailData: jest.fn() }));
const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: mockBack, replace: jest.fn(), canGoBack: () => true }),
}));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn().mockResolvedValue(true) }));

const contact = {
  id: 'c1',
  name: 'Daniel Reyes',
  stage: 'Came once',
  createdAt: '2026-08-01T12:00:00.000Z',
  createdBy: 'user1',
  founders: ['user1'],
  coCreators: ['user1'],
};

const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
const parent: ThreadMessage = {
  id: 'p1',
  interactionId: null,
  from: 'josh',
  fromName: 'Josh Park',
  kind: 'comment',
  body: "I'll sit with him Thursday again.",
  at: hoursAgo(3),
};
const r1: ThreadMessage = { id: 'r1', interactionId: null, parentId: 'p1', from: 'maria', fromName: 'Maria Santos', kind: 'comment', body: 'Perfect.', at: hoursAgo(2) };
const r2: ThreadMessage = { id: 'r2', interactionId: null, parentId: 'p1', from: 'user1', fromName: 'Staffer', kind: 'comment', body: 'I can drive him.', at: hoursAgo(1) };
const teamParent: ThreadMessage = { ...parent, id: 'tp', scope: 'team', body: 'STAFF-ONLY' };
const coffee: Interaction = {
  id: 'int-coffee',
  userId: 'josh',
  userName: 'Josh Park',
  content: 'Sat with Daniel at the Thursday gathering.',
  dateTime: hoursAgo(30),
  createdAt: hoursAgo(30),
};
const onCoffee: ThreadMessage = { id: 'ic1', interactionId: 'int-coffee', from: 'maria', fromName: 'Maria Santos', kind: 'comment', body: 'He asked about the retreat.', at: hoursAgo(5) };

const data = (over: Record<string, unknown> = {}) => ({
  contact,
  loading: false,
  error: null,
  interactions: [coffee],
  threadMessages: [parent, r1, r2, onCoffee],
  teamMembers: [],
  postThreadMessage: jest.fn(),
  deleteThreadMessage: jest.fn(),
  closeAsk: jest.fn(),
  ...over,
});

const renderThread = async (props: React.ComponentProps<typeof ContactThreadScreen>, over?: Record<string, unknown>, auth = { uid: 'user1', role: 'manager' }) => {
  const d = data(over);
  (useAuth as jest.Mock).mockReturnValue({ user: { displayName: 'Staffer' }, ...auth });
  (useContactDetailData as jest.Mock).mockReturnValue(d);
  const utils = await render(
    <ThemeProvider>
      <ContactThreadScreen {...props} />
    </ThemeProvider>,
  );
  return { ...utils, d };
};

beforeEach(() => jest.clearAllMocks());

describe('a Thread on the phone (#1261)', () => {
  it('is a pushed screen headed "Thread" and the person, with a back control to its stream', async () => {
    const { getByText, getByRole } = await renderThread({ contactId: 'c1', parentId: 'p1' });
    expect(getByText('Thread')).toBeTruthy();
    expect(getByText('Daniel Reyes')).toBeTruthy();
    await fireEvent.press(getByRole('button', { name: 'Back to Conversation' }));
    expect(mockBack).toHaveBeenCalled();
  });

  it('puts the parent on top, then the count, then the replies', async () => {
    const { getByText, toJSON } = await renderThread({ contactId: 'c1', parentId: 'p1' });
    expect(getByText('2 replies')).toBeTruthy();
    const text = JSON.stringify(toJSON());
    expect(text.indexOf("I'll sit with him")).toBeLessThan(text.indexOf('2 replies'));
    expect(text.indexOf('2 replies')).toBeLessThan(text.indexOf('Perfect.'));
    expect(text.indexOf('Perfect.')).toBeLessThan(text.indexOf('I can drive him.'));
  });

  it('replies into the same stream, one level deep', async () => {
    const { getByLabelText, getByRole, d } = await renderThread({ contactId: 'c1', parentId: 'p1' });
    await fireEvent.changeText(getByLabelText('Reply in thread'), 'Count me in');
    await fireEvent.press(getByRole('button', { name: 'Send' }));
    expect(d.postThreadMessage).toHaveBeenCalledWith({ interactionId: null, parentId: 'p1', scope: null, kind: 'comment', body: 'Count me in', mentionedUserIds: [] });
  });

  it('replies to a Full-timers message in the Full-timers stream', async () => {
    const { getByLabelText, getByRole, getByText, d } = await renderThread(
      { contactId: 'c1', parentId: 'tp', team: true },
      { threadMessages: [teamParent] },
      { uid: 'tony', role: 'admin' },
    );
    expect(getByText('STAFF-ONLY')).toBeTruthy();
    await fireEvent.changeText(getByLabelText('Reply in thread'), 'Agreed');
    await fireEvent.press(getByRole('button', { name: 'Send' }));
    expect(d.postThreadMessage).toHaveBeenCalledWith({ interactionId: null, parentId: 'tp', scope: 'team', kind: 'comment', body: 'Agreed', mentionedUserIds: [] });
  });

  it("quotes an Interaction as its Thread's parent and replies onto that Interaction", async () => {
    const { getByText, getByLabelText, getByRole, queryByText, d } = await renderThread({ contactId: 'c1', interactionId: 'int-coffee' });
    expect(getByText('Sat with Daniel at the Thursday gathering.')).toBeTruthy();
    expect(getByText('He asked about the retreat.')).toBeTruthy();
    expect(queryByText('Perfect.')).toBeNull();
    expect(getByRole('button', { name: 'Back to Interactions' })).toBeTruthy();
    await fireEvent.changeText(getByLabelText('Reply in thread'), 'Ask him Sunday');
    await fireEvent.press(getByRole('button', { name: 'Send' }));
    expect(d.postThreadMessage).toHaveBeenCalledWith({ interactionId: 'int-coffee', parentId: null, scope: null, kind: 'comment', body: 'Ask him Sunday', mentionedUserIds: [] });
  });

  it('says the message is gone once its parent is deleted', async () => {
    const { getByText, queryByLabelText } = await renderThread({ contactId: 'c1', parentId: 'nope' });
    expect(getByText('This message is gone.')).toBeTruthy();
    expect(queryByLabelText('Reply in thread')).toBeNull();
  });

  it('long-presses a reply for Copy text and, for its author, Delete — not Reply in thread', async () => {
    const { getByText, getByRole, queryByRole, d } = await renderThread({ contactId: 'c1', parentId: 'p1' });
    await fireEvent(getByText('I can drive him.'), 'longPress');
    expect(getByRole('button', { name: 'Copy text' })).toBeTruthy();
    expect(queryByRole('button', { name: 'Reply in thread' })).toBeNull();
    await fireEvent.press(getByRole('button', { name: 'Delete message' }));
    expect(d.deleteThreadMessage).toHaveBeenCalledWith(r2);
  });

  it('closes an ask on the parent from inside its Thread', async () => {
    const ask = { ...parent, kind: 'nudge' as const };
    const { getByRole, d } = await renderThread({ contactId: 'c1', parentId: 'p1' }, { threadMessages: [ask, r1] });
    await fireEvent.press(getByRole('button', { name: 'I followed up' }));
    expect(d.closeAsk).toHaveBeenCalledWith(ask);
  });

  it('offers no reply box to someone who cannot write', async () => {
    const { queryByLabelText } = await renderThread({ contactId: 'c1', parentId: 'p1' }, {}, { uid: 'v1', role: 'viewer' });
    expect(queryByLabelText('Reply in thread')).toBeNull();
  });

  const roster = [
    { uid: 'ruth', displayName: 'Ruth Chen', role: 'admin' },
    { uid: 'sam', displayName: 'Sam Lee', role: 'manager' },
  ];

  const openMentions = async (input: unknown) => {
    await fireEvent.changeText(input as never, '@');
    await fireEvent(input as never, 'selectionChange', { nativeEvent: { selection: { start: 1, end: 1 } } });
  };

  it('offers only Full-timers as @mentions in the Full-timers stream (ADR 0007)', async () => {
    const { getByLabelText, queryByLabelText } = await renderThread(
      { contactId: 'c1', parentId: 'tp', team: true },
      { threadMessages: [teamParent], teamMembers: roster },
      { uid: 'tony', role: 'admin' },
    );
    await openMentions(getByLabelText('Reply in thread'));
    expect(getByLabelText('@Ruth Chen')).toBeTruthy();
    expect(queryByLabelText('@Sam Lee')).toBeNull();
  });

  it('offers any teammate as @mentions on a Conversation', async () => {
    const { getByLabelText } = await renderThread(
      { contactId: 'c1', parentId: 'p1' },
      { teamMembers: roster },
    );
    await openMentions(getByLabelText('Reply in thread'));
    expect(getByLabelText('@Ruth Chen')).toBeTruthy();
    expect(getByLabelText('@Sam Lee')).toBeTruthy();
  });
});
