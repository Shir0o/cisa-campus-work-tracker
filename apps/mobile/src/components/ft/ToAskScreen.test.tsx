import React from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { fireEvent, render } from '@testing-library/react-native';
import type { ToAskGroup, ToAskLine, ToAskView } from '@cisa/core';
import { ThemeProvider } from '../../theme/ThemeProvider';
import { ToAskScreen } from './ToAskScreen';
import { useToAskData } from '../../lib/useToAskData';
import {
  deleteToAskOverride,
  dismissToAskLine,
  postToAskLineUpdate,
  saveToAskNotepad,
  setToAskAskedAt,
} from '../../lib/data/toAsk';
import { addInteraction } from '../../lib/data/interactions';
import { addThreadMessage } from '../../lib/data/threads';

jest.mock('../../lib/AuthProvider', () => ({
  useAuth: () => ({
    uid: 'ft-1',
    user: { uid: 'ft-1', displayName: 'Jae Park', email: 'jae@example.org', photoURL: null },
    role: 'admin',
    isImpersonating: false,
  }),
}));

jest.mock('../../lib/useToAskData', () => ({ useToAskData: jest.fn() }));
jest.mock('../../lib/data/toAsk', () => ({
  dismissToAskLine: jest.fn().mockResolvedValue(undefined),
  postToAskLineUpdate: jest.fn().mockResolvedValue(undefined),
  saveToAskNotepad: jest.fn().mockResolvedValue(undefined),
  setToAskAskedAt: jest.fn().mockResolvedValue(undefined),
  setToAskRewording: jest.fn().mockResolvedValue(undefined),
  deleteToAskOverride: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../lib/data/interactions', () => ({ addInteraction: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../../lib/data/threads', () => ({ addThreadMessage: jest.fn().mockResolvedValue(undefined) }));

// The real sheet drives a native modal; this one shows its content and footer
// while open, which is all the screen's behaviour needs.
jest.mock('../ui/Sheet', () => {
  const { View } = jest.requireActual('react-native');
  return {
    Sheet: ({ visible, children, footer }: { visible: boolean; children: React.ReactNode; footer?: React.ReactNode }) =>
      visible ? (
        <View>
          {children}
          {footer}
        </View>
      ) : null,
  };
});

// The library hides its action panel from touches until a real drag opens it,
// which a test cannot do; this stand-in lays the panel out where it can be pressed.
jest.mock('react-native-gesture-handler/ReanimatedSwipeable', () => {
  const { View } = jest.requireActual('react-native');
  return {
    __esModule: true,
    default: ({
      children,
      renderRightActions,
    }: {
      children: React.ReactNode;
      renderRightActions: (p: unknown, t: unknown, m: { close: () => void }) => React.ReactNode;
    }) => (
      <View>
        {children}
        {renderRightActions(null, null, { close: () => {} })}
      </View>
    ),
  };
});

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn(), canGoBack: () => true }),
}));

const line = (over: Partial<ToAskLine>): ToAskLine => ({
  key: 'notReached|c1',
  kind: 'notReached',
  text: 'Priya — not reached yet',
  reworded: false,
  state: 'open',
  contactId: 'c1',
  at: '2026-11-01T00:00:00.000Z',
  signal: { kind: 'notReached', contactName: 'Priya', days: 12 } as ToAskLine['signal'],
  updates: [],
  ...over,
});

const group = (over: Partial<ToAskGroup> = {}): ToAskGroup => ({
  id: 'tr-1',
  kind: 'trainee',
  traineeUid: 'tr-1',
  name: 'Zion Park',
  team: 'campus',
  open: 1,
  lines: [line({})],
  ...over,
});

const view = (over: Partial<ToAskView> = {}): ToAskView => ({
  groups: [group()],
  openCount: 1,
  clearedCount: 0,
  topTrainees: [],
  drafted: {},
  dismissed: [],
  ...over,
});

function mockData(v: ToAskView, extra: Record<string, unknown> = {}) {
  (useToAskData as jest.Mock).mockReturnValue({
    view: v,
    notepad: {},
    notepadRef: { current: {} },
    filter: 'all',
    messages: [],
    contactById: new Map([['c1', { id: 'c1', name: 'Priya' }]]),
    loading: false,
    error: null,
    ...extra,
  });
}

const screen = () => (
  <GestureHandlerRootView style={{ flex: 1 }}>
    <ThemeProvider>
      <ToAskScreen />
    </ThemeProvider>
  </GestureHandlerRootView>
);
const renderScreen = () => render(screen());

