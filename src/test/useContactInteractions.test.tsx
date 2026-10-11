import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Interaction } from '../types';

const hoisted = vi.hoisted(() => ({
  subscribe: vi.fn(),
}));

vi.mock('../lib/bnpb', () => ({ subscribeContactInteractions: hoisted.subscribe }));

import { useContactInteractions } from '../hooks/useContactInteractions';

const interaction = (id: string): Interaction =>
  ({ id, userId: 'u1', content: id, dateTime: '2026-09-10', type: 'call' }) as Interaction;

type Listener = (list: Interaction[]) => void;

describe('useContactInteractions', () => {
  let listeners: Record<string, Listener>;
  let unsubscribes: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    listeners = {};
    unsubscribes = {};
    hoisted.subscribe.mockReset();
    hoisted.subscribe.mockImplementation((contactId: string, cb: Listener) => {
      listeners[contactId] = cb;
      unsubscribes[contactId] = vi.fn();
      return unsubscribes[contactId];
    });
  });

  it('shares one live subscription between every consumer of a Contact', () => {
    const a = renderHook(() => useContactInteractions('c1'));
    const b = renderHook(() => useContactInteractions('c1'));
    expect(hoisted.subscribe).toHaveBeenCalledTimes(1);

    act(() => listeners.c1([interaction('i1')]));
    expect(a.result.current.map((i) => i.id)).toEqual(['i1']);
    expect(b.result.current.map((i) => i.id)).toEqual(['i1']);
  });

  it('hands a late consumer the interactions already streamed', () => {
    const a = renderHook(() => useContactInteractions('c1'));
    act(() => listeners.c1([interaction('i1')]));
    const b = renderHook(() => useContactInteractions('c1'));
    expect(b.result.current.map((i) => i.id)).toEqual(['i1']);
    a.unmount();
    b.unmount();
  });

  it('closes the subscription only when the last consumer leaves', () => {
    const a = renderHook(() => useContactInteractions('c1'));
    const b = renderHook(() => useContactInteractions('c1'));
    a.unmount();
    expect(unsubscribes.c1).not.toHaveBeenCalled();
    b.unmount();
    expect(unsubscribes.c1).toHaveBeenCalledTimes(1);
  });

  it('follows a consumer that moves to another Contact', () => {
    const { result, rerender } = renderHook(({ id }) => useContactInteractions(id), {
      initialProps: { id: 'c1' as string | null },
    });
    act(() => listeners.c1([interaction('i1')]));
    expect(result.current).toHaveLength(1);

    rerender({ id: 'c2' });
    expect(unsubscribes.c1).toHaveBeenCalledTimes(1);
    expect(hoisted.subscribe).toHaveBeenCalledTimes(2);
    expect(result.current).toEqual([]);

    rerender({ id: null });
    expect(unsubscribes.c2).toHaveBeenCalledTimes(1);
    expect(result.current).toEqual([]);
  });
});
