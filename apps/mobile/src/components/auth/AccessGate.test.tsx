import React from 'react';
import { Text } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import { ThemeProvider } from '../../theme/ThemeProvider';
import { useAuth } from '../../lib/AuthProvider';
import { AccessGate } from './AccessGate';

jest.mock('../../lib/AuthProvider', () => ({ useAuth: jest.fn() }));

const logOut = jest.fn();
const asUser = (over: Record<string, unknown>) =>
  (useAuth as jest.Mock).mockReturnValue({
    user: { uid: 'u1' },
    uid: 'u1',
    role: 'admin',
    isApproved: true,
    logOut,
    ...over,
  });

const renderGate = () =>
  render(
    <ThemeProvider>
      <AccessGate>
        <Text>The app</Text>
      </AccessGate>
    </ThemeProvider>,
  );

describe('AccessGate', () => {
  beforeEach(() => logOut.mockClear());

  it.each(['admin', 'manager'])('lets an approved %s into the app', async (role) => {
    asUser({ role });
    const { getByText, queryByText } = await renderGate();
    expect(getByText('The app')).toBeTruthy();
    expect(queryByText('Access Restricted')).toBeNull();
  });

  // A legacy Student or Community account reads as no role and unapproved:
  // it must not land in the Full-timer shell.
  it('holds a signed-in account with no role on the pending screen', async () => {
    asUser({ role: null, isApproved: false });
    const { getByText, queryByText } = await renderGate();
    expect(queryByText('The app')).toBeNull();
    expect(getByText('Access Restricted')).toBeTruthy();
    expect(getByText('Pending approval')).toBeTruthy();
  });

  it('holds an unapproved Trainee on the pending screen', async () => {
    asUser({ role: 'manager', isApproved: false });
    const { getByText, queryByText } = await renderGate();
    expect(queryByText('The app')).toBeNull();
    expect(getByText('Pending approval')).toBeTruthy();
  });

  it('lets a held account sign out', async () => {
    asUser({ role: null, isApproved: false });
    const { getByText } = await renderGate();
    await fireEvent.press(getByText('Log out'));
    expect(logOut).toHaveBeenCalled();
  });

  it('stays out of the way while signed out, so login and the public form render', async () => {
    asUser({ user: null, uid: null, role: null, isApproved: false });
    const { getByText } = await renderGate();
    expect(getByText('The app')).toBeTruthy();
  });
});
