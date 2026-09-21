import { describe, expect, it, beforeEach, jest } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { render, fireEvent, act } from '@testing-library/react-native';
import { ThemeProvider } from '../../theme/ThemeProvider';
import { M2Release } from './M2Release';
import { initReleaseStore, markReleaseSeen, latestAnnouncement, SEEN_RELEASE_KEY } from '../../lib/releases';

// The v2 theme imports ThemeProvider -> AuthProvider -> firebase; M2Release only
// needs the theme tokens, so break the chain at AuthProvider like other v2
// component tests do.
jest.mock('../../lib/AuthProvider', () => ({
  useAuth: () => ({ uid: 'user1', user: null, role: 'admin' }),
}));

const newest = latestAnnouncement('mobile');
const newestId = newest === null ? 'missing' : newest.id;

const renderRelease = async (props: Parameters<typeof M2Release>[0]) =>
  await render(
    <ThemeProvider>
      <M2Release {...props} />
    </ThemeProvider>,
  );

beforeEach(async () => {
  await AsyncStorage.clear();
  await initReleaseStore();
});

describe('M2Release', () => {
  it('shows nothing once the newest release has been seen', async () => {
    await markReleaseSeen(newestId);
    const tree = await renderRelease({ role: 'admin', inWindow: false });
    expect(tree.queryByText('A few things are different')).toBeNull();
  });

  it('shows the nudge once and stamps the release id on dismiss', async () => {
    const tree = await renderRelease({ role: 'admin', inWindow: false });
    expect(tree.getByText('A few things are different')).toBeTruthy();
    expect(tree.getByText('Carry on')).toBeTruthy();

    await act(async () => {
      await fireEvent.press(tree.getByText('Carry on'));
    });
    expect(await AsyncStorage.getItem(SEEN_RELEASE_KEY)).toBe(newestId);
  });

  it('holds the nudge back while the on-campus window is open', async () => {
    const tree = await renderRelease({ role: 'admin', inWindow: true });
    expect(tree.queryByText('A few things are different')).toBeNull();
  });
});
