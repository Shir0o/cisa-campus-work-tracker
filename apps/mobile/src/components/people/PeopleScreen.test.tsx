// #1800, ADR 0047: on the phone The Journey is People narrowed by Step. The
// screen runs on the real usePeopleData and core helpers; only the Firestore
// feeds, auth and the sheets are stubbed.
import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import type { Contact, Stage } from '@cisa/core';
import { ThemeProvider } from '../../theme/ThemeProvider';
import { PeopleScreen } from './PeopleScreen';

let mockRole = 'admin';
jest.mock('../../lib/AuthProvider', () => ({
  useAuth: () => ({ uid: 'u1', user: { displayName: 'Tony' }, role: mockRole }),
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => true }),
}));

const contact = (id: string, name: string, stage: string): Contact => ({
  id,
  name,
  stage,
  location: '',
  email: '',
  phone: '',
  lastSeen: '',
  initials: name.slice(0, 1),
  createdBy: 'u1',
});

const mockContacts: Contact[] = [
  contact('a', 'Ana Lee', 'New'),
  contact('b', 'Ben Cho', 'New'),
  contact('c', 'Cal Diaz', 'Regular'),
  contact('d', 'Dee Fox', ''),
];
const mockStages: Stage[] = [
  { id: 's1', label: 'New', order: 1, color: '' },
  { id: 's2', label: 'Regular', order: 2, color: '' },
];

jest.mock('../../lib/data/contacts', () => ({
  subscribeContacts: jest.fn((cb: (c: Contact[]) => void) => {
    cb(mockContacts);
    return () => undefined;
  }),
  subscribeStages: jest.fn((cb: (s: Stage[]) => void) => {
    cb(mockStages);
    return () => undefined;
  }),
  subscribeTouches: jest.fn((cb: (t: unknown[]) => void) => {
    cb([]);
    return () => undefined;
  }),
  moveContactStage: jest.fn(),
}));

jest.mock('../../lib/data/userPreferences', () => ({
  subscribeUserPreferences: jest.fn((_uid: string, cb: (p: { personalContactIds: string[] }) => void) => {
    cb({ personalContactIds: ['a'] });
    return () => undefined;
  }),
}));

jest.mock('../../lib/firebase', () => ({
  handleFirestoreError: jest.fn(),
  OperationType: { LIST: 'list' },
}));

// No skeleton hold: the data is already there.
jest.mock('../../lib/useMinLoading', () => ({
  useMinLoading: (loading: boolean) => loading,
}));

jest.mock('../log/LogSheet', () => ({ LogSheet: () => null }));
jest.mock('../journey/MoveStepSheet', () => ({ MoveStepSheet: () => null }));

const renderPeople = () =>
  render(
    <ThemeProvider>
      <PeopleScreen />
    </ThemeProvider>,
  );

describe('PeopleScreen Step pills (#1800)', () => {
  beforeEach(() => {
    mockRole = 'admin';
  });

  it('opens on Everyone, with everybody listed and no Move bars', async () => {
    const { getByLabelText, getByText, queryByText } = await renderPeople();

    expect(getByLabelText('Everyone, 4').props.accessibilityState).toEqual({ selected: true });
    for (const name of ['Ana Lee', 'Ben Cho', 'Cal Diaz', 'Dee Fox']) expect(getByText(name)).toBeTruthy();
    expect(queryByText('Move a step')).toBeNull();
  });

  it('orders the pills Everyone, Not on a step, then each Step', async () => {
    const { getAllByRole } = await renderPeople();

    const pills = getAllByRole('button')
      .map((b) => b.props.accessibilityLabel as string | undefined)
      .filter((label) => label && /, \d+$/.test(label));
    expect(pills).toEqual(['Everyone, 4', 'Not on a step, 1', 'New, 2', 'Regular, 1']);
  });

  it("narrows to a Step's people on tap, each with Move a step", async () => {
    const { getByLabelText, getByText, getAllByText, queryByText } = await renderPeople();

    await fireEvent.press(getByLabelText('New, 2'));

    expect(getByText('Ana Lee')).toBeTruthy();
    expect(getByText('Ben Cho')).toBeTruthy();
    expect(queryByText('Cal Diaz')).toBeNull();
    expect(queryByText('Dee Fox')).toBeNull();
    expect(getAllByText('Move a step')).toHaveLength(2);
  });

  it('shows a Student no pills and no Move', async () => {
    mockRole = 'operator';
    const { getByText, queryByLabelText, queryByText } = await renderPeople();

    expect(getByText('Ana Lee')).toBeTruthy();
    expect(queryByLabelText('Everyone, 4')).toBeNull();
    expect(queryByText('New')).toBeNull();
    expect(queryByText('Move a step')).toBeNull();
  });

  it('narrows within the selected pill on search, and the counts follow', async () => {
    const { getByLabelText, getByPlaceholderText, getByText, queryByText } = await renderPeople();

    await fireEvent.press(getByLabelText('New, 2'));
    await fireEvent.changeText(getByPlaceholderText('Find someone by name, major, hall…'), 'ana');

    expect(getByText('Ana Lee')).toBeTruthy();
    expect(queryByText('Ben Cho')).toBeNull();
    expect(getByLabelText('Everyone, 1')).toBeTruthy();
    expect(getByLabelText('New, 1').props.accessibilityState).toEqual({ selected: true });
    expect(getByLabelText('Regular, 0')).toBeTruthy();
  });
});