describe('ToAskScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockData(view());
  });

  it('shows the title, the open count, the group and its line with its chip', async () => {
    const { getByText, getAllByText, getByLabelText } = await renderScreen();

    expect(getByText('To ask')).toBeTruthy();
    // The pill in the header and the count on the group's own header.
    expect(getAllByText('1 open')).toHaveLength(2);
    expect(getByText('Only you see this. What to put to each Trainee next time you see them.')).toBeTruthy();
    expect(getByText('Zion Park')).toBeTruthy();
    expect(getByText('Priya — not reached yet')).toBeTruthy();
    expect(getByText('Not reached yet · added 12 days ago')).toBeTruthy();
    expect(getByLabelText('Add a line for Zion Park…')).toBeTruthy();
  });

  it('says so when there is nothing to ask', async () => {
    mockData(view({ groups: [], openCount: 0 }));
    const { getByText } = await renderScreen();

    expect(getByText(/Nothing to ask yet/)).toBeTruthy();
  });

  it('ticks a line asked, and unticks it again', async () => {
    const { getByLabelText, rerender } = await renderScreen();

    await fireEvent.press(getByLabelText('Mark asked'));
    expect(setToAskAskedAt).toHaveBeenCalledWith('ft-1', 'notReached|c1', expect.any(String));

    mockData(view({ groups: [group({ open: 0, lines: [line({ state: 'asked', askedAt: '2026-11-04T00:00:00.000Z' })] })] }));
    await rerender(screen());
    await fireEvent.press(getByLabelText('Asked — undo'));
    // Never reworded, so there is nothing to keep: the override goes whole.
    expect(deleteToAskOverride).toHaveBeenCalledWith('ft-1', 'notReached|c1');
  });

  it('reveals Update and Dismiss on an open line’s swipe', async () => {
    const { getByLabelText, getByText, getByPlaceholderText } = await renderScreen();

    await fireEvent.press(getByLabelText('Update'));

    expect(getByText('Post an update')).toBeTruthy();
    expect(getByPlaceholderText('What did Zion Park say about Priya?')).toBeTruthy();
    expect(getByLabelText('Dismiss')).toBeTruthy();
  });

  it('saves the team filter to the notepad', async () => {
    const { getByText } = await renderScreen();

    await fireEvent.press(getByText('YP'));

    expect(saveToAskNotepad).toHaveBeenCalledWith('ft-1', { teamFilter: 'yp' });
  });

  it('dismisses with a swipe action, and Undo brings it back', async () => {
    const { getByLabelText, getByText, queryByText } = await renderScreen();

    await fireEvent.press(getByLabelText('Dismiss'));

    expect(dismissToAskLine).toHaveBeenCalledWith('ft-1', {}, 'notReached|c1', expect.any(String));
    expect(getByText('Dismissed Priya. Comes back if anything new happens.')).toBeTruthy();

    await fireEvent.press(getByText('Undo'));
    expect(dismissToAskLine).toHaveBeenLastCalledWith('ft-1', {}, 'notReached|c1', null);
    expect(queryByText('Undo')).toBeNull();
  });

  it('keeps a hand-written line’s dismissal message short', async () => {
    mockData(
      view({
        groups: [
          group({
            lines: [line({ key: 'note:n1', kind: 'handwritten', text: 'Ask about the retreat', contactId: null, signal: null })],
          }),
        ],
      }),
    );
    const { getByLabelText, getByText } = await renderScreen();

    await fireEvent.press(getByLabelText('Dismiss'));

    expect(getByText('Dismissed “Ask about the retreat”.')).toBeTruthy();
  });

  it('lists dismissed lines in a tray, each with Bring back', async () => {
    mockData(
      view({
        groups: [],
        dismissed: [
          {
            key: 'notReached|c1',
            line: line({}),
            groupId: 'tr-1',
            groupKind: 'trainee',
            groupName: 'Zion Park',
            dismissedAt: '2026-11-04T00:00:00.000Z',
          },
        ],
      }),
    );
    const { getByText, queryByText } = await renderScreen();

    expect(queryByText('Bring back')).toBeNull();
    await fireEvent.press(getByText('Dismissed · 1'));
    await fireEvent.press(getByText('Bring back'));

    expect(dismissToAskLine).toHaveBeenCalledWith('ft-1', {}, 'notReached|c1', null);
  });

  it('posts an update on the line and logs it on the contact’s page for the Trainee', async () => {
    const { getByLabelText, getByText, getByPlaceholderText } = await renderScreen();

    await fireEvent.press(getByLabelText('More actions'));
    await fireEvent.press(getByLabelText('Post an update'));
    expect(getByText('For Zion Park')).toBeTruthy();

    // Nothing to post until there is something to say.
    await fireEvent.press(getByText('Post update'));
    expect(postToAskLineUpdate).not.toHaveBeenCalled();

    await fireEvent.changeText(getByPlaceholderText('What did Zion Park say about Priya?'), ' Saw her at lunch ');
    await fireEvent.press(getByLabelText("Priya's page"));
    await fireEvent.press(getByText('Post update'));

    expect(postToAskLineUpdate).toHaveBeenCalledWith(
      'ft-1',
      {},
      'notReached|c1',
      expect.objectContaining({ text: 'Saw her at lunch', dest: 'contact' }),
      { askedAt: expect.any(String) },
    );
    expect(addInteraction).toHaveBeenCalledWith(
      'c1',
      'Priya',
      { content: 'Saw her at lunch', dateTime: expect.any(String), type: 'interaction' },
      { uid: 'ft-1', name: 'Jae Park', photoURL: null },
      { uid: 'tr-1', name: 'Zion Park' },
    );
    expect(addThreadMessage).not.toHaveBeenCalled();
  });

  it('leaves the line un-ticked when “Also tick it asked” is off, and names no reacher in General', async () => {
    mockData(view({ groups: [group({ id: 'general', kind: 'general', traineeUid: null, name: 'General', team: null })] }));
    const { getByLabelText, getByText, getByPlaceholderText } = await renderScreen();

    await fireEvent.press(getByLabelText('More actions'));
    await fireEvent.press(getByLabelText('Post an update'));
    await fireEvent.changeText(getByPlaceholderText('What did you hear about Priya?'), 'Doing well');
    await fireEvent.press(getByLabelText("Priya's page"));
    await fireEvent.press(getByLabelText('Also tick it asked'));
    await fireEvent.press(getByText('Post update'));

    expect(postToAskLineUpdate).toHaveBeenCalledWith('ft-1', {}, 'notReached|c1', expect.anything(), { askedAt: null });
    expect(addInteraction).toHaveBeenCalledWith('c1', 'Priya', expect.anything(), expect.anything(), null);
  });

  it('replies in the Thread to the message an ask line is about', async () => {
    mockData(
      view({
        groups: [
          group({
            lines: [
              line({
                key: 'ask|c1|m1',
                kind: 'ask',
                signal: { kind: 'ask', contactName: 'Priya', days: 4, mine: true } as ToAskLine['signal'],
              }),
            ],
          }),
        ],
      }),
      {
        messages: [
          { id: 'm1', contactId: 'c1', interactionId: 'i9', from: 'ft-1', kind: 'nudge', body: 'text her', at: '2026-11-01T00:00:00.000Z', scope: 'team' },
        ],
      },
    );
    const { getByLabelText, getByText, getByPlaceholderText } = await renderScreen();

    await fireEvent.press(getByLabelText('More actions'));
    await fireEvent.press(getByLabelText('Post an update'));
    await fireEvent.changeText(getByPlaceholderText('What did Zion Park say about Priya?'), 'She is coming');
    await fireEvent.press(getByLabelText('Reply in the Thread'));
    await fireEvent.press(getByText('Post update'));

    expect(addThreadMessage).toHaveBeenCalledWith(
      'c1',
      { interactionId: 'i9', parentId: 'm1', scope: 'team', from: 'ft-1', fromName: 'Jae Park', kind: 'comment', body: 'She is coming' },
      expect.objectContaining({ contactName: 'Priya' }),
    );
    expect(addInteraction).not.toHaveBeenCalled();
  });

  it('shows a posted update under its line', async () => {
    mockData(
      view({
        groups: [
          group({
            lines: [
              line({
                updates: [{ id: 'u1', text: 'Texted her back', at: new Date().toISOString(), dest: 'contact' }],
              }),
            ],
          }),
        ],
      }),
    );
    const { getByText } = await renderScreen();

    expect(getByText('Your update · just now · logged on their page')).toBeTruthy();
    expect(getByText('Texted her back')).toBeTruthy();
  });
});
