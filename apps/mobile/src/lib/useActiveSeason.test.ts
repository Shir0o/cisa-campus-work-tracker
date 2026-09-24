import { act, renderHook } from '@testing-library/react-native';
import { useActiveSeason } from './useActiveSeason';
import { saveSeasonSettings } from './data/seasons';
import type { SeasonSettings } from '@cisa/core';

jest.mock('./data/seasons', () => ({
  subscribeSeasonSettings: jest.fn(() => () => {}),
  saveSeasonSettings: jest.fn(() => Promise.resolve()),
}));

const mockedSubscribe = jest.requireMock('./data/seasons').subscribeSeasonSettings as jest.Mock;
const mockedSave = saveSeasonSettings as jest.Mock;

const emit = async (settings: SeasonSettings) => {
  const cb = mockedSubscribe.mock.calls[0][0];
  await act(() => cb(settings));
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('useActiveSeason', () => {
  it('exposes bfa off by default and omits the BFA tag', async () => {
    const { result } = await renderHook(() => useActiveSeason());
    expect(result.current.bfa).toBe(false);
    expect(result.current.tags).not.toContain('BFA');
  });

  it('includes the BFA tag when the bfa setting is on', async () => {
    const { result } = await renderHook(() => useActiveSeason());
    await emit({ bfa: true });
    expect(result.current.bfa).toBe(true);
    expect(result.current.tags).toContain('BFA');
  });

  it('toggleBfa writes the inverse flag', async () => {
    const { result } = await renderHook(() => useActiveSeason());
    await act(() => result.current.toggleBfa());
    expect(mockedSave).toHaveBeenLastCalledWith({ bfa: true });
  });
});