import { describe, expect, it, beforeEach, jest } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { render, fireEvent } from '@testing-library/react-native';
import { RELEASES } from '@cisa/core';
import { ThemeProvider } from '../../theme/ThemeProvider';
import { M2Release } from './M2Release';
import { initReleaseStore, markReleaseSeen } from '../../lib/releases';

// The v2 theme imports ThemeProvider → AuthProvider → firebase; M2Release only
// needs the theme tokens, so break the chain at AuthProvider like other v2
// component tests do.
jest.mock('../../lib/AuthProvider', () => ({
  useAuth: () => ({ uid: 'user1', user: null, role: 'admin' }),
}));

const renderRelease = (props: Parameters<typeof M2Release>[0]) =>
  render(
    <ThemeProvider>
      <M2Release {...props} />
    </ThemeProvider>,
  );

beforeEach(async () => {
  await AsyncStorage.clear();
  await initReleaseStore();
});

describe('M2Release', () => {
  it('shows nothing when there is no release to show', async () => {
    await markReleaseSeen(RELEASES[0].version);
    const tree = renderRelease({ role: 'admin', inWindow: false });
    expect(tree.queryByText('A few things are different')).toBeNull();
  });

  it('shows the sheet once for an unseen release and stamps it on dismiss', async () => {
    const tree = renderRelease({ role: 'admin', inWindow: false });
    expect(tree.getByText('A few things are different')).toBeTruthy();
    expect(tree.getByText('Carry on')).toBeTruthy();

    fireEvent.press(tree.getByText('Carry on'));
    expect(tree.queryByText('A few things are different')).toBeNull();
    const stored = JSON.parse((await AsyncStorage.getItem('cisa.release.v1')) ?? '{}');
    expect(stored.version).toBe(RELEASES[0].version);
  });

  it('holds the sheet back while the on-campus window is open', async () => {
    const tree = renderRelease({ role: 'admin', inWindow: true });
    expect(tree.queryByText('A few things are different')).toBeNull();
  });

  it('opens on-demand when forceOpen is true even if already seen', async () => {
    await markReleaseSeen(RELEASES[0].version);
    const onClose = jest.fn();
    const tree = renderRelease({ role: 'admin', forceOpen: true, onClose });
    expect(tree.getByText('A few things are different')).toBeTruthy();

    fireEvent.press(tree.getByText('Carry on'));
    expect(onClose).toHaveBeenCalled();
  });
});