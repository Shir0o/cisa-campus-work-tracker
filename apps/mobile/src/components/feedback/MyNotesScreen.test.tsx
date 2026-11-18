import React from 'react';
import { render } from '@testing-library/react-native';
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

const note = (over: Record<string, unknown>) => ({
  id: 'n1',
  userId: 'm-uid-1',
  userName: 'Mobile User',
  type: 'enhancement',
  kind: 'idea',
  message: 'Idea message',
  status: 'new',
  createdAt: '2026-01-02T00:00:00.000Z',
  ...over,
});

const renderScreen = async (data: any) => {
  (globalThis as unknown as { __notesData: any }).__notesData = data;
  return await render(
    <ThemeProvider>
      <MyNotesScreen />
    </ThemeProvider>,
  );
};

describe('MyNotesScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders each note’s kind, message and date', async () => {
    const { getByText } = await renderScreen({ notes: [note({ kind: 'idea' })], loading: false, error: null });
    expect(getByText('Idea message')).toBeTruthy();
    expect(getByText('An idea')).toBeTruthy();
  });

  it('shows the canned sentence for an outcome, never a PR-written one', async () => {
    const { getByText, queryByText } = await renderScreen({
      notes: [note({ outcome: 'shipped', outcomeMessage: 'A sentence a pull request wrote.' })],
      loading: false,
      error: null,
    });
    expect(getByText('Shipped')).toBeTruthy();
    expect(getByText(/This shipped! Thank you/)).toBeTruthy();
    expect(queryByText('A sentence a pull request wrote.')).toBeNull();
  });

  it('shows the canned sentence for every outcome', async () => {
    const { getByText } = await renderScreen({
      notes: [
        note({ id: 'n1', outcome: 'shipped' }),
        note({ id: 'n2', outcome: 'not-planned' }),
        note({ id: 'n3', outcome: 'already-there' }),
      ],
      loading: false,
      error: null,
    });
    expect(getByText('Shipped')).toBeTruthy();
    expect(getByText(/aren't planning to build it right now/)).toBeTruthy();
    expect(getByText(/already in the app/)).toBeTruthy();
  });

  it('shows the "no news yet" state for a note without an outcome', async () => {
    const { getByText } = await renderScreen({ notes: [note({ outcome: undefined })], loading: false, error: null });
    expect(getByText('No news yet')).toBeTruthy();
  });

  it('shows the empty state when there are no notes', async () => {
    const { getByText } = await renderScreen({ notes: [], loading: false, error: null });
    expect(getByText(/haven't sent a report yet/)).toBeTruthy();
  });

  it('surfaces a load error instead of an empty list', async () => {
    const { getByText } = await renderScreen({ notes: [], loading: false, error: "Couldn't load your notes." });
    expect(getByText(/Couldn't load your notes/)).toBeTruthy();
  });

  it('offers no reply thread — replies are cut', async () => {
    const { queryByText, queryByRole } = await renderScreen({
      notes: [note({ awaitingReply: false, replyCount: 2 })],
      loading: false,
      error: null,
    });
    expect(queryByRole('button', { name: /Replies/ })).toBeNull();
    expect(queryByText('The team replied')).toBeNull();
  });
});
