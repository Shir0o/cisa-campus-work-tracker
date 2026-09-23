jest.mock('./notifications', () => ({ registerForPushToken: jest.fn() }));
jest.mock('./data/users', () => ({ registerPushDevice: jest.fn(), unregisterPushDevice: jest.fn() }));

import { registerForPushToken } from './notifications';
import { registerPushDevice, unregisterPushDevice } from './data/users';
import { forgetPushDevice, syncPushToken } from './pushRegistration';

describe('pushRegistration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (registerForPushToken as jest.Mock).mockResolvedValue('ExponentPushToken[p1]');
  });

  it('registers this phone as one of the account\'s devices', async () => {
    expect(await syncPushToken('u1')).toBe('ExponentPushToken[p1]');
    expect(registerPushDevice).toHaveBeenCalledWith('u1', 'ExponentPushToken[p1]');
  });

  it('on sign-out, forgets this phone so the next person on it gets none of your alerts', async () => {
    await forgetPushDevice('u1');
    expect(unregisterPushDevice).toHaveBeenCalledWith('u1', 'ExponentPushToken[p1]');
  });

  it('never blocks sign-out when there is no token or the delete fails', async () => {
    (registerForPushToken as jest.Mock).mockResolvedValueOnce(null);
    await expect(forgetPushDevice('u1')).resolves.toBeUndefined();
    expect(unregisterPushDevice).not.toHaveBeenCalled();

    (unregisterPushDevice as jest.Mock).mockRejectedValueOnce(new Error('offline'));
    jest.spyOn(console, 'error').mockImplementation(() => {});
    await expect(forgetPushDevice('u1')).resolves.toBeUndefined();
  });
});
