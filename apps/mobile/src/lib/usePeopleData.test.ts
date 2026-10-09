// #1411: the phone People page's last-touch feed must carry the same
// role/tie read scope as its contacts. Without it a Trainee asks for the
// collection-group touches feed, which the rules deny, and the page shows
// "Couldn't load touches." The Journey hook already passes the scope; the two
// must not diverge.
import { renderHook } from '@testing-library/react-native';
import { usePeopleData } from './usePeopleData';
import { subscribeContacts, subscribeTouches } from './data/contacts';

jest.mock('./data/contacts', () => ({
  subscribeContacts: jest.fn(() => () => undefined),
  subscribeStages: jest.fn(() => () => undefined),
  subscribeTouches: jest.fn(() => () => undefined),
}));

jest.mock('./data/userPreferences', () => ({
  subscribeUserPreferences: jest.fn(() => () => undefined),
}));

jest.mock('./firebase', () => ({
  handleFirestoreError: jest.fn(),
  OperationType: { LIST: 'list' },
}));

const mockSubscribeContacts = subscribeContacts as unknown as jest.Mock;
const mockSubscribeTouches = subscribeTouches as unknown as jest.Mock;

describe('usePeopleData read scope (#1411)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('passes the reader scope to the touches feed, as it already does to contacts', async () => {
    await renderHook(() => usePeopleData('trainee1', 'manager'));

    expect(mockSubscribeContacts).toHaveBeenCalledWith(
      expect.any(Function),
      expect.any(Function),
      { role: 'manager', staffId: 'trainee1' },
    );
    expect(mockSubscribeTouches).toHaveBeenCalledWith(
      expect.any(Function),
      expect.any(Function),
      { role: 'manager', staffId: 'trainee1' },
    );
  });

  it('carries the scope for readers who see every person, so core keeps their feed', async () => {
    await renderHook(() => usePeopleData('admin1', 'admin'));

    expect(mockSubscribeTouches).toHaveBeenCalledWith(
      expect.any(Function),
      expect.any(Function),
      { role: 'admin', staffId: 'admin1' },
    );
  });
});
