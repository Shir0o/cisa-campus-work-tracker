// The phone contact-screen Pray sheet writes through this hook. A prayer
// written there belongs to the contact, not the team: it must ask the data
// layer to save `teamPrayer: false`, or the person surfaces on "On our hearts"
// (#1406 — the phone's version of the web contact-tab fix in #1042).
import { act, renderHook } from '@testing-library/react-native';
import { useContactDetailData } from './useContactDetailData';
import { addPrayer } from './data/prayers';
import type { Contact } from '@cisa/core';

jest.mock('./AuthProvider', () => ({
  useAuth: () => ({ uid: 'u1', user: { displayName: 'Mei Tanaka' }, role: 'manager' }),
}));

jest.mock('./firebase', () => ({
  handleFirestoreError: jest.fn(),
  logActivity: jest.fn(),
  OperationType: { LIST: 'list' },
}));

jest.mock('./useFullTimerNames', () => ({ useFullTimerNames: () => [] }));

jest.mock('./data/contacts', () => ({
  addContactCollaborator: jest.fn(),
  removeContactCollaborator: jest.fn(),
  subscribeContact: (_id: string, cb: (c: Contact) => void) => {
    (globalThis as unknown as { __contactCb?: (c: Contact) => void }).__contactCb = cb;
    return () => undefined;
  },
  subscribeStages: () => () => undefined,
}));

jest.mock('./data/interactions', () => ({
  addInteraction: jest.fn(),
  deleteInteraction: jest.fn(),
  subscribeInteractions: () => () => undefined,
}));

jest.mock('./data/prayers', () => ({
  addPrayer: jest.fn(() => Promise.resolve()),
  subscribeContactPrayers: () => () => undefined,
  updatePrayerStatus: jest.fn(),
}));

jest.mock('./data/threads', () => ({
  addThreadMessage: jest.fn(),
  closeFollowUpAsk: jest.fn(),
  deleteThreadMessage: jest.fn(),
  editThreadMessage: jest.fn(),
  subscribeThreads: () => () => undefined,
}));

jest.mock('./data/userPreferences', () => ({ subscribeUserPreferences: () => () => undefined }));
jest.mock('./data/users', () => ({ subscribeUsers: () => () => undefined }));

const mockAddPrayer = addPrayer as unknown as jest.Mock;

describe('useContactDetailData.addPrayer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (globalThis as unknown as { __contactCb?: unknown }).__contactCb = undefined;
  });

  it('saves a Pray-sheet prayer as the contact’s own, off the team page (#1406)', async () => {
    const { result } = await renderHook(() => useContactDetailData('c1'));

    const cb = (globalThis as unknown as { __contactCb?: (c: Contact) => void }).__contactCb;
    await act(() => {
      cb!({ id: 'c1', name: 'Ama Osei' } as Contact);
    });

    await act(async () => {
      await result.current.addPrayer({ burden: 'Peace', context: 'for her dad' });
    });

    expect(mockAddPrayer).toHaveBeenCalledWith(
      { contactId: 'c1', burden: 'Peace\n\nfor her dad', teamPrayer: false },
      expect.objectContaining({ uid: 'u1' }),
    );
  });
});
