// #1800, ADR 0047: The Journey is no longer a phone screen, but its route stays
// so old deep links land on People.
import React from 'react';
import { render } from '@testing-library/react-native';
import Journey from '../../../app/(tabs)/journey';

const mockRedirect = jest.fn((_props: { href: string }) => null);
jest.mock('expo-router', () => ({
  Redirect: (props: { href: string }) => mockRedirect(props),
}));

describe('the /journey route', () => {
  it('redirects to /people', async () => {
    await render(<Journey />);
    expect(mockRedirect).toHaveBeenCalledWith({ href: '/people' });
  });
});
