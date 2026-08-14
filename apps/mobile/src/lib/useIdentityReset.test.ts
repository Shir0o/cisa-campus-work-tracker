import { renderHook } from '@testing-library/react-native';
import { useState } from 'react';
import { useIdentityReset } from './useIdentityReset';

describe('useIdentityReset', () => {
  it('resets once, on the first render after the identity changes', () => {
    const resets: string[] = [];
    const { result, rerender } = renderHook(({ id }: { id: string | null }) => {
      const [value, setValue] = useState('fresh');
      useIdentityReset(id, () => {
        resets.push(id ?? 'null');
        setValue('reset');
      });
      return value;
    }, { initialProps: { id: 'a' } });

    expect(result.current).toBe('fresh');
    expect(resets).toEqual([]);

    rerender({ id: 'b' });
    expect(result.current).toBe('reset');
    expect(resets).toEqual(['b']);

    rerender({ id: 'b' });
    expect(resets).toEqual(['b']);

    rerender({ id: 'a' });
    expect(resets).toEqual(['b', 'a']);
  });

  it('resets when identity goes null (sign-out)', () => {
    const resets: (string | null)[] = [];
    const { rerender } = renderHook(({ id }: { id: string | null }) => {
      useIdentityReset(id, () => {
        resets.push(id);
      });
      return id;
    }, { initialProps: { id: 'a' } });

    rerender({ id: null });
    expect(resets).toEqual([null]);
  });
});
