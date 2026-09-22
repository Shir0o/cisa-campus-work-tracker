import { act, renderHook, waitFor } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';
import { usePushRegistration } from './usePushRegistration';

type TestState = { uid: string | null; user: { uid: string } | null };

let mockAppStateCallback: ((state: AppStateStatus) => void) | null = null;

jest.mock('./AuthProvider', () => ({
  useAuth: () => (globalThis as unknown as { __cisaPushAuth: TestState }).__cisaPushAuth,
}));

jest.mock('./notifications', () => ({
  registerForPushToken: jest.fn(),
}));

jest.mock('./data/users', () => ({
  registerPushDevice: jest.fn(),
}));

import { registerForPushToken } from './notifications';
import { registerPushDevice } from './data/users';

const authState: TestState = { uid: 'real-uid-1', user: { uid: 'real-uid-1' } };
(globalThis as unknown as { __cisaPushAuth: TestState }).__cisaPushAuth = authState;

describe('usePushRegistration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAppStateCallback = null;
    jest.spyOn(AppState, 'addEventListener').mockImplementation((event: string, cb: any) => {
      if (event === 'change') {
        mockAppStateCallback = cb;
      }
      return {
        remove: jest.fn(() => {
          if (mockAppStateCallback === cb) mockAppStateCallback = null;
        }),
      } as any;
    });
    authState.uid = 'real-uid-1';
    authState.user = { uid: 'real-uid-1' };
    (registerForPushToken as jest.Mock).mockResolvedValue('ExponentPushToken[abc123]');
  });

  it('registers the token on the real auth uid, not the effective uid', async () => {
    authState.uid = 'cisa-student';
    await renderHook(() => usePushRegistration());

    await waitFor(() => expect(registerPushDevice).toHaveBeenCalledTimes(1));
    expect(registerPushDevice).toHaveBeenCalledWith('real-uid-1', 'ExponentPushToken[abc123]');
  });

  it('registers on the real auth uid when no effective override exists', async () => {
    await renderHook(() => usePushRegistration());

    await waitFor(() => expect(registerPushDevice).toHaveBeenCalledTimes(1));
    expect(registerPushDevice).toHaveBeenCalledWith('real-uid-1', 'ExponentPushToken[abc123]');
  });

  it('skips registration when signed out', async () => {
    authState.uid = null;
    authState.user = null;
    await renderHook(() => usePushRegistration());

    await act(async () => {});
    expect(registerPushDevice).not.toHaveBeenCalled();
  });

  it('skips registration when no token could be minted', async () => {
    (registerForPushToken as jest.Mock).mockResolvedValue(null);
    await renderHook(() => usePushRegistration());

    await act(async () => {});
    expect(registerPushDevice).not.toHaveBeenCalled();
  });

  it('re-registers token when AppState transitions to active', async () => {
    await renderHook(() => usePushRegistration());

    await waitFor(() => expect(registerPushDevice).toHaveBeenCalledTimes(1));
    expect(registerPushDevice).toHaveBeenCalledWith('real-uid-1', 'ExponentPushToken[abc123]');

    (registerForPushToken as jest.Mock).mockResolvedValue('ExponentPushToken[fresh456]');

    // Simulate app returning to foreground
    await act(async () => {
      if (mockAppStateCallback) {
        mockAppStateCallback('active');
      }
    });

    await waitFor(() => expect(registerPushDevice).toHaveBeenCalledWith('real-uid-1', 'ExponentPushToken[fresh456]'));
  });
});
