import React from 'react';
import { render } from '@testing-library/react-native';
import { Skeleton } from './Skeleton';

describe('Skeleton', () => {
  it('renders an animated placeholder block with the given shape', () => {
    const { getByTestId } = render(<Skeleton style={{ width: 40, height: 40, borderRadius: 13 }} />);
    const block = getByTestId('skeleton');
    expect(block).toBeTruthy();
    expect(block.props.style).toEqual(expect.arrayContaining([{ width: 40, height: 40, borderRadius: 13 }]));
  });
});
