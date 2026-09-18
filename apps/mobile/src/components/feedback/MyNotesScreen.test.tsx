import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { MyNotesScreen } from './MyNotesScreen';
import { ThemeProvider } from '../../theme/ThemeProvider';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
}));

jest.mock('../../lib/useMyNotesData', () => ({
  useMyNotesData: () => (globalThis as unknown as { __notesData: any }).__notesData,
}));

jest.mock('../../lib/AuthProvider', () => ({
  useAuth: () => ({ user: { uid: 'm-uid-1', displayName: 'Mobile User' }, uid: 'm-uid-1' }),
}));

let threadCbs: { replies: (r: unknown[]) => void } | undefined;
jest.mock('../../lib/data/feedback', () => ({
  subscribeNoteReplies: (_id: string, cb: (replies: unknown[]) => void) => {
    threadCbs = { replies: cb };
    return () => undefined;
  },
  postReply: jest.fn(),
  editReply: jest.fn(),
}));

const note = (over: Record<string, unknown>) => ({
  id: 'n1',
  userId: 'm-uid-1',
  userName: 'Mobile User',
  userEmail: 'm@example.com',
  type: 'enhancement',
  kind: 'idea',
  message: 'Idea message',
  status: 'new',
  createdAt: '2026-01-02T00:00:00.000Z',
  ...over,
});

const renderScreen = (data: any) => {
  (globalThis as unknown as { __notesData: any }).__notesData = data;
  return render(
    <ThemeProvider>
      <MyNotesScreen />
    </ThemeProvider>,
  );
};

describe('MyNotesScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    threadCbs = undefined;
  });

  it('renders each note’s kind, message and date', () => {
    const { getByText } = renderScreen({ notes: [note({ kind: 'idea' })], loading: false, error: null });
    expect(getByText('Idea message')).toBeTruthy();
    expect(getByText('An idea')).toBeTruthy();
  });

  it('shows the written-at-close outcome message when one exists', () => {
    const { getByText } = renderScreen({
      notes: [note({ outcome: 'shipped', outcomeMessage: 'It shipped, thanks to you!' })],
      loading: false,
      error: null,
    });
    expect(getByText('Shipped')).toBeTruthy();
    expect(getByText('It shipped, thanks to you!')).toBeTruthy();
  });

  it('falls back to the canned sentence for an outcome without a message', () => {
    const { getByText } = renderScreen({
      notes: [note({ outcome: 'not-planned', outcomeMessage: undefined })],
      loading: false,
      error: null,
    });
    expect(getByText('Not planned')).toBeTruthy();
    expect(getByText(/aren't planning to build it right now/)).toBeTruthy();
  });

  it('shows the "no news yet" state for a note without an outcome', () => {
    const { getByText } = renderScreen({ notes: [note({ outcome: undefined })], loading: false, error: null });
    expect(getByText('No news yet')).toBeTruthy();
  });

  it('shows the empty state when there are no notes', () => {
    const { getByText } = renderScreen({ notes: [], loading: false, error: null });
    expect(getByText(/haven't left a note yet/)).toBeTruthy();
  });

  it('surfaces a load error instead of an empty list', () => {
    const { getByText } = renderScreen({ notes: [], loading: false, error: "Couldn't load your notes." });
    expect(getByText(/Couldn't load your notes/)).toBeTruthy();
  });

  it('expands a thread and shows laundered team replies', () => {
    const { getByText, getByRole } = renderScreen({ notes: [note({})], loading: false, error: null });

    fireEvent.press(getByRole('button', { name: /Follow-ups/ }));
    act(() => {
      threadCbs?.replies([
        { id: 'r1', authorRole: 'team', body: 'raw team text', launderedBody: 'We looked at this.', createdAt: '2026-01-03T00:00:00.000Z' },
      ]);
    });

    expect(getByText('We looked at this.')).toBeTruthy();
    expect(() => getByText('raw team text')).toThrow();
  });

  it('posts a submitter reply through the server endpoint', async () => {
    const { getByText, getByRole, getByPlaceholderText } = renderScreen({
      notes: [note({})],
      loading: false,
      error: null,
    });

    fireEvent.press(getByRole('button', { name: /Follow-ups/ }));
    act(() => {
      threadCbs?.replies([]);
    });

    fireEvent.changeText(getByPlaceholderText('Write a follow-up…'), 'A question from me');
    fireEvent.press(getByText('Send'));

    await waitFor(() => expect(require('../../lib/data/feedback').postReply).toHaveBeenCalledWith('n1', 'A question from me', 'm-uid-1'));
  });

  it('edits the submitter’s own non-relayed reply', async () => {
    const { getByText, getByRole, getByLabelText, getByPlaceholderText } = renderScreen({
      notes: [note({})],
      loading: false,
      error: null,
    });

    fireEvent.press(getByRole('button', { name: /Follow-ups/ }));
    act(() => {
      threadCbs?.replies([
        { id: 'r1', authorRole: 'submitter', authorId: 'm-uid-1', body: 'my original reply', createdAt: '2026-01-03T00:00:00.000Z' },
      ]);
    });

    fireEvent.press(getByLabelText('Edit'));
    fireEvent.changeText(getByPlaceholderText('Edit your follow-up…'), 'my edited reply');
    fireEvent.press(getByText('Save'));

    await waitFor(() =>
      expect(require('../../lib/data/feedback').editReply).toHaveBeenCalledWith('n1', 'r1', 'my edited reply', 'm-uid-1'),
    );
  });
});