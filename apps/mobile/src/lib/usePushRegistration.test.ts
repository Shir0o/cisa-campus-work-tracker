// The push token is a device-level registration that must land on the REAL
// signed-in user's doc — never on the effective/impersonated persona doc
// (e.g. `users/cisa-student`), which firestore.rules rightly denies and which
// would mis-route notifications to a fake account.
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { usePushRegistration } from './usePushRegistration';

type TestState = { uid: string | null; user: { uid: string } | null };

jest.mock('./AuthProvider', () => ({
  useAuth: () => (globalThis as unknown as { __cisaPushAuth: TestState }).__cisaPushAuth,
}));

jest.mock('./notifications', () => ({
  registerForPushToken: jest.fn(),
}));

jest.mock('./data/users', () => ({
  setPushToken: jest.fn(),
}));

import { registerForPushToken } from './notifications';
import { setPushToken } from './data/users';

const authState: TestState = { uid: 'real-uid-1', user: { uid: 'real-uid-1' } };
(globalThis as unknown as { __cisaPushAuth: TestState }).__cisaPushAuth = authState;

describe('usePushRegistration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    authState.uid = 'real-uid-1';
    authState.user = { uid: 'real-uid-1' };
    (registerForPushToken as jest.Mock).mockResolvedValue('ExponentPushToken[abc123]');
  });

  it('registers the token on the real auth uid, not the effective uid', async () => {
    authState.uid = 'cisa-student';
    renderHook(() => usePushRegistration());

    await waitFor(() => expect(setPushToken).toHaveBeenCalledTimes(1));
    expect(setPushToken).toHaveBeenCalledWith('real-uid-1', 'ExponentPushToken[abc123]');
  });

  it('registers on the real auth uid when no effective override exists', async () => {
    renderHook(() => usePushRegistration());

    await waitFor(() => expect(setPushToken).toHaveBeenCalledTimes(1));
    expect(setPushToken).toHaveBeenCalledWith('real-uid-1', 'ExponentPushToken[abc123]');
  });

  it('skips registration when signed out', async () => {
    authState.uid = null;
    authState.user = null;
    renderHook(() => usePushRegistration());

    await act(async () => {});
    expect(setPushToken).not.toHaveBeenCalled();
  });

  it('skips registration when no token could be minted', async () => {
    (registerForPushToken as jest.Mock).mockResolvedValue(null);
    renderHook(() => usePushRegistration());

    await act(async () => {});
    expect(setPushToken).not.toHaveBeenCalled();
  });
});
